/* 巣ひとつぶんの画面が、道の印に載せる覚え。

   載せるかどうかは「人に見せたい覚えか」で選り分ける。**この条件で観て、と言えるものは載せる。**
   木の開閉や時間帯の窓は載せない — 開閉は見せたい対象ではないし、時間帯は絶対の時刻なので
   渡した先では別のものを指す。

   窓の在り処を 3 つの鍵に分けてあるので、判別できる union がそのまま書ける。
   副産物として「開いているか」の覚えが消える — 在り処が在れば開いている。 */

export type PanelKind = 'conv' | 'issue' | 'ref';

export interface ProjectSearch {
  /* どの欄も「載っていない」を `undefined` で表す。**明示的に書けるようにしてある** —
     窓を閉じるのは印を消すことなので、`undefined` を渡せないと閉じ方が無くなる。 */
  /** 何の窓か。無ければ窓は閉じている */
  panel?: PanelKind | undefined;
  /** 窓が指すもの。会話なら正本の在り処、課題なら id、記録なら版 */
  pv?: string | undefined;
  /** 記録の窓にだけ在る札。版だけでは何の枝か読めない */
  pl?: string | undefined;
  /** 探しの語。3 つの画面で同じ鍵を使う — 語を渡して画面を移る道がそのまま成り立つ */
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
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/* 道の印を読む。**読めない値は載っていなかったことにする。**

   ここで断ると、しおりを 1 つ書き損ねただけで画面が出なくなる。
   印は人が手で書き換えられる場所なので、読めないものが来る前提で組む。 */
export function parseProjectSearch(raw: Record<string, unknown>): ProjectSearch {
  const panel = raw.panel;
  const dir = raw.dir;
  return {
    panel: panel === 'conv' || panel === 'issue' || panel === 'ref' ? panel : undefined,
    pv: asString(raw.pv),
    pl: asString(raw.pl),
    q: asString(raw.q),
    // 印に載るのは字なので、両方の書き方を受ける
    attention: raw.attention === true || raw.attention === 'true' ? true : undefined,
    status: asString(raw.status),
    closed: raw.closed === true || raw.closed === 'true' ? true : undefined,
    sort: asString(raw.sort),
    dir: dir === 'asc' || dir === 'desc' ? dir : undefined,
  };
}

/* いま開いている窓。**開閉の覚えを持たない** — 印が在れば開いている。

   会話だけは指す先が無くても開ける。何も選ばずに窓を開けて「選んでください」を出す道が
   あるからで、課題と記録にはその道が無い(指す先の無い課題の窓は、ただの空箱である)。 */
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
