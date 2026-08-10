/* `transcript` の先頭と末尾から、そのセッションのメタ情報を導き出す。

   ここにファイルの読み方は無い。先頭と末尾のテキストだけを受け取って、文字列と真偽を返す。
   どこまで読むかは外側の決め事で、読めたテキストからの導き方は読み取り範囲が変わっても
   同じだからである。

   走る順は「先頭の行、続けて末尾の行」の 1 本。先に見えたものを採る欄(題・作業ディレクトリ・
   開始時刻)と、後に見えたものを採る欄(ブランチ・モデル・エフォート・いま何をしているか)が
   混ざっているので、この順を崩すと値が変わる。題だけは例外で、Claude Code が付けた題が
   あれば走り終えてから被せる。 */

import {
  asArray,
  asRecord,
  asString,
  hasKey,
  type JsonRecord,
  parseFirstJsonLine,
  parseJsonlLines,
} from '~/app-kernel/json.ts';
import { scanActorId } from '~/domain/value-objects/sessions/actor.value-object.ts';
import {
  MAX_SESSION_ISSUES,
  scanWorktreeMentions,
} from '~/domain/value-objects/sessions/issue-mention.value-object.ts';
import { isSyntheticModel } from '~/domain/value-objects/sessions/model-id.value-object.ts';
import {
  ASK_TOOL_NAME,
  isAwaitingUserShape,
  type LastEventShape,
} from '~/domain/value-objects/sessions/session-state.value-object.ts';
import {
  CURRENT_MAX_CHARS,
  TITLE_MAX_CHARS,
  truncateChars,
} from '~/domain/value-objects/sessions/text-limit.value-object.ts';

/** ツール名が読めなかったときの既定の名前 */
const TOOL_FALLBACK_NAME = 'tool';

/** ツールの呼び出しから「何をしているか」を示す一言を探す欄と、その順 */
const SNIPPET_KEYS = ['description', 'command', 'file_path', 'prompt', 'query', 'pattern'] as const;

/** ツールの結果を受け取った直後の状態。この行には assistant のような手掛かりが無い */
const TOOL_RESULT_CURRENT = 'received tool result';

export interface SessionMeta {
  readonly title: string | null;
  readonly startedRaw: string | null;
  readonly cwd: string | null;
  readonly gitBranch: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly actor: string | null;
  readonly issues: readonly string[];
  readonly current: string | null;
  /** 末尾の形が「自分の番が終わっている」ものか */
  readonly awaitingCandidate: boolean;
  readonly lastEventShape: LastEventShape | null;
}

export interface SubagentMeta {
  readonly startedRaw: string | null;
  readonly cwd: string | null;
  readonly gitBranch: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly current: string | null;
  /** 取り組んでいる課題。cwd 1 つから導く */
  readonly issue: string | null;
}

/** イベントの中身のブロック。並びでないときは無い */
function messageBlocks(record: JsonRecord): readonly unknown[] | undefined {
  const message = asRecord(record, 'message');
  return message === undefined ? undefined : asArray(message, 'content');
}

/** 中身が文字列で書かれていることもあるので、並びに縛らず素のまま返す */
function messageContent(record: JsonRecord): unknown {
  const message = asRecord(record, 'message');
  return message === undefined ? undefined : message.content;
}

function hasToolResult(blocks: readonly unknown[] | undefined): boolean {
  return (blocks ?? []).some((block) => asString(block, 'type') === 'tool_result');
}

/* 種別の欄が中身を持っているブロックか。文字列であるかまでは問わない —
   知らない種別で書かれたブロックも「そこで話が終わっている」ことに変わりはなく、
   飛ばして手前を見に行くと、より古いブロックを末尾と取り違える。 */
function hasBlockType(block: unknown): boolean {
  if (typeof block !== 'object' || block === null) return false;
  return Boolean((block as JsonRecord).type);
}

/* user のイベントから、人が書いた一言を取り出す。

   ツールの出力や差し込まれた注意書きは人の言葉ではないので、`<` で始まる行と
   `Caveat:` で始まる行は飛ばし、残った最初の行を題とする。 */
