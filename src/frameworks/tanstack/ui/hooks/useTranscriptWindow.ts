import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventJson } from '~/interface/presenters/sessions/conversation.presenter.ts';
import { fetchConversation } from '../../queries/sessions.query.ts';
import { subscribeToFile } from './useChangeStream.ts';

/* 会話の読み取り範囲。**ここだけ問い合わせの仕組みに載せない。**

   ページのキーがバイトの位置で、向こう側で境が動く(行の頭へ揃えるので、頼んだ位置と
   読み始めた位置が違う)。変更通知で末尾が伸び、スクロール位置の持ち直しが描画と絡む。
   載せると、キーの作り直しと巻き戻しの取り合いになって、追いかけるたびに位置が飛ぶ。

   だから状態はここが自分で持つ。持つものは 3 つ — 並んでいるイベント、読み取り範囲の
   先頭、次に読む位置。次に読む位置が進まないことが、書き込み途中の行を消費しなかった
   ことを表す。 */

/** 「もっと前」を押したときに遡る量 */
const OLDER_STEP_BYTES = 256 * 1024;

/** 1 回の「もっと前」で遡り直す歩数の上限 */
const OLDER_MAX_STEPS = 8;

/** ここより下まで巻いていたら、追記に合わせて末尾へ吸い付く */
const STICK_THRESHOLD_PX = 80;

/** ページの先頭と通し番号でキーを組む */
const keyed = (start: number, events: readonly EventJson[]): KeyedEvent[] =>
  events.map((event, index) => ({ key: `${start}:${index}`, event }));

/* 並べるときのキー付きのイベント。

   **添字をキーにできない。** 前を読み足すと全部の添字がずれ、React は別のイベントを
   同じものとして扱う(開いていた折り畳みが別の塊に付き替わる)。ページの先頭の位置は
   その向きに 1 度しか読まないので、そこからの通し番号なら重ならない。 */
export interface KeyedEvent {
  readonly key: string;
  readonly event: EventJson;
}

/* どの求めが観測できなかったか。**畳まない。**

   3 つの求めは互いに関係が無い。「もっと前」が返ってこなかった直後に末尾の追いかけが
   成功しても、押した人はまだ前を読めていない。1 つの真偽に畳むと、その成功が失敗を
   黙って消し、逆向きも同じことが起きる。 */
export interface TranscriptWindowFailures {
  /** 開いたときの読み取り範囲 */
  readonly initial: boolean;
  /** 変更通知で末尾を追ったとき */
  readonly follow: boolean;
  /** 「もっと前」を押したとき */
  readonly older: boolean;
}

const NOTHING_FAILED: TranscriptWindowFailures = { initial: false, follow: false, older: false };

export interface TranscriptWindowHandle {
  readonly events: readonly KeyedEvent[];
  /** まだ前が在るか */
  readonly hasOlder: boolean;
  /** 観測できなかった求め。**空の会話と区別する** */
  readonly failed: TranscriptWindowFailures;
  readonly boxRef: React.RefObject<HTMLDivElement | null>;
  readonly loadOlder: () => void;
}

