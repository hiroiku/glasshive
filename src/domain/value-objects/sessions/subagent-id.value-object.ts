/* 子の正本のファイル名から、同一性と呼び名を取り出す。

   **同一性と呼び名は別物である。** `id` は正本を指す鍵なので、ファイル名から
   拡張子を落としただけのものを使う。`label` は人が読むための短い名前で、
   前置きの `agent-` と、末尾に付く 16 桁の指紋を剥がす。

   剥がしたものを `id` に使うと、指紋だけが違う同名の子が同じものに見える。 */

export interface SubagentIdentity {
  readonly id: string;
  readonly label: string;
}

const FILE_PREFIX = 'agent-';
const FILE_SUFFIX = '.jsonl';
const FINGERPRINT = /^(.*)-([0-9a-f]{16})$/;

/** 子の正本として扱う名前か */
export const isSubagentFileName = (fileName: string): boolean =>
  fileName.startsWith(FILE_PREFIX) && fileName.endsWith(FILE_SUFFIX);

export function subagentIdOf(fileName: string): SubagentIdentity {
  const id = fileName.endsWith(FILE_SUFFIX) ? fileName.slice(0, -FILE_SUFFIX.length) : fileName;
  const stem = id.startsWith(FILE_PREFIX) ? id.slice(FILE_PREFIX.length) : id;
  const matched = FINGERPRINT.exec(stem);
  return { id, label: matched?.[1] ?? stem };
}

/* 覚え書きが呼んだ相手を指す字は、正本の名前から起こした鍵と形が揃っていない —
   覚え書きは前置きの `agent-` を落とした字で書く。字のまま突き合わせると親が一人も見つからず、
   木は 2 段に潰れたままになる。

   **棚に在るものとしか照らさない。** 当てが外れた字はそのまま残す —
   落とすと、呼んだ相手が窓の外へ落ちただけの子まで根から消える。 */
export function resolveSubagentId(raw: string | null, known: ReadonlySet<string>): string | null {
  if (raw === null || known.has(raw)) return raw;
  const prefixed = `${FILE_PREFIX}${raw}`;
  return known.has(prefixed) ? prefixed : raw;
}
