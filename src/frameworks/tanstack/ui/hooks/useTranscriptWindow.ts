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

/* いま読んでいる求め。**末尾の追いかけは入れない。**

   追いかけているのは既に画面に出ている会話の続きで、そこに待ちを出すと、変更通知が届くたびに
   読めている会話の上に待ちの表示が出る。待っていることを言うべきなのは、まだ何も出ていない画面と、
   押した人が動きを待っている「もっと前」のほうである。 */
export interface TranscriptWindowReading {
  /** 開いたときの読み取り範囲。ここが真のあいだ、画面にはまだ 1 行も無い */
  readonly initial: boolean;
  /** 「もっと前」を押した後。1 回で 8 歩まで遡ることが在る */
  readonly older: boolean;
}

const NOTHING_READING: TranscriptWindowReading = { initial: false, older: false };

/** 手元に在るバイトの範囲と、`transcript` の大きさ。**分母は読めたページが持ってくる** */
export interface TranscriptWindowHeld {
  readonly bytes: number;
  readonly size: number;
}

export interface TranscriptWindowHandle {
  readonly events: readonly KeyedEvent[];
  /** まだ前が在るか */
  readonly hasOlder: boolean;
  /** 観測できなかった求め。**空の会話と区別する** */
  readonly failed: TranscriptWindowFailures;
  /** 読んでいる最中の求め。**読めなかったのと区別する** */
  readonly reading: TranscriptWindowReading;
  /* 手元に在る範囲。1 ページも読めていないあいだは `null` —— 大きさを観測する前に割合を
     出すと、分母の無い数を割合の顔で出すことになる。 */
  readonly held: TranscriptWindowHeld | null;
  readonly boxRef: React.RefObject<HTMLDivElement | null>;
  readonly loadOlder: () => void;
}