export function deriveUserTitle(record: JsonRecord): string | undefined {
  const content = messageContent(record);
  let text: string | undefined;
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    const block = content.find((candidate) => asString(candidate, 'type') === 'text');
    text = block === undefined ? undefined : asString(block, 'text');
  }
  if (text === undefined) return undefined;
  const line = text
    .split('\n')
    .map((raw) => raw.trim())
    .find((raw) => raw !== '' && !raw.startsWith('<') && !raw.startsWith('Caveat:'));
  return line === undefined ? undefined : truncateChars(line, TITLE_MAX_CHARS);
}

/** Claude Code が付けた題。人の発話より後に決まるので、これが在れば題はこちらになる */
export function deriveAiTitle(record: JsonRecord): string | undefined {
  return asString(record, 'aiTitle');
}

/* assistant のイベントから「いま何をしているか」の短い言葉を作る。

   ブロックは後ろから見る。最後のブロックがその時点での状態だからである。
   ツールでも本文でも thinking でもないブロックは状態を語らないので、飛ばして更に手前を見る。 */
export function deriveCurrentActivity(record: JsonRecord): string | undefined {
  const blocks = messageBlocks(record);
  if (blocks === undefined) return undefined;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    const type = asString(block, 'type');
    if (type === 'tool_use') {
      const name = asString(block, 'name') || TOOL_FALLBACK_NAME;
      const input = asRecord(block, 'input');
      const snippet =
        SNIPPET_KEYS.map((key) => asString(input, key)).find((found) => found !== undefined) ?? '';
      return truncateChars(`${name}: ${snippet}`, CURRENT_MAX_CHARS);
    }
    if (type === 'text') return 'responding';
    if (type === 'thinking') return 'thinking';
  }
  return undefined;
}

/* 1 行から、末尾の形を読む。

   null は「この行では形が決まらない」という意味で、前の行から続く形をそのまま残す。
   ai-title のような添え物の行で、直前のやりとりの形を消してしまわないためである。 */
export function classifyLastEvent(record: JsonRecord): LastEventShape | null {
  const type = asString(record, 'type');
  if (type === 'user') {
    return hasToolResult(messageBlocks(record)) ? 'tool_result' : 'user';
  }
  if (type === 'assistant') {
    const blocks = messageBlocks(record);
    if (blocks === undefined) return null;
    const last = [...blocks].reverse().find(hasBlockType);
    switch (asString(last, 'type')) {
      case 'tool_use':
        return asString(last, 'name') === ASK_TOOL_NAME ? 'ask' : 'tool';
      case 'text':
        return 'text';
      case 'thinking':
        return 'think';
      default:
        return null;
    }
  }
  if (type === 'system') {
    const subtype = asString(record, 'subtype');
    return subtype?.includes('stop') ? 'stop' : null;
  }
  return null;
}

/** 先頭のあとに末尾を、1 本の並びとして辿る */
function* headThenTail(head: string, tail: string): Generator<JsonRecord> {
  yield* parseJsonlLines(head);
  yield* parseJsonlLines(tail);
}

