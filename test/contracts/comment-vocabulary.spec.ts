import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* コメントとテスト名は日本語で書くが、技術用語を日本語へ訳し直してはいけない。

   訳し直すと、読む人は 2 つ目の語彙を覚えないとコードと突き合わせられなくなる。しかも
   新しいコメントは隣のコメントを真似て書かれるので、1 つ通すと同じ調子が広がる。
   **人が気付くより先に落とすためのガードである。**

   ここで見るのはコメントに限らずファイル全体である。テスト名も `expect` の説明文も同じ
   語彙で書くべきもので、剥がして見る理由が無い。

   一覧に入れているのは、普通の日本語としての用例がこのリポジトリに無い語だけである。
   「場所」「求め」「答え」「番号」「覚え」「畳む」「歩く」「選び」のように普通の文でも
   使う語は入れていない — 動詞の連用形と名詞化した造語を機械では分けられないので、
   そこは書く人が `AGENTS.md` の `## Conventions` に従う。 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SELF = path.join('test', 'contracts', 'comment-vocabulary.spec.ts');

/* 走査する場所。日本語のコメントを持つのはこれだけである。
   `docs/` と `README.md` は英語で、`AGENTS.md` は決まりを書いている側なので見ない。 */
const ROOTS = ['src', 'test', 'scripts', path.join('.github', 'workflows')];

/* 訳語と、代わりに使う語。`allow` はその語を含む普通の熟語で、
   探す前に行から取り除く。 */
const BANNED: readonly { readonly term: string; readonly use: string; readonly allow: string[] }[] =
  [
    { term: '正本', use: '`transcript`', allow: [] },
    { term: '索き', use: 'インデックス', allow: [] },
    { term: '在り処', use: 'パス', allow: [] },
    { term: '顔ぶれ', use: '観測しているエージェント', allow: [] },
    { term: '出来事', use: 'イベント', allow: [] },
    { term: '部品', use: 'コンポーネント', allow: [] },
    { term: '置き場', use: '`~/.claude/projects` / 保存先', allow: ['置き場所'] },
    { term: '読み解', use: 'パース', allow: [] },
    { term: '版', use: 'バージョン', allow: ['出版', '版画', '初版'] },
    { term: '申し出', use: '操作(`TabAction`)/ 入力', allow: [] },
    { term: '推し量り', use: '推測', allow: [] },
    { term: '巣', use: 'プロジェクト', allow: [] },
    {
      term: '道具',
      use: 'glasshive / `git` / プロセス / ツール / ライブラリ / コマンド',
      allow: [],
    },
    { term: '覚え書き', use: '`preferences.json` / `*.meta.json` / メモ', allow: [] },
    { term: '観る人', use: 'ユーザー / クライアント', allow: [] },
    { term: '見張り', use: 'ウォッチャー / リスナー / ガード', allow: [] },
    { term: '合図', use: '変更通知 / マーカー', allow: [] },
    { term: '一手', use: 'メッセージ / `tool_use`', allow: [] },
    { term: '呼び名', use: 'ラベル / 名前 / ベース名', allow: [] },
    { term: '名乗り', use: '`Host` ヘッダー / 自己申告', allow: [] },
    { term: '起動口', use: 'ランチャー', allow: [] },
    { term: '束ね役', use: 'サーバーバンドル', allow: [] },
    { term: '走らせ役', use: 'パッケージマネージャー', allow: [] },
    { term: '配りもの', use: 'パッケージ / ビルド成果物', allow: [] },
    { term: '鍵盤', use: 'キーボード', allow: [] },
    { term: '検め', use: '検証 / 型検査', allow: [] },
    { term: '字面', use: '表記 / 生の文字列', allow: [] },
    { term: '盤面', use: 'スナップショット / 画面', allow: [] },
    { term: '頭数', use: 'エージェントの数', allow: [] },
    { term: '下働き', use: 'ヘルパー', allow: [] },
    { term: '鏡像', use: '対応する構造', allow: [] },
    { term: '頁', use: 'ページ', allow: [] },
    { term: '桶', use: 'バケット', allow: [] },
    { term: '棚', use: 'ディレクトリ / 保存先', allow: [] },
    { term: '机', use: 'タブの並び', allow: [] },
    { term: '格子', use: 'グリッド', allow: [] },
    { term: '様子', use: '状態', allow: [] },
    { term: '枝', use: 'ブランチ', allow: ['枝分かれ'] },
    { term: '口', use: 'ポート', allow: ['入口', '出口', '窓口'] },
    { term: '窓', use: 'パネル / 読み取り範囲 / 期間 / クライアント / 表示範囲', allow: ['窓口'] },
    { term: '道', use: 'ルート / パス / API', allow: ['道具', '道理', '報道'] },
    { term: '帯', use: '稼働区間 / バー / 上部バー', allow: ['時間帯', '携帯'] },
    { term: '席', use: 'タブ', allow: ['出席', '欠席', '座席'] },
    { term: '家', use: '`~`(ホームディレクトリ)', allow: ['国家', '作家', '専門家', '家族'] },
    { term: '門', use: 'ガード', allow: ['専門', '部門', '関門'] },
    {
      term: '器',
      use: 'HTML シェル / `QueryClient` / ブラウザー',
      allow: ['機器', '容器', '器用'],
    },
    { term: '筋', use: 'トラック', allow: ['筋道'] },
    { term: '札', use: 'チップ / ラベル / エラーコード / タグ / 件数', allow: [] },
    {
      term: '印',
      use: '検索パラメータ / ピン留め / 省略記号 / タグ / アイコン',
      allow: ['目印', '矢印', '印刷'],
    },
    {
      term: '段',
      use: '深さ / 階層 / 折り返し',
      allow: ['段落', '段階', '階段', '手段', '値段', '普段', '格段', '一段'],
    },
    {
      term: '字',
      use: '文字列 / テキスト',
      allow: ['文字', '数字', '絵文字', '添字', '字下げ', '漢字', '英字', '赤字', '十字', '字句'],
    },
  ];

function walk(dir: string, found: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

const files = ROOTS.flatMap((dir) => walk(path.join(ROOT, dir), []))
  .map((file) => path.relative(ROOT, file))
  // このファイル自身は一覧を持っているので、当然すべての語を含む
  .filter((file) => file !== SELF)
  .sort();

describe('コメントの語彙', () => {
  const cases = BANNED.map(({ term, use, allow }) => [term, use, allow] as const);

  it.each(cases)('「%s」を使わない(%s と書く)', (term, _use, allow) => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
      for (const [index, line] of lines.entries()) {
        if (!line.includes(term)) continue;
        let probe = line;
        for (const word of allow) probe = probe.split(word).join('');
        if (probe.includes(term)) hits.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    }
    expect(hits, '技術用語を訳し直すと、読む人は 2 つ目の語彙を覚えることになる').toEqual([]);
  });
});
