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

/* `~/.claude/projects` を、ファイルの読み取りだけで観る。何にも書き込まない。

   ここは「どこを、どれだけ読むか」を言われたとおりに開く場所である。読めたテキストを
   どうパースするかは知らないし、何バイトまで読むかも自分では決めない。

   走査と読み取りが分かれているのは、木の形が stat だけで決まるからである。中身を開くのは
   メタ情報・稼働区間・集計が要るときだけで、対象期間の外の `transcript` は開きもしない。 */

/* `transcript` の拡張子。**`~/.claude/projects` の形を知っているのは、この一群の定数である。**
   セッションの `transcript` のファイル名から拡張子を落としたものが、そのサブエージェントの
   ディレクトリ名になる。 */
const TRANSCRIPT_SUFFIX = '.jsonl';

/* サブエージェントの `transcript` が置かれる、セッションと同じ名前のディレクトリの下。
   **この下は平らではない。** 実行ごとに `workflows/<runId>/` のようなディレクトリが切られ、
   そこに入ったサブエージェントは直下には出てこないので、降りずに数えると丸ごと落ちる。 */
const SUBAGENT_DIR = 'subagents';

/* 実行ごとのディレクトリを束ねている名前。**この直下の名前が、その実行の `runId` になる。**
   実行の中で産まれたサブエージェントの `*.meta.json` には親が書かれないので、同じ実行のもの
   だと言えるのはディレクトリ名だけになる。 */
const RUN_DIR = 'workflows';

/* サブエージェントの `transcript` のファイル名の接頭辞。**降りる以上、これが要る。**
   実行のディレクトリには実行そのもののログ(`journal.jsonl`)も置かれていて、拡張子だけで
   拾うとそれがサブエージェントとして並んでしまう。接頭辞で選ぶのは、除外したいファイル名を
   数え上げるより取りこぼしが無い。 */
const SUBAGENT_PREFIX = 'agent-';

/* サブエージェントの `transcript` の隣に置かれた `*.meta.json`。`transcript` のファイル名の
   拡張子だけを差し替えたものになる。親子関係はここにしか書かれていないので、読まなければ
   木は 2 階層に潰れる。 */
const META_SUFFIX = '.meta.json';

/* `*.meta.json` に許す大きさ。フィールドが数えるほどしかない短い JSON なので、これを超える
   ものは `*.meta.json` ではない。上限に当たればテキストが切れてパースできず、
   `*.meta.json` が無いのと同じ扱いに落ちる。 */
const META_MAX_BYTES = 64 * 1024;

function listDirEntries(dir: string): Observation<fs.Dirent[]> {
  try {
    return observed(fs.readdirSync(dir, { withFileTypes: true }));
  } catch (error) {
    return classifyReadFailure(error, dir);
  }
}

/* 走査 1 回ぶんの結果。

   **見えたものと、そもそも見に行けたかを一緒に持つ。** 内側のディレクトリが読めないときに
   空の一覧だけを返すと、何も無かったディレクトリと区別が付かなくなり、その先の層では
   もう分けられない — errno が見えるのはここだけだからである。

   `walked` の数は `found` の長さとは限らない。stat を採れなかった `transcript` は
   載せようがないので、見えた数のほうが多くなることがある。 */
interface Walk<T> {
  readonly found: readonly T[];
  readonly walked: Observation<number>;
}

/** `transcript` 1 つを、ファイル名と stat だけで写す */
function describeSource(dir: string, name: string): TranscriptSource | null {
  const file = path.join(dir, name);
  const stat = statFile(file);
  /* 走査している間に消えた `transcript` は、この回では無かったものとして扱う。
     サイズを観測できなかったものも同じ扱いになる — 木の形は stat だけで決まるので、
     サイズの無い `transcript` は載せようがない。次の回で読めれば、そのまま戻ってくる。 */
  if (stat.kind !== 'observed') return null;
  return {
    id: name.slice(0, -TRANSCRIPT_SUFFIX.length),
    fileName: name,
    file,
    mtimeMs: stat.value.mtimeMs,
    sizeBytes: stat.value.size,
  };
}

/** 観測した値を信じ切らない。型が違うものは、書かれていなかったものに倒す */
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/* サブエージェントの隣の `*.meta.json` を読む。読めない・壊れている・そもそも無いは、
   すべて「無い」に落とす。

   **`*.meta.json` が無いことでサブエージェントが消えてはならない。** ここが返す null は
   「親が分からない」という事実であって、そのサブエージェントが居ないという意味ではない。 */
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
    name: textOrNull(fields.name),
    toolUseId: textOrNull(fields.toolUseId),
    description: textOrNull(fields.description),
    parentAgentId: textOrNull(fields.parentAgentId),
  };
}

