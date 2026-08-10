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

export interface TranscriptWindowHandle {
  readonly events: readonly KeyedEvent[];
  /** まだ前が在るか */
  readonly hasOlder: boolean;
  /** 観測できなかったか。**空の会話と区別する** */
  readonly failed: boolean;
  readonly boxRef: React.RefObject<HTMLDivElement | null>;
  readonly loadOlder: () => void;
}

export function useTranscriptWindow(file: string | null): TranscriptWindowHandle {
  const [events, setEvents] = useState<readonly KeyedEvent[]>([]);
  const [windowStart, setWindowStart] = useState(0);
  const [failed, setFailed] = useState(false);
  const nextRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  /* 開いたら末尾の読み取り範囲から。読み終えたら一番下へ落とす。
     会話は末尾がいまなので、上から読ませる理由が無い。 */
  useEffect(() => {
    if (file === null) return;
    let alive = true;
    setEvents([]);
    setFailed(false);
    nextRef.current = null;

    void (async () => {
      const response = await fetchConversation(file, null, null);
      if (!alive) return;
      if (!response.ok || response.body.state === 'unobservable') {
        setFailed(true);
        return;
      }
      setEvents(keyed(response.body.start, response.body.events));
      setWindowStart(response.body.start);
      nextRef.current = response.body.next;
      requestAnimationFrame(() => {
        const box = boxRef.current;
        if (box !== null) box.scrollTop = box.scrollHeight;
      });
    })();

    return () => {
      alive = false;
    };
  }, [file]);

  /* `transcript` に追記された変更通知で末尾を追う。**次に読む位置から先だけを足す。**
     取り直すと、開いている会話が毎回いちばん下へ跳ぶ。 */
  useEffect(() => {
    if (file === null) return;
    return subscribeToFile(async (changed) => {
      if (changed !== file || loadingRef.current || nextRef.current === null) return;
      loadingRef.current = true;
      try {
        const from = nextRef.current;
        const response = await fetchConversation(file, from, null);
        if (!response.ok || response.body.state !== 'observed') return;
        nextRef.current = response.body.next;
        if (response.body.events.length === 0) return;

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
      } finally {
        loadingRef.current = false;
      }
    });
  }, [file]);

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
          if (!response.ok || response.body.state !== 'observed') return;
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
      }
    })();
  }, [file, windowStart]);

  return { events, hasOlder: windowStart > 0, failed, boxRef, loadOlder };
}
