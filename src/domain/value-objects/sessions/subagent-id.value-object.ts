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