export function parseSessionMeta(head: string, tail: string): SessionMeta {
  let title: string | undefined;
  let aiTitle: string | undefined;
  let startedRaw: string | undefined;
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let model: string | undefined;
  let effort: string | undefined;
  let current: string | undefined;
  let lastEventShape: LastEventShape | null = null;

  for (const record of headThenTail(head, tail)) {
    const shape = classifyLastEvent(record);
    if (shape !== null) lastEventShape = shape;

    const type = asString(record, 'type');
    if (type === 'user' || type === 'assistant') {
      /* 作業ディレクトリと開始時刻は同じ行から採る。両者が食い違うと、どこで何時に
         始まったのかが繋がらなくなる。欄は在るのに文字列でない行では作業ディレクトリが
         決まらないので、次の行でまた試す。 */
      if (cwd === undefined && hasKey(record, 'cwd')) {
        cwd = asString(record, 'cwd');
        startedRaw = asString(record, 'timestamp');
      }
      // ブランチはセッションの途中で切り替わるので、最後に見えたものが現在の値
      const branch = asString(record, 'gitBranch');
      if (branch !== undefined) gitBranch = branch;
    }

    if (type === 'user') {
      // 題は最初の発話。後の発話で塗り替えると、何のセッションだったかが分からなくなる
      if (title === undefined) title = deriveUserTitle(record);
      if (hasToolResult(messageBlocks(record))) current = TOOL_RESULT_CURRENT;
    } else if (type === 'assistant') {
      // モデルとエフォートも途中で切り替わるので、最後に見えたものが現在値
      const seenModel = asString(asRecord(record, 'message'), 'model');
      if (seenModel !== undefined && !isSyntheticModel(seenModel)) model = seenModel;
      const seenEffort = asString(record, 'effort');
      if (seenEffort !== undefined) effort = seenEffort;
      const activity = deriveCurrentActivity(record);
      if (activity !== undefined) current = activity;
    } else if (type === 'ai-title') {
      aiTitle = deriveAiTitle(record);
    }
  }

  // Claude Code が付けた題は最初の発話より後に決まるので、全部を辿り終えてから被せる
  if (aiTitle !== undefined) title = aiTitle;

  /* actor の id は先頭だけから拾い、課題は先頭と末尾の両方から拾う。
     actor の id はセッションの始めに一度だけ差し込まれ、課題は途中で増えるからである。 */
  const issues = scanWorktreeMentions(head);
  for (const issue of scanWorktreeMentions(tail)) {
    if (!issues.includes(issue)) issues.push(issue);
  }

  return {
    title: title ?? null,
    startedRaw: startedRaw ?? null,
    cwd: cwd ?? null,
    gitBranch: gitBranch ?? null,
    model: model ?? null,
    effort: effort ?? null,
    actor: scanActorId(head),
    issues: issues.slice(0, MAX_SESSION_ISSUES),
    current: current ?? null,
    awaitingCandidate: isAwaitingUserShape(lastEventShape),
    lastEventShape,
  };
}

/* サブエージェントのメタ情報を導き出す。

   親と違って、先頭は行の途中で切れていてよい。切れた行は読めないので落ちるだけで、
   欲しいものは先頭の数行に揃っている。

   `tail` は稼働しているサブエージェントのときだけ渡す。止まっているものには null を渡す —
   モデルもエフォートも委譲のときに決まるので、先頭を読めば足りる。 */
export function parseSubagentMeta(head: string, tail: string | null): SubagentMeta {
  let startedRaw: string | undefined;
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let model: string | undefined;
  let effort: string | undefined;
  let current: string | undefined;

  // サブエージェントの開始時刻は先頭の 1 行にある。委譲された時点の作業ディレクトリとブランチもここで決まる
  const first = parseFirstJsonLine(head);
  if (first !== undefined) {
    cwd = asString(first, 'cwd');
    startedRaw = asString(first, 'timestamp');
    gitBranch = asString(first, 'gitBranch');
  }

  // 最初に見えたモデルとエフォートで足りるので、両方揃ったところで読むのをやめる
  for (const record of parseJsonlLines(head)) {
    if (asString(record, 'type') !== 'assistant') continue;
    const seenModel = asString(asRecord(record, 'message'), 'model');
    if (model === undefined && seenModel !== undefined && !isSyntheticModel(seenModel)) {
      model = seenModel;
    }
    if (effort === undefined) effort = asString(record, 'effort');
    if (model !== undefined && effort !== undefined) break;
  }

  if (tail !== null) {
    // 動いているサブエージェントは途中で切り替わりうるので、末尾で見えたもので上書きする
    for (const record of parseJsonlLines(tail)) {
      const branch = asString(record, 'gitBranch');
      if (branch !== undefined) gitBranch = branch;
      if (asString(record, 'type') !== 'assistant') continue;
      const seenModel = asString(asRecord(record, 'message'), 'model');
      if (seenModel !== undefined && !isSyntheticModel(seenModel)) model = seenModel;
      const seenEffort = asString(record, 'effort');
      if (seenEffort !== undefined) effort = seenEffort;
      const activity = deriveCurrentActivity(record);
      if (activity !== undefined) current = activity;
    }
  }

  return {
    startedRaw: startedRaw ?? null,
    cwd: cwd ?? null,
    gitBranch: gitBranch ?? null,
    model: model ?? null,
    effort: effort ?? null,
    current: current ?? null,
    /* サブエージェントが取り組んでいる課題は、本文ではなく作業ディレクトリのパスから引く。
       委譲されたサブエージェントは割り当てられた `worktree` の中だけで動くので、そこに答えが出ている。 */
    issue: cwd ? (scanWorktreeMentions(cwd)[0] ?? null) : null,
  };
}
