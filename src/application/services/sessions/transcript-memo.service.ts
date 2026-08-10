import type { Observation } from '~/app-kernel/observation.ts';

/* 一度パースした `transcript` を、次の周でもう一度読まないためのキャッシュ。

   `transcript` は追記しかされないので、書かれた時刻と大きさが同じなら中身も同じである。
   これをキーにすれば、動いていない `transcript` は開かずに済む。何百とある `transcript` を
   毎周すべて開くと、観るだけの glasshive が機械の負荷になってしまう。

   **覚えるのは読んだテキストではなく、集計した結果である。** テキストのまま覚えると、
   `transcript` 1 つで最大 12MiB を抱えることになり、数千本ある `~/.claude/projects` では
   観る前に機械が音を上げる。集計した後はメタ情報ひとつ・稼働区間 60 本・バケットいくつかで、
   何千本あっても収まる。

   観測できなかったことは覚えない。権利が戻っても、キーが変わるまで読めないままになる。 */

/** キャッシュ 1 件の中身。どの `transcript` のものか、鮮度のキー、集計した結果 */
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
  /** 走査して見えなくなった `transcript` のキャッシュを落とす */
  keepOnly(live: ReadonlySet<string>): void;
}

/** 鮮度のキー。どちらかが違えば、中身も違う */
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
      // キーが同じなら中身も同じ。集計し直す手間も、開く手間も要らない
      if (hit !== undefined && hit.stamp === stamp) return hit.value as Observation<T>;
      const value = await load();
      if (value.kind === 'unobservable') {
        // 古いキャッシュも落とす。キーが違う以上もう当たらず、置いておく意味が無い
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