/** ディレクトリに在る `transcript` を集める。ファイル名と stat だけで、中身は開かない */
function collectSources(dir: string): Walk<TranscriptSource> {
  const listed = listDirEntries(dir);
  if (listed.kind !== 'observed') return { found: [], walked: listed };
  const found: TranscriptSource[] = [];
  let seen = 0;
  for (const entry of listed.value) {
    if (!entry.isFile() || !entry.name.endsWith(TRANSCRIPT_SUFFIX)) continue;
    seen += 1;
    const source = describeSource(dir, entry.name);
    if (source !== null) found.push(source);
  }
  return { found, walked: observed(seen) };
}

/* サブエージェントを、内側のディレクトリまで降りて集める。実行ごとに切られたディレクトリの
   中にもサブエージェントが居るからである。symlink はディレクトリとして数えないので、
   symlink が親を指していても回り続けることはない。

   降りながら、いまどの実行の中に居るかを持ち回る。`runId` はディレクトリの形にしか無いので、
   ここで拾わなければ二度と拾えない — サブエージェントの `transcript` にも `*.meta.json` にも
   書かれていない。 */
function collectSubagents(dir: string, runId: string | null): Walk<SubagentSource> {
  const listed = listDirEntries(dir);
  if (listed.kind !== 'observed') return { found: [], walked: listed };

  const found: SubagentSource[] = [];
  let seen = 0;
  /* 読めなかった内側のディレクトリ。**1 つでも在れば、ここの子の数は言えない。**
     見えたところまでの数を返すと、数え落としたぶんが「居なかった」に化ける。 */
  let unreadable: Observation<number> | null = null;
  const holdsRuns = path.basename(dir) === RUN_DIR;

  for (const entry of listed.value) {
    if (entry.isDirectory()) {
      // `workflows` の直下だけが `runId` を決める。その先はどれだけ深くても同じ実行の中である
      const inner = holdsRuns ? entry.name : runId;
      const below = collectSubagents(path.join(dir, entry.name), inner);
      found.push(...below.found);
      /* 走査している間に消えたディレクトリは、子を 0 として数える。いま子は居ないからである。
         読めなかったディレクトリは数に混ぜず、数えられなかったこととして持ち上げる。 */
      if (below.walked.kind === 'observed') {
        seen += below.walked.value;
      } else if (below.walked.kind === 'unobservable' && unreadable === null) {
        unreadable = below.walked;
      }
      continue;
    }
    const isSubagent =
      entry.isFile() &&
      entry.name.startsWith(SUBAGENT_PREFIX) &&
      entry.name.endsWith(TRANSCRIPT_SUFFIX);
    if (!isSubagent) continue;
    seen += 1;
    const source = describeSource(dir, entry.name);
    if (source === null) continue;
    found.push({
      ...source,
      runId,
      meta: readAgentMeta(path.join(dir, `${source.id}${META_SUFFIX}`)),
    });
  }
  return { found, walked: unreadable ?? observed(seen) };
}

/* プロジェクト 1 つぶんのディレクトリから、セッションの `transcript` とそのサブエージェントを
   集める。セッションはディレクトリの直下だけを見る — セッションは入れ子にならない。 */
function collectSessions(groupDir: string): Walk<SessionSource> {
  const walk = collectSources(groupDir);
  const found = walk.found.map((source) => {
    const below = collectSubagents(path.join(groupDir, source.id, SUBAGENT_DIR), null);
    return { ...source, subagents: below.found, subagentsWalked: below.walked };
  });
  return { found, walked: walk.walked };
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
        // `~/.claude/projects` には `transcript` でないものも混ざる。プロジェクト 1 つぶんは、必ずディレクトリである
        if (!entry.isDirectory()) continue;
        const walk = collectSessions(path.join(root, entry.name));
        groups.push({ slug: entry.name, sessions: walk.found, walked: walk.walked });
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
      // サイズは読む直前に採る。走査してから読むまでの間にも `transcript` は伸びる
      const stat = statFile(at.file);
      if (stat.kind !== 'observed') return stat;
      return readTailWindow(at.file, window.maxBytes, stat.value.size, window.trimPartialLine);
    },

    async canonicalize(target) {
      try {
        return observed(fs.realpathSync(target));
      } catch (error) {
        /* 解決できなかったことを、解決できた振りで返さない。

           渡されたパスをここで `observed` として返すと、それが「解決の結果」として
           上の層に覚えられる。外していたボリュームが繋ぎ直された後も古いパスが居座り、
           同じ実体のプロジェクトが別のパスのまま二つに並ぶ。渡されたパスで代用してよいかは、
           代用してよい場所で決める。 */
        return classifyReadFailure(error, target);
      }
    },
  };
}
