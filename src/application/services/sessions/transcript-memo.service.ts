import type { Observation } from '~/app-kernel/observation.ts';

/* 一度読み解いた正本を、次の周でもう一度読まないための覚え。

   正本は追記しかされないので、**書かれた時刻と大きさが同じなら中身も同じ**である。
   これを鍵にすれば、動いていない正本は開かずに済む。何百とある正本を毎周すべて開くと、
   観るだけの道具が機械の負荷になってしまう。

   **覚えるのは読んだ字ではなく、畳んだ結果である。** 字のまま覚えると、正本 1 つで
   最大 12MiB を抱えることになり、数千本ある置き場では観る前に機械が音を上げる。
   畳んだ後は見出しひとつ・帯 60 本・桶いくつかで、何千本あっても収まる。

   **見に行けなかったことは覚えない。** 権利が戻っても、鍵が変わるまで読めないままになる。 */

/** 覚えた場所が指す先。どの正本のものか、鮮度の鍵、畳んだ結果 */
interface MemoEntry {
  readonly file: string;
  readonly stamp: string;
  readonly value: Observation<unknown>;
}

export interface TranscriptMemo {
  read<T>(
    key: string,
    file: string,
    stamp: string,
    load: () => Promise<Observation<T>>,
  ): Promise<Observation<T>>;
  /** 歩いて見えなくなった正本の覚えを落とす */
  keepOnly(live: ReadonlySet<string>): void;
}

/** 鮮度の鍵。どちらかが違えば、中身も違う */
export const stampOf = (at: { mtimeMs: number; sizeBytes: number }): string =>
  `${at.mtimeMs}:${at.sizeBytes}`;

export function createTranscriptMemo(): TranscriptMemo {
  const entries = new Map<string, MemoEntry>();

  return {
    async read<T>(
      key: string,
      file: string,
      stamp: string,
      load: () => Promise<Observation<T>>,
    ): Promise<Observation<T>> {
      const hit = entries.get(key);
      // 鍵が同じなら中身も同じ。畳み直す手間も、開く手間も要らない
      if (hit !== undefined && hit.stamp === stamp) return hit.value as Observation<T>;
      const value = await load();
      if (value.kind === 'unobservable') {
        // 古い覚えも落とす。鍵が違う以上もう当たらず、置いておく意味が無い
        entries.delete(key);
        return value;
      }
      entries.set(key, { file, stamp, value });
      return value;
    },

    keepOnly(live) {
      for (const [key, entry] of entries) if (!live.has(entry.file)) entries.delete(key);
    },
  };
}
