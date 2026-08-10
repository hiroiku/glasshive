import { useEffect, useState } from 'react';
import { fetchSearch } from '../../queries/sessions.query.ts';

/* `transcript` の中身の検索。**読めたところから順に画面へ出す。**

   全部を読み切ってから出すと、`transcript` が数百在るプロジェクトでは何秒も何も出ない。
   区切りを順に頼み、当たりが増えるたびに描き直す。並びは新しい順なので、いま関わりの
   深いものから先に出る。

   問い合わせの仕組みには載せない。ページのキーが読み始める位置で、当たりは区切りを
   またいで貯まり、語が変わったら走っている読み取りを捨てる。載せると、キャッシュキーの
   作り直しと貯め込みが取り合いになる。

   どこまで読んだかも返す。読み終える前の結果を全部だと思わせないためで、
   **読み切れなかった回はそこで止まる** — `scanned` が `total` に届かないことが、
   まだ全部を見ていないことを表す。 */

/** 打ち込みが止まるまで待つ時間。1 打鍵ごとに数百の `transcript` を開かせない */
const SETTLE_MS = 350;

/* これより短い語では頼まない。断るのはサーバー側の決まりで、ここに在るのは
   意味の無い往復を省くためだけである。 */
const MIN_QUERY_CHARS = 2;

export interface DeepSearch {
  /** ここまでに中身が当たった `transcript` のパス */
  readonly files: ReadonlySet<string>;
  /** ここまでに開いた本数 */
  readonly scanned: number;
  /** 候補の総数 */
  readonly total: number;
  readonly running: boolean;
}

const IDLE: DeepSearch = {
  files: new Set<string>(),
  scanned: 0,
  total: 0,
  running: false,
};

export function useDeepSearch(projectId: string, query: string): DeepSearch {
  const [state, setState] = useState<DeepSearch>(IDLE);

  useEffect(() => {
    const trimmed = query.trim();
    if (projectId === '' || trimmed.length < MIN_QUERY_CHARS) {
      setState(IDLE);
      return;
    }

    /* 語が変わったら、走っている読み取りは捨てる。返事が届いてから捨てるのでは、
       前の語の当たりが次の語の結果に混ざる。 */
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        // 貯める側と描く側で同じ `Set` を持ち回らない。持ち回ると、描き直さないまま中身が増える
        const found = new Set<string>();
        setState({ files: new Set<string>(), scanned: 0, total: 0, running: true });

        let offset = 0;
        for (;;) {
          const answer = await fetchSearch(projectId, trimmed, offset);
          if (!alive) return;
          // 観測できなかった回は「当たらなかった」ではない。読んだ本数を残したまま止める
          if (!answer.ok || answer.body.state !== 'observed') break;

          const page = answer.body;
          for (const file of page.files) found.add(file);
          // 位置が進まない答えで回り続けない
          const advanced = page.scanned > offset;
          setState({
            files: new Set(found),
            scanned: page.scanned,
            total: page.total,
            running: !page.done && advanced,
          });
          if (page.done || !advanced) return;
          offset = page.scanned;
        }

        setState((previous) => ({ ...previous, running: false }));
      })();
    }, SETTLE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [projectId, query]);

  return state;
}
