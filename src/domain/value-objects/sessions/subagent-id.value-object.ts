/* サブエージェントの `transcript` のファイル名から、同一性とラベルを取り出す。

   **同一性とラベルは別物である。** `id` は `transcript` を指すキーなので、ファイル名から
   拡張子を落としただけのものを使う。`label` は人が読むための短い名前で、
   接頭辞の `agent-` と、末尾に付く 16 桁の指紋を剥がす。

   剥がしたものを `id` に使うと、指紋だけが違う同名のサブエージェントが同じものに見える。 */

export interface SubagentIdentity {
  readonly id: string;
  readonly label: string;
}

const FILE_PREFIX = 'agent-';
const FILE_SUFFIX = '.jsonl';
const FINGERPRINT = /^(.*)-([0-9a-f]{16})$/;

/** サブエージェントの `transcript` として扱うファイル名か */
export const isSubagentFileName = (fileName: string): boolean =>
  fileName.startsWith(FILE_PREFIX) && fileName.endsWith(FILE_SUFFIX);

export function subagentIdOf(fileName: string): SubagentIdentity {
  const id = fileName.endsWith(FILE_SUFFIX) ? fileName.slice(0, -FILE_SUFFIX.length) : fileName;
  const stem = id.startsWith(FILE_PREFIX) ? id.slice(FILE_PREFIX.length) : id;
  const matched = FINGERPRINT.exec(stem);
  return { id, label: matched?.[1] ?? stem };
}

/* `*.meta.json` が親を指す文字列は、`transcript` のファイル名から起こしたキーと形が揃って
   いない — `*.meta.json` は接頭辞の `agent-` を落とした文字列で書く。そのまま突き合わせると
   親が一人も見つからず、木は 2 階層に潰れたままになる。

   **`known` に在るものとしか突き合わせない。** 当てが外れた文字列はそのまま残す —
   落とすと、呼んだ親が観測の範囲の外へ落ちただけのサブエージェントまで根から消える。 */
export function resolveSubagentId(raw: string | null, known: ReadonlySet<string>): string | null {
  if (raw === null || known.has(raw)) return raw;
  const prefixed = `${FILE_PREFIX}${raw}`;
  return known.has(prefixed) ? prefixed : raw;
}