export function useTranscriptWindow(file: string | null): TranscriptWindowHandle {
  const [events, setEvents] = useState<readonly KeyedEvent[]>([]);
  const [windowStart, setWindowStart] = useState(0);
  const [failed, setFailed] = useState<TranscriptWindowFailures>(NOTHING_FAILED);
  const [reading, setReading] = useState<TranscriptWindowReading>(NOTHING_READING);
  /* 読み切れたところと、`transcript` の大きさ。**読めたページから採る** —— `next` は
     書き込み途中の行を含まないので、ここは実際に読み切れたところまでを指す。手元に在る
     範囲のもう一方の端は `windowStart` で、2 つを突き合わせるのは返すときである。 */
  const [held, setHeld] = useState<{ next: number; size: number } | null>(null);
  const nextRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  /* 取りに行っているあいだに変更通知が届いたことを覚えておくフラグ。**取り終えた側が必ず読み直す。**
     変更通知はまとめて配られ、追記は続けて届くので、取っているあいだに次が来るのは
     普通のことである。落とすと、その追記が最後だったときに会話が黙って止まる。 */
  const pendingRef = useRef(false);
  /* もっと前を押されたことを覚えておくフラグ。**取り終えた側が必ず読み直す。**

     末尾を追っているあいだ、このフックの中は 1 つの求めしか通さない —— 重なると、ページが
     互い違いに入ってバイトの計算が合わなくなる。落とすと、押しても何も起きないボタンが、
     「もう前は無い」と見分けの付かない形で残る。しかも塞がっている時間がいちばん長いのは、
     いま誰かが動かしている `transcript` である。 */
  const pendingOlderRef = useRef(false);
  /** 覚えておいた押しを効かせるための、いちばん新しい `loadOlder` */
  const loadOlderRef = useRef<() => void>(() => undefined);
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
    /* どの `transcript` を追っていたか。**例外で終わった側にも要る** —— 求めが投げるのは
       開き直した後のことが在るので、これが無いと、前のファイルの失敗をいま開いている会話の
       ものとして出すことになる。返ってきた答えのほうは `target` と照らしている。 */
    let following: string | null = null;
    try {
      while (pendingRef.current && nextRef.current !== null) {
        const target = openRef.current;
        if (target === null) return;
        following = target;
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
        /* 追記のたびに大きさも取り直す。**分母は動く** —— 読んでいるあいだにも `transcript`
           は伸びるので、開いたときの大きさのままにすると、割合が 100% を超えていく。 */
        setHeld({ next: response.body.next, size: response.body.size });
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
    } catch {
      // 求めが例外で終わったのも、追いかけが返らなかったことである
      if (openRef.current === following) setFailed((current) => ({ ...current, follow: true }));
    } finally {
      loadingRef.current = false;
      // 追っているあいだに押された「もっと前」を、ここで効かせる
      if (pendingOlderRef.current) {
        pendingOlderRef.current = false;
        loadOlderRef.current();
      }
    }
  }, []);

  /* 開いたら末尾の読み取り範囲から。読み終えたら一番下へ落とす。
     会話は末尾がいまなので、上から読ませる理由が無い。 */
  useEffect(() => {
    openRef.current = file;
    pendingRef.current = false;
    // 前の `transcript` で押された「もっと前」を持ち越さない
    pendingOlderRef.current = false;
    /* 開くものが無いなら、読んでいる最中でもない。**先に畳む** —— 前の `transcript` の
       求めが走ったまま閉じると、読むものが無い画面に待ちの表示が残る。 */
    if (file === null) {
      setReading(NOTHING_READING);
      return;
    }
    let alive = true;
    setEvents([]);
    /* 読み取り範囲の先頭も戻す。**前の `transcript` のバイトの位置を持ち越さない。**
       残すと、この 1 度目が返ってこなかったときに「読めなかった」と「もっと前」が
       並んで出て、押すと別のファイルの範囲を取りに行く。 */
    setWindowStart(0);
    setFailed(NOTHING_FAILED);
    /* 手元に在る範囲も戻す。**前の `transcript` の大きさを持ち越さない** —— 残すと、
       この 1 度目が返る前に、別のファイルの大きさを分母にした割合が出る。 */
    setHeld(null);
    setReading({ initial: true, older: false });
    nextRef.current = null;

    /* 求めそのものが投げることも在る —— `getConversation` はサーバーへの往復なので、
       繋がりが切れれば `Promise` は答えではなく例外で終わる。**そこを受けそこねると、
       読んでいる最中の表示が永久に残る** —— 読めなかったことが、まだ読んでいることになる。 */
    void (async () => {
      try {
        const response = await fetchConversation(file, null, null);
        if (!alive) return;
        if (!response.ok || response.body.state === 'unobservable') {
          setFailed((current) => ({ ...current, initial: true }));
          return;
        }
        setEvents(keyed(response.body.start, response.body.events));
        setWindowStart(response.body.start);
        setHeld({ next: response.body.next, size: response.body.size });
        nextRef.current = response.body.next;
        requestAnimationFrame(() => {
          const box = boxRef.current;
          if (box !== null) box.scrollTop = box.scrollHeight;
        });
        // 末尾を取っているあいだに届いた変更通知を拾い直す。届いていなければ `follow` は何もしない
        void follow();
      } catch {
        if (alive) setFailed((current) => ({ ...current, initial: true }));
      } finally {
        if (alive) setReading((current) => ({ ...current, initial: false }));
      }
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
    /* 読むものが無い。覚えておいた押しがここへ来ることも在るので、待ちは畳んでおく */
    if (file === null || windowStart === 0) {
      setReading((current) => (current.older ? { ...current, older: false } : current));
      return;
    }
    /* いま塞がっているなら、押されたことを覚えて戻る。**待ちは押した時点で出す** ——
       効くのが一拍後でも、押した人から見て何も変わらない間が在ってはいけない。 */
    if (loadingRef.current) {
      pendingOlderRef.current = true;
      setReading((current) => ({ ...current, older: true }));
      return;
    }
    loadingRef.current = true;
    setReading((current) => ({ ...current, older: true }));
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
      } catch {
        // 求めが例外で終わったのも、観測できなかったことである。黙ると「もう前は無い」に見える
        if (openRef.current === file) setFailed((current) => ({ ...current, older: true }));
      } finally {
        loadingRef.current = false;
        setReading((current) => ({ ...current, older: false }));
        /* 遡っているあいだに届いた変更通知を拾い直す。ここは何歩ぶんも掴んだままなので、
           拾わないと、押した人の画面だけが末尾を追わなくなる。 */
        void follow();
      }
    })();
  }, [file, follow, windowStart]);

  /* `follow` は張り替えないので、最新の `loadOlder` をここから渡す。**`follow` の依存に
     `loadOlder` を足さない** —— 足すと `windowStart` が動くたびに変更通知の購読が張り直り、
     その隙に届いた追記を取り落とす。 */
  useEffect(() => {
    loadOlderRef.current = loadOlder;
  }, [loadOlder]);

  return {
    events,
    hasOlder: windowStart > 0,
    failed,
    reading,
    /* 手元に在るのは、読み取り範囲の先頭から読み切れたところまでである。**大きさを
       観測できていないうちは何も言わない** —— 分母の無い割合は割合ではない。 */
    held: held === null ? null : { bytes: Math.max(0, held.next - windowStart), size: held.size },
    boxRef,
    loadOlder,
  };
}