export function useTranscriptWindow(file: string | null): TranscriptWindowHandle {
  const [events, setEvents] = useState<readonly KeyedEvent[]>([]);
  const [windowStart, setWindowStart] = useState(0);
  const [failed, setFailed] = useState<TranscriptWindowFailures>(NOTHING_FAILED);
  const nextRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  /* 取りに行っているあいだに変更通知が届いたことを覚えておくフラグ。**取り終えた側が必ず読み直す。**
     変更通知はまとめて配られ、追記は続けて届くので、取っているあいだに次が来るのは
     普通のことである。落とすと、その追記が最後だったときに会話が黙って止まる。 */
  const pendingRef = useRef(false);
  /* いま開いている `transcript`。返ってきたページをこれと照らして、開き直した後に
     届いた前のファイルのページを捨てる。 */
  const openRef = useRef(file);
  const boxRef = useRef<HTMLDivElement | null>(null);

  /* `transcript` に追記された変更通知で末尾を追う。**次に読む位置から先だけを足す。**
     取り直すと、開いている会話が毎回いちばん下へ跳ぶ。

     取り終えるまでにまた変更通知が届いていたら、そのまま次の周へ進む。追うのはそのときに
     開いている `transcript` で、これを呼んだ時点のものではない。 */
  const follow = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      while (pendingRef.current && nextRef.current !== null) {
        const target = openRef.current;
        if (target === null) return;
        pendingRef.current = false;
        const from = nextRef.current;
        const response = await fetchConversation(target, from, null);
        if (openRef.current !== target) return;
        /* 追いかけが返ってこなかったことも画面へ出す。出さないと、会話が伸びなくなったのが
           エージェントが黙ったからなのか、読めなかったからなのか分からない。 */
        if (!response.ok || response.body.state === 'unobservable') {
          setFailed((current) => ({ ...current, follow: true }));
          return;
        }
        setFailed((current) => ({ ...current, follow: false }));
        // 観測はできたうえで無かった。続きが在りようが無いので、次に読む位置も動かさない
        if (response.body.state !== 'observed') return;
        nextRef.current = response.body.next;
        if (response.body.events.length === 0) continue;

        const box = boxRef.current;
        /* 追い付いて読んでいる人だけを末尾へ連れて行く。上のほうを読んでいる人を
           下へ引きずると、読んでいた場所を見失う。 */
        const stick =
          box !== null && box.scrollHeight - box.scrollTop - box.clientHeight < STICK_THRESHOLD_PX;
        setEvents((current) => [...current, ...keyed(from, response.body.events)]);
        if (stick) {
          requestAnimationFrame(() => {
            if (box !== null) box.scrollTop = box.scrollHeight;
          });
        }
      }
    } finally {
      loadingRef.current = false;
    }
  }, []);

  /* 開いたら末尾の読み取り範囲から。読み終えたら一番下へ落とす。
     会話は末尾がいまなので、上から読ませる理由が無い。 */
  useEffect(() => {
    openRef.current = file;
    pendingRef.current = false;
    if (file === null) return;
    let alive = true;
    setEvents([]);
    /* 読み取り範囲の先頭も戻す。**前の `transcript` のバイトの位置を持ち越さない。**
       残すと、この 1 度目が返ってこなかったときに「読めなかった」と「もっと前」が
       並んで出て、押すと別のファイルの範囲を取りに行く。 */
    setWindowStart(0);
    setFailed(NOTHING_FAILED);
    nextRef.current = null;

    void (async () => {
      const response = await fetchConversation(file, null, null);
      if (!alive) return;
      if (!response.ok || response.body.state === 'unobservable') {
        setFailed((current) => ({ ...current, initial: true }));
        return;
      }
      setEvents(keyed(response.body.start, response.body.events));
      setWindowStart(response.body.start);
      nextRef.current = response.body.next;
      requestAnimationFrame(() => {
        const box = boxRef.current;
        if (box !== null) box.scrollTop = box.scrollHeight;
      });
      // 末尾を取っているあいだに届いた変更通知を拾い直す。届いていなければ `follow` は何もしない
      void follow();
    })();

    return () => {
      alive = false;
    };
  }, [file, follow]);

  /* 変更通知が届いたことは、取りに行けるかどうかと切り離して覚える。取っている最中なら、
     その取得を終えた側が読み直す。 */
  useEffect(() => {
    if (file === null) return;
    return subscribeToFile((changed) => {
      if (changed !== file) return;
      pendingRef.current = true;
      void follow();
    });
  }, [file, follow]);

  /* もっと前を読む。**読む前の「下からの距離」を覚えておき、足した後に戻す。**
     戻さないと、上に足したぶんだけ画面が飛んで、読んでいた行が視界から消える。 */
  const loadOlder = useCallback(() => {
    if (file === null || loadingRef.current || windowStart === 0) return;
    loadingRef.current = true;
    void (async () => {
      try {
        const box = boxRef.current;
        const keep = box === null ? 0 : box.scrollHeight - box.scrollTop;
        let to = windowStart;
        /* 何も読めなかったら、もう一歩遡る。1 行が一歩ぶんより長いと、その一歩には
           行の頭が 1 つも無く、ページが空で返る。押した人には「動かない」としか見えない。 */
        for (let step = 0; step < OLDER_MAX_STEPS && to > 0; step += 1) {
          const from = Math.max(0, to - OLDER_STEP_BYTES);
          const response = await fetchConversation(file, from, to);
          if (openRef.current !== file) return;
          /* 押しても何も足されないことを、「もう前は無い」と読ませない。
             観測できなかったのなら、そう言う。 */
          if (!response.ok || response.body.state === 'unobservable') {
            setFailed((current) => ({ ...current, older: true }));
            return;
          }
          setFailed((current) => ({ ...current, older: false }));
          if (response.body.state !== 'observed') return;
          /* 覚えるのは**頼んだ位置**である。読み始めた位置ではない。跨いだ行を捨てた後の
             位置を覚えると、その行より長い一歩を踏めず、同じ範囲を永久に読み直す。 */
          to = from;
          setWindowStart(from);
          if (response.body.events.length === 0) continue;
          setEvents((current) => [...keyed(response.body.start, response.body.events), ...current]);
          break;
        }
        requestAnimationFrame(() => {
          if (box !== null) box.scrollTop = box.scrollHeight - keep;
        });
      } finally {
        loadingRef.current = false;
        /* 遡っているあいだに届いた変更通知を拾い直す。ここは何歩ぶんも掴んだままなので、
           拾わないと、押した人の画面だけが末尾を追わなくなる。 */
        void follow();
      }
    })();
  }, [file, follow, windowStart]);

  return { events, hasOlder: windowStart > 0, failed, boxRef, loadOlder };
}
