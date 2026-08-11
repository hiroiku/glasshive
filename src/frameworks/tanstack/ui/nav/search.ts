import { GANTT_WINDOWS } from '../derive/issueGantt.ts';

/* プロジェクト 1 つぶんの画面が、URL の検索パラメータに載せる状態。

   載せるかどうかは「人に見せたい状態か」で選り分ける。**この条件で見て、と言えるものは載せる。**
   木の開閉や時間帯の表示範囲は載せない — 開閉は見せたい対象ではないし、時間帯は絶対の時刻なので
   渡した先では別のものを指す。

   パネルの指す先を `panel` / `pv` / `pl` の 3 つのキーに分けてあるので、判別可能な union が
   そのまま書ける。副産物として「開いているか」を別に持つ必要が消える — 指す先が在れば開いている。 */

export type PanelKind = 'conv' | 'issue' | 'ref';

export interface ProjectSearch {
  /* どの欄も「載っていない」を `undefined` で表す。**明示的に書けるようにしてある** —
     パネルを閉じるのは検索パラメータを消すことなので、`undefined` を渡せないと閉じ方が無くなる。 */
  /** どのパネルか。無ければパネルは閉じている */
  panel?: PanelKind | undefined;
  /** パネルが指すもの。会話なら `transcript` のパス、課題なら id、Git なら `rev` */
  pv?: string | undefined;
  /** Git のパネルにだけあるラベル。`rev` だけでは何のブランチか読めない */
  pl?: string | undefined;
  /** 検索語。3 つの画面で同じキーを使う — 語を保ったまま画面を移れる */
  q?: string | undefined;
  /** 要注意だけに絞るか */
  attention?: boolean | undefined;
  /** 課題の状態で絞る */
  status?: string | undefined;
  /** 閉じた課題も出すか */
  closed?: boolean | undefined;
  /** 並べ替えの列と向き */
  sort?: string | undefined;
  dir?: 'asc' | 'desc' | undefined;
  /* Work の画面で、1 行が何を指すか。無ければ課題である。

     **画面を分けずにここで切り替える。** 課題とブランチは同じ作業を別の側から見たもので、
     PR がその 2 つを繋いでいる。別々のタブに置くと、繋ぎ目を人が頭の中で持つことになる。 */
  unit?: WorkUnit | undefined;
  /* マイルストーンの名前で絞る。**検索語とは別の欄に置く** — 名前がそのまま課題の題名に
     出てくることがあり、`q` に載せると関係のない課題まで残る。 */
  ms?: string | undefined;
  /* 課題の並べ方。**同じデータの見方を変えるだけ**なので、載せておけば URL を渡した先でも
     同じ見方で開く。無ければ一覧である。着手順は一覧の `sort=start` がそのまま担う。 */
  view?: IssueView | undefined;
  /* 一覧の右のタイムラインが一度に見せる幅。`GANTT_WINDOWS` のラベルをそのまま載せる。
     無ければ `DEFAULT_GANTT_WINDOW` である。 */
  gw?: string | undefined;
  /* 課題の一覧を何で束ねるか。無ければ束ねない(親子の入れ子のまま)。

     **`ms` とは別のことである。** あちらは 1 つのマイルストーンだけを残す絞り込みで、
     こちらは全部を出したまま並べ方を変える。 */
  group?: IssueGroup | undefined;
}

/** Work の画面の行が指すもの。無ければ課題 */
export type WorkUnit = 'branches' | 'milestones';

/** 課題の見方。一覧か、依存グラフか */
export type IssueView = 'graph';

/** 課題の一覧の束ね方。無ければ束ねない */
export type IssueGroup = 'milestone';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/* URL の検索パラメータを読む。**読めない値は載っていなかったことにする。**

   ここで断ると、ブックマークを 1 つ書き損ねただけで画面が出なくなる。
   検索パラメータは人が手で書き換えられる場所なので、読めないものが来る前提で組む。 */
export function parseProjectSearch(raw: Record<string, unknown>): ProjectSearch {
  const panel = raw.panel;
  const dir = raw.dir;
  const view = raw.view;
  const unit = raw.unit;
  const group = raw.group;
  /* 選べる幅は `GANTT_WINDOWS` が持っている。ここで書き写すと、片方だけが増えたときに
     URL からは選べない幅ができる */
  const gw = asString(raw.gw);
  return {
    panel: panel === 'conv' || panel === 'issue' || panel === 'ref' ? panel : undefined,
    pv: asString(raw.pv),
    pl: asString(raw.pl),
    q: asString(raw.q),
    // 検索パラメータに載るのは文字列なので、両方の書き方を受ける
    attention: raw.attention === true || raw.attention === 'true' ? true : undefined,
    status: asString(raw.status),
    closed: raw.closed === true || raw.closed === 'true' ? true : undefined,
    sort: asString(raw.sort),
    dir: dir === 'asc' || dir === 'desc' ? dir : undefined,
    unit: unit === 'branches' || unit === 'milestones' ? unit : undefined,
    ms: asString(raw.ms),
    view: view === 'graph' ? view : undefined,
    gw: GANTT_WINDOWS.some((preset) => preset.label === gw) ? gw : undefined,
    group: group === 'milestone' ? group : undefined,
  };
}

/* いま開いているパネル。**開閉のフラグを持たない** — 検索パラメータが在れば開いている。

   会話だけは指す先が無くても開ける。何も選ばずにパネルを開いて「選んでください」を出す
   使い方があるからで、課題と Git にはそれが無い(指す先の無い課題のパネルは、ただの空箱である)。 */
export type OpenPanel =
  | { readonly kind: 'conv'; readonly file: string | null }
  | { readonly kind: 'issue'; readonly id: string }
  | { readonly kind: 'ref'; readonly rev: string; readonly label: string };

export function openPanelOf(search: ProjectSearch): OpenPanel | null {
  if (search.panel === 'conv') return { kind: 'conv', file: search.pv ?? null };
  if (search.pv === undefined) return null;
  if (search.panel === 'issue') return { kind: 'issue', id: search.pv };
  if (search.panel === 'ref') return { kind: 'ref', rev: search.pv, label: search.pl ?? search.pv };
  return null;
}
