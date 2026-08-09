import fs from 'node:fs';
import path from 'node:path';
import { type Observation, observed } from '~/app-kernel/observation.ts';
import type {
  AgentMeta,
  SessionSource,
  SubagentSource,
  TranscriptGroup,
  TranscriptRepository,
  TranscriptSource,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import {
  classifyReadFailure,
  readHeadWindow,
  readTailWindow,
  statFile,
} from '~/infrastructure/io/bounded-read.ts';

/* 正本の置き場を、ファイルの読み取りだけで観る。何にも書き込まない。

   ここは「どこを、どれだけ読むか」を言われたとおりに開く場所である。読めた字を
   どう読み解くかは知らないし、何バイトまで読むかも自分では決めない。

   歩きと読みが分かれているのは、木の形が stat だけで決まるからである。中身を開くのは
   見出し・区間・数えを要るときだけで、窓の外の正本は開きもしない。 */

/* 正本の拡張子。**置き場の形はここが知っている。**
   セッションの正本の名前から拡張子を落としたものが、その子の棚の在り処になる。 */
const TRANSCRIPT_SUFFIX = '.jsonl';

/* 子の正本が置かれる、セッションと同じ名の下の棚。
   **この下は平らではない。** 走りごとに `workflows/<runId>/` のような棚が切られ、
   そこに入った子は直下には出てこないので、降りずに数えると丸ごと落ちる。 */
const SUBAGENT_DIR = 'subagents';

/* 子の正本の名前の頭。**降りる以上、これが要る。**
   走りの棚には走りそのものの控え(`journal.jsonl`)も置かれていて、拡張子だけで拾うと
   それが子として並んでしまう。頭で選ぶのは、控えの名前を数え上げるより取りこぼしが無い。 */
const SUBAGENT_PREFIX = 'agent-';

/* 子の正本の隣に置かれた覚え書き。正本の名前の拡張子だけを差し替えたものになる。
   親子はここにしか書かれていないので、読まなければ木は 2 段に潰れる。 */
const META_SUFFIX = '.meta.json';

/* 覚え書きに許す大きさ。数えるだけの短い JSON なので、これを超えるものは覚え書きではない。
   上限に当たれば字が切れて読み解けず、覚え書きが無いのと同じ扱いに落ちる。 */
const META_MAX_BYTES = 64 * 1024;

function listDirEntries(dir: string): Observation<fs.Dirent[]> {
  try {
    return observed(fs.readdirSync(dir, { withFileTypes: true }));
  } catch (error) {
    return classifyReadFailure(error, dir);
  }
}

/* 木の内側の棚は、読めなくても空として先へ進む。

   置き場そのものが読めないなら観測は成り立たないが、内側の 1 つが読めないだけなら
   他の名前は見えている。そこで止めると、見えているものまで隠れる。

   **ここは「無い」と「見に行けなかった」をわざと潰している、この道具で唯一の場所である。**
   潰してよいと言えるのは、棚の形が `Observation` を持てないからではなく、内側 1 つの
   読めなさが木の形を変えないからである(セッションを持たない名前は巣として数えない)。
   歩けた名前の数は `listTranscripts` の `Observation` に残るので、置き場ごと読めなかった
   のか、内側が 1 つ読めなかったのかは、上の層で区別が付く。 */
function entriesOrEmpty(dir: string): fs.Dirent[] {
  const listed = listDirEntries(dir);
  return listed.kind === 'observed' ? listed.value : [];
}

/** 正本 1 つを、名前と stat だけで写す */
function describeSource(dir: string, name: string): TranscriptSource | null {
  const file = path.join(dir, name);
  const stat = statFile(file);
  /* 歩いている間に消えた正本は、この周では無かったものとして扱う。
     大きさを見に行けなかったものも同じ扱いになる — 木の形は stat だけで決まるので、
     大きさの無い正本は載せようがない。次の周で読めれば、そのまま戻ってくる。 */
  if (stat.kind !== 'observed') return null;
  return {
    id: name.slice(0, -TRANSCRIPT_SUFFIX.length),
    fileName: name,
    file,
    mtimeMs: stat.value.mtimeMs,
    sizeBytes: stat.value.size,
  };
}

/** 観測した字を信じ切らない。書かれ方が違う値は、書かれていなかったものに倒す */
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/* 子の隣の覚え書きを読む。読めない・壊れている・そもそも無いは、すべて「無い」に落とす。

   **覚え書きが無いことで子が消えてはならない。** ここが返す null は「呼んだ相手が分からない」
   という事実であって、その子が居ないという意味ではない。 */
function readAgentMeta(file: string): AgentMeta | null {
  const window = readHeadWindow(file, META_MAX_BYTES, false);
  if (window.kind !== 'observed') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(window.value.text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const fields = parsed as Record<string, unknown>;
  return {
    agentType: textOrNull(fields.agentType),
    description: textOrNull(fields.description),
    parentAgentId: textOrNull(fields.parentAgentId),
    spawnDepth: countOrNull(fields.spawnDepth),
  };
}

/** 棚に在る正本を集める。名前と stat だけで、中身は開かない */
function collectSources(dir: string): TranscriptSource[] {
  const sources: TranscriptSource[] = [];
  for (const entry of entriesOrEmpty(dir)) {
    if (!entry.isFile() || !entry.name.endsWith(TRANSCRIPT_SUFFIX)) continue;
    const source = describeSource(dir, entry.name);
    if (source !== null) sources.push(source);
  }
  return sources;
}

/* 子の棚を、内側の棚まで降りて集める。走りごとに切られた棚の中にも子が居るからである。
   別名は棚として数えないので、別名が親を指していても回り続けることはない。 */
function collectSubagents(dir: string): SubagentSource[] {
  const sources: SubagentSource[] = [];
  for (const entry of entriesOrEmpty(dir)) {
    if (entry.isDirectory()) {
      sources.push(...collectSubagents(path.join(dir, entry.name)));
      continue;
    }
    const isSubagent =
      entry.isFile() &&
      entry.name.startsWith(SUBAGENT_PREFIX) &&
      entry.name.endsWith(TRANSCRIPT_SUFFIX);
    if (!isSubagent) continue;
    const source = describeSource(dir, entry.name);
    if (source === null) continue;
    sources.push({ ...source, meta: readAgentMeta(path.join(dir, `${source.id}${META_SUFFIX}`)) });
  }
  return sources;
}

/* 名前ひとつぶんの棚から、セッションの正本とその子を集める。
   セッションは棚の直下だけを見る — セッションは入れ子にならない。 */
function collectSessions(groupDir: string): SessionSource[] {
  return collectSources(groupDir).map((source) => ({
    ...source,
    subagents: collectSubagents(path.join(groupDir, source.id, SUBAGENT_DIR)),
  }));
}

export function createFsTranscriptRepository(options: {
  readonly transcriptsRoot: string;
}): TranscriptRepository {
  const root = options.transcriptsRoot;

  return {
    async listTranscripts(): Promise<Observation<readonly TranscriptGroup[]>> {
      const listed = listDirEntries(root);
      if (listed.kind !== 'observed') return listed;
      const groups: TranscriptGroup[] = [];
      for (const entry of listed.value) {
        // 置き場には正本でないものも混ざる。名前ひとつぶんは、必ず棚の形をしている
        if (!entry.isDirectory()) continue;
        groups.push({
          slug: entry.name,
          sessions: collectSessions(path.join(root, entry.name)),
        });
      }
      return observed(groups);
    },

    async statTranscript(file) {
      const stat = statFile(file);
      return stat.kind === 'observed'
        ? observed({ mtimeMs: stat.value.mtimeMs, sizeBytes: stat.value.size })
        : stat;
    },

    async readHead(at, window) {
      return readHeadWindow(at.file, window.maxBytes, window.trimPartialLine);
    },

    async readTail(at, window) {
      // 大きさは読む直前に採る。歩いてから読むまでの間にも正本は伸びる
      const stat = statFile(at.file);
      if (stat.kind !== 'observed') return stat;
      return readTailWindow(at.file, window.maxBytes, stat.value.size, window.trimPartialLine);
    },

    async canonicalize(target) {
      try {
        return observed(fs.realpathSync(target));
      } catch (error) {
        /* 解決できなかったことを、解決できた振りで返さない。

           渡された字をここで `observed` として返すと、それが「解決の結果」として
           上の層に覚えられる。外した器が繋ぎ直された後も古い字が居座り、同じ実体の巣が
           別名のまま二つに並ぶ。字で代えてよいかは、代えてよい場所で決める。 */
        return classifyReadFailure(error, target);
      }
    },
  };
}
