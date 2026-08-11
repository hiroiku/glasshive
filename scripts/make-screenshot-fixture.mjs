#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* README のスクリーンショットを撮るための、架空の世界を 1 つ書き出す。

   撮り直せない画面が出ないようにするためのスクリプトである。1.2.0 までのスクリーンショットは
   どこにも残っていない世界を撮ったもので、同じ絵を作り直す手立てが無かった。

   **書き出す先は、引数で渡されたディレクトリだけである。** `~/.claude` にも
   `~/.config/glasshive` にも触らない。glasshive 自身が観測元へ書き込まないのと同じ約束を、
   その観測元を作る側でも守る。

   出てくる名前(プロジェクト・リポジトリ・人・課題)はすべて架空である。GitHub の login と
   organization の名前にはアンダースコアを使えないので、`rin_sato` や `north_harbor` は
   実在のアカウントを名指しようがない。アバターの URL は載せない —— 載せれば画面が
   `avatars.githubusercontent.com` へ取りに行き、撮影のために外へつながることになる。

   時刻はすべて実行した瞬間からの相対で決める。固定した `--now` を渡せば、同じ形の稼働区間が
   何度でも出る。 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 世界の中身を決める種。固定してあるので、同じ `--now` からは同じ世界が出る */
const SEED = 0x9e3779b9;

/** このスクリプトが書いたディレクトリだと分かる目印。`--force` はこれが在るときだけ消す */
const MARKER = '.glasshive-fixture';

const USAGE = `Usage: node scripts/make-screenshot-fixture.mjs <output-dir> [--now <iso>] [--force]

Writes a synthetic world for screenshots: a transcripts root, git repositories,
a stub gh, and a README telling you how to run glasshive against it.

  --now <iso>   Pin "now" (default: the moment this runs)
  --force       Overwrite an output directory this script wrote before
`;

// ── 引数 ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  let outDir = null;
  let nowMs = Date.now();
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') {
      force = true;
    } else if (arg === '--now') {
      const raw = argv[++i];
      const parsed = Date.parse(raw ?? '');
      if (!Number.isFinite(parsed)) return { ok: false, message: `invalid --now: ${raw ?? ''}` };
      nowMs = parsed;
    } else if (arg === '-h' || arg === '--help') {
      return { ok: false, message: USAGE, exitCode: 0 };
    } else if (arg.startsWith('-')) {
      return { ok: false, message: `unknown option: ${arg}` };
    } else if (outDir === null) {
      outDir = arg;
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }

  if (outDir === null) return { ok: false, message: USAGE };
  return { ok: true, outDir, nowMs, force };
}

/** `target` が `deny` そのものか、その中にあるか */
function isAtOrInside(target, deny) {
  const from = path.resolve(deny);
  if (target === from) return true;
  const rel = path.relative(from, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/* 書き出してよい場所か。**観測元の中には作らせない。**
   glasshive が読む先へ `fixture` を置くと、撮影のために本物の一覧が変わってしまう。
   `~/.claude` と `~/.config/glasshive` はその中まで断る —— `~/.claude/projects/fixture` は
   ディレクトリ名が一致しないだけで、本物の `transcript` のルートそのものである。 */
function refuseUnsafeTarget(target) {
  const home = os.homedir();
  for (const deny of [path.join(home, '.claude'), path.join(home, '.config', 'glasshive')]) {
    if (isAtOrInside(target, deny)) return `refusing to write the fixture inside ${deny}`;
  }
  /* ホームとファイルシステムの根は、そこ自体でなければよい。中に置くのは撮る人の自由で、
     断ると `~/work/shots` のような当たり前の置き場所まで使えなくなる。 */
  for (const deny of [home, path.parse(target).root]) {
    if (target === path.resolve(deny)) return `refusing to write the fixture into ${deny}`;
  }
  if (target.split(path.sep).includes('.beads'))
    return 'refusing to write inside a .beads directory';
  return null;
}

// ── 決まった並びを作る ────────────────────────────────────────────────────────

/** mulberry32。同じ種からは同じ並びが出る */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(SEED);

const pick = (items) => items[Math.floor(random() * items.length)];
const between = (low, high) => low + Math.floor(random() * (high - low + 1));
const hex = (length) =>
  Array.from({ length }, () => '0123456789abcdef'[Math.floor(random() * 16)]).join('');

/** UUID の形をした識別子。中身は種から決まるので、本物の UUID とは関係が無い */
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

const iso = (atMs) => new Date(atMs).toISOString();

/** `git` に渡す日付。秒までで足りる */
const gitDate = (atMs) => new Date(atMs).toISOString().replace(/\.\d{3}Z$/, '+00:00');

// ── 架空の世界の語彙 ──────────────────────────────────────────────────────────

const PEOPLE = [
  { name: 'Rin Sato', email: 'rin@example.invalid', login: 'rin_sato' },
  { name: 'Mira Okonkwo', email: 'mira@example.invalid', login: 'mira_okonkwo' },
  { name: 'Dev Ramanathan', email: 'dev@example.invalid', login: 'dev_ramanathan' },
  { name: 'Elif Kaya', email: 'elif@example.invalid', login: 'elif_kaya' },
  { name: 'Tomas Bergqvist', email: 'tomas@example.invalid', login: 'tomas_b' },
];

const OWNER = 'north_harbor';

const MODELS = {
  opus: 'claude-opus-5',
  sonnet: 'claude-sonnet-4-5-20250929',
  haiku: 'claude-haiku-4-5-20251001',
};

/** Claude Code が `transcript` に書くバージョン。名前として使うだけで、動きには関わらない */
const CLI_VERSION = '2.0.31';

const PROMPTS = [
  'The backfill drops rows whose source cursor is null. Find out why and fix it.',
  'Rework the token window so the 5h and 7d views share one axis.',
  'The archive reader stalls on shards larger than 2 GiB — profile it and report back.',
  'Split the schema mapper so the 2019 columns are described in one place.',
  'Bump the parquet writer and make sure nothing in ingest changed shape.',
  'Write the migration notes for the work view, then review them against the code.',
  'Cursor resume is off by one page after a retry. Reproduce it first.',
  'Add a regression test for the stale cursor before touching the reader.',
];

const THOUGHTS = [
  'The cursor is written before the batch commits, so a retry resumes past the rows it never wrote. The fix belongs in the writer, not the reader.',
  'Two code paths compute the window: one in the axis, one in the summary. They disagree at the boundary, which is what the screenshot shows.',
  'Before changing the mapper I want the failing case pinned by a test, otherwise the fix and the regression land together and neither is checkable.',
  'The shard reader holds every row group in memory. Streaming it is the smaller change, but it moves the retry semantics — worth saying out loud in the notes.',
];

const REPLIES = [
  `Found it. The cursor advances **before** the batch is committed, so a retry resumes past rows that were never written.

- \`advance()\` is called from the reader loop
- the writer commits afterwards, in a separate transaction
- a crash between the two loses the batch and keeps the cursor

Moving the advance into the writer's transaction is the smallest change that closes the hole.`,
  `Here is the shape I am proposing for the resume path:

\`\`\`ts
export async function resume(cursor: Cursor, batch: Batch): Promise<Cursor> {
  const written = await writer.commit(batch);
  // カーソルは書き込みと同じトランザクションで進める
  return cursor.advance(written.lastKey);
}
\`\`\`

That keeps the cursor and the rows in one commit, so a retry can only ever repeat work — never skip it.`,
  `Summary of the run:

| step | rows | duration |
| --- | --- | --- |
| read | 1,482,113 | 41s |
| map | 1,482,113 | 12s |
| write | 1,481,996 | 63s |

The 117 missing rows are all from the 2019 shard, and all of them have a null source cursor. That matches the report.`,
  `Checks are green on this branch:

1. \`npm run check\` — biome, layers, types, tests
2. the new regression test fails on \`main\` and passes here
3. no change to the public shape of \`Cursor\`

I left the migration note as a draft — it needs a line about the retry semantics that I would rather you write.`,
];

const TOOLS = [
  { name: 'Read', input: { file_path: 'src/ingest/backfill.ts' } },
  { name: 'Grep', input: { pattern: 'advance\\(', path: 'src/ingest' } },
  { name: 'Bash', input: { command: 'npm run check', description: 'Run the full gate' } },
  { name: 'Bash', input: { command: 'git diff --stat main...HEAD' } },
  { name: 'Edit', input: { file_path: 'src/ingest/cursor.ts' } },
  { name: 'Read', input: { file_path: 'docs/work-view.md' } },
];

const TOOL_RESULTS = [
  '  41 files changed, 812 insertions(+), 233 deletions(-)',
  'src/ingest/backfill.ts:118:    cursor.advance(batch.lastKey);\nsrc/ingest/cursor.ts:44:  advance(key: string): Cursor {',
  'All checks passed in 38.2s',
  'ok 12 - resumes from the last committed key\nok 13 - never skips a batch after a retry',
];

// ── `transcript` を組み立てる ────────────────────────────────────────────────

/** 応答 1 つぶんの消費。cache read が大きいのは、長い会話を続けたときの実際の形に近い */
const usageOf = () => ({
  input_tokens: between(900, 5200),
  output_tokens: between(180, 2400),
  cache_read_input_tokens: between(11_000, 128_000),
  cache_creation_input_tokens: between(900, 9800),
});

/** どの行にも載る欄。作業ディレクトリとブランチはここで決まる */
const envelope = (ctx, atMs) => ({
  parentUuid: uuid(),
  isSidechain: ctx.sidechain === true,
  userType: 'external',
  cwd: ctx.cwd,
  sessionId: ctx.sessionId,
  version: CLI_VERSION,
  gitBranch: ctx.branch,
  uuid: uuid(),
  timestamp: iso(atMs),
});

const userText = (ctx, atMs, text) => ({
  ...envelope(ctx, atMs),
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text }] },
});

const assistantBlocks = (ctx, atMs, content) => ({
  ...envelope(ctx, atMs),
  type: 'assistant',
  effort: ctx.effort,
  requestId: `req_${hex(20)}`,
  message: {
    id: `msg_${hex(22)}`,
    type: 'message',
    role: 'assistant',
    model: ctx.model,
    content,
    stop_reason: null,
    stop_sequence: null,
    usage: usageOf(),
  },
});

const toolResult = (ctx, atMs, toolUseId, text) => ({
  ...envelope(ctx, atMs),
  type: 'user',
  message: {
    role: 'user',
    content: [{ tool_use_id: toolUseId, type: 'tool_result', content: text }],
  },
});

/* やり取り 1 往復。thinking・ツールの呼び出し・その結果・markdown の本文が 1 組で出る。

   会話パネルが見せたいものは全部この 1 組に入っている。末尾から読まれるので、
   どの往復を採っても同じだけの中身が出る。 */
function turn(ctx, atMs) {
  const records = [];
  let at = atMs;

  records.push(userText(ctx, at, pick(PROMPTS)));
  at += between(2, 9) * SECOND;

  const toolUseId = `toolu_${hex(20)}`;
  const tool = pick(TOOLS);
  records.push(
    assistantBlocks(ctx, at, [
      { type: 'thinking', thinking: pick(THOUGHTS), signature: hex(24) },
      { type: 'tool_use', id: toolUseId, name: tool.name, input: tool.input },
    ]),
  );
  at += between(3, 25) * SECOND;

  records.push(toolResult(ctx, at, toolUseId, pick(TOOL_RESULTS)));
  at += between(2, 12) * SECOND;

  records.push(assistantBlocks(ctx, at, [{ type: 'text', text: pick(REPLIES) }]));
  at += between(4, 40) * SECOND;

  return { records, endMs: at };
}

/** 末尾の 1 行。ここで「いま誰の番か」が決まる */
function closingRecords(ctx, atMs, shape) {
  if (shape === 'ask') {
    return [
      assistantBlocks(ctx, atMs, [
        {
          type: 'tool_use',
          id: `toolu_${hex(20)}`,
          name: 'AskUserQuestion',
          input: {
            questions: [
              {
                question: 'Should the cursor advance inside the writer transaction?',
                options: ['Yes — one commit', 'No — keep them separate'],
              },
            ],
          },
        },
      ]),
    ];
  }
  if (shape === 'text') {
    return [assistantBlocks(ctx, atMs, [{ type: 'text', text: pick(REPLIES) }])];
  }
  const tool = pick(TOOLS);
  return [
    assistantBlocks(ctx, atMs, [
      { type: 'tool_use', id: `toolu_${hex(20)}`, name: tool.name, input: tool.input },
    ]),
  ];
}

/* 稼働区間の形を決める。**まとまりの間に 2 分より長い無音を置く。**
   置かなければ全部が 1 本の区間に繋がり、タイムラインが 1 本の棒になる。 */
function clusterStarts(startMs, endMs, clusters) {
  const span = Math.max(endMs - startMs, 5 * MINUTE);
  const starts = [];
  for (let i = 0; i < clusters; i++) {
    starts.push(startMs + Math.round((span * i) / clusters));
  }
  return starts;
}

/** `transcript` 1 本ぶんの行。最後の行の時刻がちょうど `endMs` に着く */
function buildTranscript(ctx, spec) {
  const records = [];
  const starts = clusterStarts(spec.startMs, spec.endMs, spec.clusters);

  records.push({
    ...envelope(ctx, spec.startMs),
    type: 'system',
    subtype: 'session-start',
    content: spec.opening,
  });

  for (const [index, start] of starts.entries()) {
    let at = start;
    for (let i = 0; i < spec.turnsPerCluster; i++) {
      const built = turn(ctx, at);
      records.push(...built.records);
      at = built.endMs;
    }
    if (index === 0 && spec.aiTitle !== undefined) {
      records.push({
        ...envelope(ctx, at),
        type: 'ai-title',
        aiTitle: spec.aiTitle,
      });
    }
  }

  for (const hop of spec.hops ?? []) {
    records.push(
      assistantBlocks(ctx, spec.endMs - 3 * MINUTE, [
        {
          type: 'tool_use',
          id: `toolu_${hex(20)}`,
          name: 'SendMessage',
          input: { to: hop.to, message: hop.message, summary: hop.summary },
        },
      ]),
    );
  }

  records.push(...closingRecords(ctx, spec.endMs, spec.last));
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

// ── 世界そのもの ─────────────────────────────────────────────────────────────

/* プロジェクト 4 つ。`atlas-api` だけが群を抜いて忙しく、残りは静かなプロジェクトとして
   並ぶ。1 つだけが忙しいのは、木の並びと稼働区間の絵が「どこを見るべきか」を語るためである。 */
const PROJECTS = [
  {
    name: 'atlas-api',
    description: 'Archive ingest for the Atlas data platform',
    branches: [
      'feature/ingest-backfill',
      'feature/token-window',
      'fix/stale-cursor',
      'chore/deps-bump',
      'docs/work-view',
      'spike/parquet-writer',
    ],
  },
  { name: 'orchard', description: 'Command line tools for the Atlas fleet', branches: [] },
  { name: 'tidepool', description: 'Sampling service for shard statistics', branches: [] },
  { name: 'pinboard', description: 'Internal status board', branches: [] },
];

/* しばらく触っていないプロジェクト。**一覧を実際の機械の見え方に近づけるために要る。**

   使っている人の `~/.claude/projects` には、忙しい数個の後ろに、去年触ったきりのものが
   何十と並ぶ。忙しい 4 つだけを写すと、一覧が絞り込みと並べ替えを持っている理由が絵から
   消える。ここは名前と最終活動だけが要るので、セッションは 1 つずつ、短いものを置く。 */
const QUIET_PROJECTS = [
  { name: 'driftwood', description: 'Retired shard mover', agoHours: 2 },
  { name: 'harrow', description: 'Index compaction jobs', agoHours: 3 },
  { name: 'sandbar', description: 'Static site for the fleet docs', agoHours: 5 },
  { name: 'lantern', description: 'Log tailer for the ingest workers', agoHours: 6 },
  { name: 'plumbline', description: 'Schema drift checker', agoHours: 6.5 },
  { name: 'millrace', description: 'Queue drain utility', agoHours: 8 },
  { name: 'thicket', description: 'Dependency graph explorer', agoHours: 10 },
  { name: 'ferrite', description: 'Checksum verifier', agoHours: 10.5 },
  { name: 'foxglove', description: 'Alert rule templates', agoHours: 12 },
  { name: 'quarry', description: 'Archive extraction helpers', agoHours: 13 },
  { name: 'kettle', description: 'Local development bootstrap', agoHours: 15 },
  { name: 'coppice', description: 'Branch pruning cron', agoHours: 16 },
  { name: 'bramble', description: 'Test data seeder', agoHours: 18 },
  { name: 'beacon', description: 'Health probe endpoints', agoHours: 20 },
  { name: 'cairn', description: 'Release note collector', agoHours: 21 },
  { name: 'tollgate', description: 'Rate limit rules', agoHours: 23 },
  { name: 'windrow', description: 'Batch job scheduler', agoHours: 2 * 24 },
  { name: 'slipway', description: 'Deploy scripts', agoHours: 6 * 24 },
];

/* 静かなプロジェクトのセッション。忙しい 4 つと同じ形なので、同じ経路で書き出せる。

   終わったセッションとして読ませたいので、最後の書き込みは最短でも 2 時間前に置く。
   `--active-threshold` をどれだけ広げても、ここが稼働へ裏返ることはない。 */
const QUIET_SESSIONS = QUIET_PROJECTS.map((project, index) => ({
  project: project.name,
  branch: 'main',
  model: index % 3 === 0 ? MODELS.sonnet : MODELS.haiku,
  effort: index % 3 === 0 ? 'medium' : 'low',
  aiTitle: project.description,
  startAgo: project.agoHours * HOUR + 40 * MINUTE,
  endAgo: project.agoHours * HOUR,
  clusters: 2,
  turnsPerCluster: 2,
  last: 'text',
  subagents: [],
}));

/* セッションと、その下のサブエージェント。時刻は `now` からの隔たりで書く。

   隔たりの選び方には決まりがある。**`--active-threshold` を広げても、3 つの状態が同じまま
   読めるようにしてある。** 稼働と見なす幅の既定は 60 秒しかないので、撮る人が絵を決めている
   間に「稼働」の行は終了へ落ちる。そのとき広げれば済むようにするには、稼働と見せたいものを
   数秒前に、稼働と見せたくないものを数十分前に置くしかない —— どちらでもない隔たりは、
   幅を変えた瞬間に意味が裏返る。 */
const SESSIONS = [
  {
    project: 'atlas-api',
    branch: 'feature/ingest-backfill',
    model: MODELS.opus,
    effort: 'high',
    worktree: 'issue-101',
    aiTitle: 'Backfill the 2019 archive',
    startAgo: 3 * HOUR,
    endAgo: 25 * MINUTE,
    clusters: 6,
    turnsPerCluster: 3,
    last: 'tool',
    hops: [
      {
        to: 'ingest-mapper',
        summary: 'Take the 2019 column map',
        message: 'Take the 2019 column map',
      },
    ],
    subagents: [
      {
        label: 'ingest-mapper',
        agentType: 'general-purpose',
        description: 'Map the 2019 archive columns onto the v2 ingest schema',
        parent: null,
        model: MODELS.opus,
        effort: 'high',
        worktree: 'issue-101',
        startAgo: 58 * MINUTE,
        endAgo: 3 * SECOND,
        clusters: 4,
        turnsPerCluster: 2,
        last: 'tool',
      },
      {
        label: 'schema-diff',
        agentType: 'code-review',
        description: 'Audit every caller of Cursor.advance',
        parent: 'ingest-mapper',
        model: MODELS.sonnet,
        effort: 'medium',
        worktree: 'issue-101',
        startAgo: 52 * MINUTE,
        endAgo: 24 * MINUTE,
        clusters: 3,
        turnsPerCluster: 2,
        last: 'text',
      },
      {
        label: 'fixture-writer',
        agentType: 'general-purpose',
        description: 'Write the regression test for the stale cursor',
        parent: 'schema-diff',
        model: MODELS.haiku,
        effort: 'low',
        worktree: 'issue-101',
        startAgo: 47 * MINUTE,
        endAgo: 38 * MINUTE,
        clusters: 2,
        turnsPerCluster: 2,
        last: 'text',
      },
      {
        label: 'checks',
        agentType: 'general-purpose',
        run: 'run-7f3c9d',
        parent: null,
        model: MODELS.sonnet,
        effort: 'medium',
        startAgo: 96 * MINUTE,
        endAgo: 71 * MINUTE,
        clusters: 2,
        turnsPerCluster: 2,
        last: 'text',
      },
      {
        label: 'review',
        agentType: 'code-review',
        run: 'run-7f3c9d',
        parent: null,
        model: MODELS.opus,
        effort: 'xhigh',
        startAgo: 95 * MINUTE,
        endAgo: 69 * MINUTE,
        clusters: 2,
        turnsPerCluster: 3,
        last: 'text',
      },
      {
        label: 'docs',
        agentType: 'docs-writer',
        run: 'run-7f3c9d',
        parent: null,
        model: MODELS.haiku,
        effort: 'low',
        startAgo: 94 * MINUTE,
        endAgo: 74 * MINUTE,
        clusters: 2,
        turnsPerCluster: 1,
        last: 'text',
      },
    ],
  },
  {
    project: 'atlas-api',
    branch: 'fix/stale-cursor',
    model: MODELS.sonnet,
    effort: 'medium',
    worktree: 'issue-102',
    aiTitle: 'Cursor resume skips a page',
    startAgo: 5 * HOUR,
    endAgo: 5 * SECOND,
    clusters: 5,
    turnsPerCluster: 3,
    last: 'ask',
    subagents: [
      {
        label: 'repro',
        agentType: 'general-purpose',
        description: 'Reproduce the off-by-one page on cursor resume',
        parent: null,
        model: MODELS.sonnet,
        effort: 'medium',
        worktree: 'issue-102',
        startAgo: 4 * HOUR,
        endAgo: 2 * HOUR,
        clusters: 3,
        turnsPerCluster: 2,
        last: 'text',
      },
      {
        label: 'caller-audit',
        agentType: 'code-review',
        description: 'Find every place the resume key is written',
        parent: 'repro',
        model: MODELS.haiku,
        effort: 'low',
        worktree: 'issue-102',
        startAgo: 3.5 * HOUR,
        endAgo: 2.5 * HOUR,
        clusters: 2,
        turnsPerCluster: 2,
        last: 'text',
      },
    ],
  },
  {
    project: 'atlas-api',
    branch: 'feature/token-window',
    model: MODELS.opus,
    effort: 'xhigh',
    aiTitle: 'One axis for 5h and 7d',
    startAgo: 11 * HOUR,
    endAgo: 6 * HOUR,
    clusters: 6,
    turnsPerCluster: 3,
    last: 'text',
    subagents: [
      {
        label: 'axis-survey',
        agentType: 'general-purpose',
        description: 'Survey both axes and say where they disagree',
        parent: null,
        model: MODELS.opus,
        effort: 'high',
        startAgo: 10 * HOUR,
        endAgo: 8 * HOUR,
        clusters: 3,
        turnsPerCluster: 2,
        last: 'text',
      },
      {
        label: 'perf-probe',
        agentType: 'general-purpose',
        description: 'Profile the shard reader on the 2 GiB fixture',
        parent: 'axis-survey',
        model: MODELS.sonnet,
        effort: 'medium',
        startAgo: 9.5 * HOUR,
        endAgo: 8.5 * HOUR,
        clusters: 2,
        turnsPerCluster: 2,
        last: 'text',
      },
      {
        label: 'notes',
        agentType: 'docs-writer',
        run: 'run-2ab8e1',
        parent: null,
        model: MODELS.haiku,
        effort: 'low',
        startAgo: 9 * HOUR,
        endAgo: 7 * HOUR,
        clusters: 2,
        turnsPerCluster: 1,
        last: 'text',
      },
      {
        label: 'lint',
        agentType: 'general-purpose',
        run: 'run-2ab8e1',
        parent: null,
        model: MODELS.haiku,
        effort: 'low',
        startAgo: 8.8 * HOUR,
        endAgo: 7.2 * HOUR,
        clusters: 2,
        turnsPerCluster: 1,
        last: 'text',
      },
    ],
  },
  {
    project: 'atlas-api',
    branch: 'chore/deps-bump',
    model: MODELS.haiku,
    effort: 'low',
    aiTitle: 'Bump the parquet writer',
    startAgo: 2 * DAY + 3 * HOUR,
    endAgo: 2 * DAY,
    clusters: 4,
    turnsPerCluster: 2,
    last: 'text',
    subagents: [
      {
        label: 'dep-check',
        agentType: 'general-purpose',
        description: 'Check the parquet writer bump against the ingest tests',
        parent: null,
        model: MODELS.haiku,
        effort: 'low',
        startAgo: 2 * DAY + 2 * HOUR,
        endAgo: 2 * DAY + 30 * MINUTE,
        clusters: 2,
        turnsPerCluster: 2,
        last: 'text',
      },
    ],
  },
  {
    project: 'atlas-api',
    branch: 'main',
    model: MODELS.sonnet,
    effort: 'medium',
    aiTitle: 'Migration notes for the work view',
    startAgo: 5 * DAY + 4 * HOUR,
    endAgo: 5 * DAY,
    clusters: 5,
    turnsPerCluster: 2,
    last: 'text',
    subagents: [],
  },
  {
    project: 'orchard',
    branch: 'feature/plant-command',
    model: MODELS.opus,
    effort: 'high',
    aiTitle: 'The plant command needs a dry run',
    startAgo: 90 * MINUTE,
    endAgo: 8 * SECOND,
    clusters: 4,
    turnsPerCluster: 3,
    last: 'tool',
    subagents: [
      {
        label: 'flag-audit',
        agentType: 'general-purpose',
        description: 'Audit the plant command flags against the help text',
        parent: null,
        model: MODELS.sonnet,
        effort: 'medium',
        startAgo: 70 * MINUTE,
        endAgo: 30 * SECOND,
        clusters: 3,
        turnsPerCluster: 2,
        last: 'tool',
      },
      {
        label: 'help-text',
        agentType: 'docs-writer',
        description: 'Draft the help text for the dry run flag',
        parent: 'flag-audit',
        model: MODELS.haiku,
        effort: 'low',
        startAgo: 60 * MINUTE,
        endAgo: 35 * MINUTE,
        clusters: 2,
        turnsPerCluster: 2,
        last: 'text',
      },
    ],
  },
  {
    project: 'orchard',
    branch: 'main',
    model: MODELS.sonnet,
    effort: 'medium',
    aiTitle: 'Fleet listing is slow on 400 hosts',
    startAgo: 27 * HOUR,
    endAgo: 26 * HOUR,
    clusters: 3,
    turnsPerCluster: 2,
    last: 'text',
    subagents: [
      {
        label: 'profile',
        agentType: 'general-purpose',
        description: 'Profile the fleet listing on 400 hosts',
        parent: null,
        model: MODELS.haiku,
        effort: 'low',
        startAgo: 27 * HOUR,
        endAgo: 26.5 * HOUR,
        clusters: 2,
        turnsPerCluster: 2,
        last: 'text',
      },
    ],
  },
  {
    project: 'tidepool',
    branch: 'fix/sample-window',
    model: MODELS.sonnet,
    effort: 'medium',
    aiTitle: 'Sample window drifts under load',
    startAgo: 4 * DAY + 5 * HOUR,
    endAgo: 4 * DAY,
    clusters: 4,
    turnsPerCluster: 2,
    last: 'text',
    subagents: [
      {
        label: 'histogram',
        agentType: 'general-purpose',
        description: 'Draw the sample window as a histogram',
        parent: null,
        model: MODELS.sonnet,
        effort: 'medium',
        startAgo: 4 * DAY + 4 * HOUR,
        endAgo: 4 * DAY + 2 * HOUR,
        clusters: 2,
        turnsPerCluster: 2,
        last: 'text',
      },
      {
        label: 'bench',
        agentType: 'general-purpose',
        description: 'Run the sampler benchmark against the baseline',
        parent: 'histogram',
        model: MODELS.haiku,
        effort: 'low',
        startAgo: 4 * DAY + 3 * HOUR,
        endAgo: 4 * DAY + 2.5 * HOUR,
        clusters: 2,
        turnsPerCluster: 1,
        last: 'text',
      },
    ],
  },
  {
    project: 'pinboard',
    branch: 'main',
    model: MODELS.haiku,
    effort: 'low',
    aiTitle: 'Board columns lose their order',
    startAgo: 4 * HOUR,
    endAgo: 3 * HOUR,
    clusters: 3,
    turnsPerCluster: 2,
    last: 'text',
    subagents: [],
  },
];

// ── `transcript` を書き出す ──────────────────────────────────────────────────

/** `~/.claude/projects` の slug。Claude Code はパスの記号をハイフンに置き換える */
const slugOf = (projectPath) => projectPath.replace(/[^A-Za-z0-9]/g, '-');

/** 書いた `transcript` の最終更新時刻を、その中の最後の時刻に合わせる */
function writeTranscript(file, text, atMs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  const seconds = atMs / 1000;
  fs.utimesSync(file, seconds, seconds);
}

function writeProjects(root, repoPaths, nowMs) {
  let sessions = 0;
  let subagents = 0;

  for (const session of [...SESSIONS, ...QUIET_SESSIONS]) {
    const repo = repoPaths[session.project];
    const slug = slugOf(repo);
    const sessionId = uuid();
    const dir = path.join(root, slug);
    const startMs = nowMs - session.startAgo;
    const endMs = nowMs - session.endAgo;

    const ctx = {
      cwd: repo,
      sessionId,
      branch: session.branch,
      model: session.model,
      effort: session.effort,
    };
    const opening =
      session.worktree === undefined
        ? `Session opened in ${repo}`
        : `Session opened in ${repo}/.worktrees/${session.worktree}`;

    writeTranscript(
      path.join(dir, `${sessionId}.jsonl`),
      buildTranscript(ctx, {
        startMs,
        endMs,
        clusters: session.clusters,
        turnsPerCluster: session.turnsPerCluster,
        last: session.last,
        opening,
        aiTitle: session.aiTitle,
        hops: session.hops,
      }),
      endMs,
    );
    sessions += 1;

    /* 子のキーは「ラベル + 16 桁の指紋」で決まる。**親を指す文字列からは接頭辞を落とす** ——
       `*.meta.json` は `agent-` を付けずに書くので、付けたまま書くと木が 2 階層に潰れる。 */
    const keys = new Map();
    for (const child of session.subagents) keys.set(child.label, `${child.label}-${hex(16)}`);

    for (const child of session.subagents) {
      const key = keys.get(child.label);
      const childDir =
        child.run === undefined
          ? path.join(dir, sessionId, 'subagents')
          : path.join(dir, sessionId, 'subagents', 'workflows', child.run);
      const childEnd = nowMs - child.endAgo;
      const childCwd = child.worktree === undefined ? repo : `${repo}/.worktrees/${child.worktree}`;

      writeTranscript(
        path.join(childDir, `agent-${key}.jsonl`),
        buildTranscript(
          {
            cwd: childCwd,
            sessionId,
            branch: session.branch,
            model: child.model,
            effort: child.effort,
            sidechain: true,
          },
          {
            startMs: nowMs - child.startAgo,
            endMs: childEnd,
            clusters: child.clusters,
            turnsPerCluster: child.turnsPerCluster,
            last: child.last,
            opening: `Delegated by ${session.aiTitle}`,
          },
        ),
        childEnd,
      );

      /* 実行の中で産まれた子には、呼んだ側の一行も親も書かれない。ディレクトリ名だけが
         「同じ実行の仲間だ」と言える手掛かりになる。 */
      const meta =
        child.run === undefined
          ? {
              agentType: child.agentType,
              name: child.label,
              toolUseId: `toolu_${hex(20)}`,
              description: child.description,
              parentAgentId: child.parent === null ? null : keys.get(child.parent),
            }
          : {
              agentType: child.agentType,
              name: child.label,
              toolUseId: `toolu_${hex(20)}`,
            };
      const metaFile = path.join(childDir, `agent-${key}.meta.json`);
      fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
      fs.utimesSync(metaFile, childEnd / 1000, childEnd / 1000);
      subagents += 1;
    }

    /* 実行そのもののログ。**サブエージェントとして数えられてはいけない。**
       接頭辞で選り分けているのが効いていることを、この 1 本が確かめる。 */
    const runs = new Set(session.subagents.map((child) => child.run).filter(Boolean));
    for (const run of runs) {
      const journal = path.join(dir, sessionId, 'subagents', 'workflows', run, 'journal.jsonl');
      fs.writeFileSync(journal, `${JSON.stringify({ run, at: iso(endMs) })}\n`);
    }
  }

  return { sessions, subagents };
}

// ── git のリポジトリ ─────────────────────────────────────────────────────────

/* `git` は、走らせる人の設定を読まずに起こす。global の設定に署名やフックが仕込まれていると、
   同じスクリプトから違うリポジトリが出てしまう。 */
const gitEnv = () => ({
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
});

function git(cwd, args, extraEnv = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...gitEnv(), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeRepoFile(repo, file, text) {
  const full = path.join(repo, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

function commit(repo, { author, atMs, subject }) {
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', subject, '--author', `${author.name} <${author.email}>`], {
    GIT_AUTHOR_DATE: gitDate(atMs),
    GIT_COMMITTER_DATE: gitDate(atMs),
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
  });
}

/** コミット 1 つぶんの中身。同じファイルに書き足すと、ブランチどうしが同じファイルを触る */
function touch(repo, file, note) {
  const full = path.join(repo, file);
  const before = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  writeRepoFile(repo, file, `${before}${note}\n`);
}

const MAINLINE_SUBJECTS = [
  'Read the shard manifest before opening a reader',
  'Give Cursor a key type instead of a bare string',
  'Split the schema mapper out of the reader',
  'Retry the manifest fetch on a 5xx',
  'Drop the unused batch id from the writer',
  'Name the ingest metrics after the shard, not the file',
  'Fail fast when a shard has no manifest',
  'Move the 2019 column map into its own module',
  'Log the resume key at info, not debug',
  'Stop reformatting the manifest on every read',
  'Cover the empty shard case in the reader tests',
  'Return the row count from the writer',
  'Use one clock for both ingest timers',
  'Trim the trailing slash from the archive prefix',
  'Add the ingest runbook to docs',
  'Count skipped rows separately from failed ones',
  'Make the reader honour the shard size hint',
  'Describe the retry semantics in the runbook',
];

/* 名前を挙げていないブランチの中身。静かなプロジェクトの 2 本はここで足りる —
   衝突の見込みを見せたいのは `atlas-api` だけなので、触るファイルは 1 本にしてある。 */
const DEFAULT_BRANCH_WORK = {
  files: ['src/ingest/reader.ts'],
  subjects: ['Take the first pass at it', 'Fix what the first pass broke'],
};

const BRANCH_WORK = {
  'feature/ingest-backfill': {
    files: ['src/ingest/backfill.ts', 'src/ingest/schema.ts', 'README.md'],
    subjects: [
      'Backfill the 2019 shards through the v2 mapper',
      'Advance the cursor inside the writer transaction',
      'Cover the null source cursor in the backfill tests',
    ],
  },
  'feature/token-window': {
    files: ['src/api/routes.ts', 'src/api/auth.ts'],
    subjects: ['Share one axis between the 5h and 7d views', 'Scope the window token to one shard'],
  },
  'fix/stale-cursor': {
    files: ['src/ingest/cursor.ts', 'src/ingest/backfill.ts'],
    subjects: ['Reproduce the off-by-one page on resume', 'Commit the cursor with the batch'],
  },
  'chore/deps-bump': {
    files: ['deps.lock', 'README.md'],
    subjects: ['Bump the parquet writer to 4.2', 'Pin the manifest client'],
  },
  'docs/work-view': {
    files: ['docs/work-view.md', 'README.md'],
    subjects: ['Write the work view migration notes', 'Say what the retry does to the cursor'],
  },
  'spike/parquet-writer': {
    files: ['src/ingest/parquet.ts', 'src/ingest/schema.ts'],
    subjects: ['Sketch a streaming parquet writer', 'Measure the streaming writer on 2 GiB'],
  },
};

/** プロジェクト 1 つぶんのリポジトリ。本流・ブランチ・`worktree`・remote まで作る */
function buildRepository(repo, project, nowMs, options) {
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.name', PEOPLE[0].name]);
  git(repo, ['config', 'user.email', PEOPLE[0].email]);
  git(repo, ['config', 'commit.gpgsign', 'false']);

  writeRepoFile(repo, '.gitignore', '.worktrees/\nnode_modules/\n');
  writeRepoFile(repo, 'README.md', `# ${project.name}\n\n${project.description}.\n`);
  writeRepoFile(repo, 'src/ingest/reader.ts', 'export const reader = () => null;\n');
  writeRepoFile(repo, 'src/ingest/cursor.ts', 'export class Cursor {}\n');
  writeRepoFile(repo, 'src/ingest/schema.ts', 'export const schema = {};\n');
  writeRepoFile(repo, 'src/ingest/backfill.ts', 'export const backfill = () => null;\n');
  writeRepoFile(repo, 'src/api/routes.ts', 'export const routes = [];\n');
  writeRepoFile(repo, 'src/api/auth.ts', 'export const auth = () => null;\n');
  writeRepoFile(repo, 'docs/work-view.md', '# Work view\n');

  const first = nowMs - options.historyDays * DAY;
  commit(repo, { author: PEOPLE[0], atMs: first, subject: `Start ${project.name}` });

  const step = (options.historyDays * DAY) / (options.mainline + 2);
  let at = first;
  for (let i = 0; i < options.mainline; i++) {
    at += step;
    const subject = MAINLINE_SUBJECTS[i % MAINLINE_SUBJECTS.length];
    touch(repo, `src/ingest/reader.ts`, `// ${subject}`);
    commit(repo, { author: PEOPLE[(i + 1) % PEOPLE.length], atMs: at, subject });

    /* ときどき合流のコミットを置く。本流の絵に分かれ目が無いと、グラフが直線 1 本になる */
    if (i > 0 && i % 6 === 0) {
      const topic = `topic/${i}-manifest`;
      git(repo, ['checkout', '-q', '-b', topic]);
      touch(repo, 'src/api/routes.ts', `// ${topic}`);
      commit(repo, {
        author: PEOPLE[i % PEOPLE.length],
        atMs: at + step / 3,
        subject: 'Cache the manifest between reads',
      });
      git(repo, ['checkout', '-q', 'main']);
      git(repo, ['merge', '--no-ff', '-q', '-m', `Merge ${topic} into main`, topic], {
        GIT_AUTHOR_DATE: gitDate(at + step / 2),
        GIT_COMMITTER_DATE: gitDate(at + step / 2),
        GIT_AUTHOR_NAME: PEOPLE[0].name,
        GIT_AUTHOR_EMAIL: PEOPLE[0].email,
        GIT_COMMITTER_NAME: PEOPLE[0].name,
        GIT_COMMITTER_EMAIL: PEOPLE[0].email,
      });
      // 統合し終えたブランチは畳む。1 本だけ残して、統合済みが一覧に並ぶことも見せる
      if (i !== 6) git(repo, ['branch', '-q', '-D', topic]);
    }
  }

  /* 分かれる位置をずらす。**先端から切ると、どのブランチも `behind` が 0 になる。**
     本流がどれだけ先へ行ったかは Work の画面が並べて見せる列なので、0 が並ぶと列が死ぬ。 */
  for (const [index, name] of project.branches.entries()) {
    const work = BRANCH_WORK[name] ?? DEFAULT_BRANCH_WORK;
    git(repo, ['checkout', '-q', '-b', name, `main~${index + 1}`]);
    let branchAt = nowMs - (project.branches.length - index) * 1.5 * DAY;
    for (const [order, subject] of work.subjects.entries()) {
      for (const file of work.files) touch(repo, file, `// ${name}: ${subject}`);
      branchAt += 3 * HOUR;
      commit(repo, {
        author: PEOPLE[(index + order) % PEOPLE.length],
        atMs: branchAt,
        subject,
      });
    }
    git(repo, ['checkout', '-q', 'main']);
  }

  for (const worktree of options.worktrees ?? []) {
    const at = path.join(repo, '.worktrees', worktree.name);
    if (worktree.detached) {
      git(repo, ['worktree', 'add', '--quiet', '--detach', at, worktree.at]);
    } else {
      git(repo, ['worktree', 'add', '--quiet', at, worktree.branch]);
    }
  }

  /* remote を足す。**課題をどのリポジトリへ尋ねるかは、これだけが決めている。**
     足さなければ `gh` は起こされず、Work の画面は課題の無いプロジェクトとして出る。 */
  git(repo, ['remote', 'add', 'origin', `git@github.com:${OWNER}/${project.name}.git`]);
}

/** `atlas-api` 以外の 3 つ。短い履歴と 2 本のブランチだけで足りる */
const SMALL_BRANCHES = {
  orchard: ['feature/plant-command', 'fix/fleet-listing'],
  tidepool: ['fix/sample-window', 'chore/bench-harness'],
  pinboard: ['feature/column-order'],
};

// ── GitHub の課題 ────────────────────────────────────────────────────────────

/* 課題の本文。glasshive は開いた 1 件だけ `gh` に尋ねるので、ここも 1 件ずつ持つ。

   Markdown で書く。**見出しと箇条書きと引用と `code` を混ぜる** —— パネルは Markdown を
   自分で描いており、撮った 1 枚がその描き方の見本になる。素の 1 段落だけだと、何も
   確かめられない絵が残る。 */
const ISSUE_BODIES = [
  `The cursor is written before the batch commits, so a crash between the two leaves a
cursor pointing at rows nobody wrote.

### What we see

- the shard reports \`0 rows\` for a window that has data
- \`backfill --resume\` skips straight past it
- the gap only shows up in the weekly reconcile

### What to do

Move the cursor write into the same transaction as the batch. If that turns out to be too
coarse, write it *after* and accept one replayed batch — replays are idempotent, gaps are not.`,

  `\`page_token\` is consumed before the page is acknowledged, so a retry starts one page
further along than it should.

> Reproduced on the 5h window with a forced 503 on the third page.

The fix is small but the test is not: it needs a source that can fail mid-page.`,

  `Both views build their own scale, so the same number lands at a different height
depending on which one you are looking at.

- \`5h\` uses a linear scale from 0
- \`7d\` uses the window maximum

Pick one. The window maximum reads better day to day, but it hides a quiet week, which is
exactly what the view is for.`,

  `Anything over 2 GiB goes through a single buffer and the writer holds all of it.

### Constraints

- the reader hands us row groups, not rows
- we cannot know the final size before the last group

Streaming the groups straight to the object store is the only shape that fits both.`,

  `Notes from moving the three panes into one view.

The branch list and the milestone list were already reading the same issues; only the
grouping differed. What actually took the time was the URL — three routes had to keep
working, and \`?panel=\` had to survive the redirect.`,
];

const ISSUE_TITLES = [
  'Backfill drops rows whose source cursor is null',
  'Cursor resume is off by one page after a retry',
  'One axis for the 5h and 7d token views',
  'Streaming parquet writer for shards over 2 GiB',
  'Work view migration notes',
  'Manifest fetch retries forever on a 404',
  'Shard reader holds every row group in memory',
  'Ingest metrics are named after the file, not the shard',
  'Empty shard is reported as a failure',
  'Retry semantics are undocumented in the runbook',
  'Row counts disagree between reader and writer',
  'Archive prefix keeps a trailing slash',
  'Auth token is scoped to the whole archive',
  'Reader ignores the shard size hint',
  'Skipped rows are counted as failures',
  'Manifest cache is never invalidated',
  '2019 column map lives in three places',
  'Writer commits an empty batch on an empty shard',
  'Resume key is logged at debug',
  'Backfill has no dry run',
  'Schema mapper cannot express repeated fields',
  'Shard statistics sampler drifts under load',
  'Ingest runbook is out of date',
  'Parquet writer bump changes the null encoding',
  'Reader opens the manifest twice per shard',
  'Cursor type is a bare string',
  'Backfill progress is invisible past the first hour',
  'Failed shards are retried in the same order forever',
  'Column map has no test for the 2019 header',
  'Ingest timers use two different clocks',
  'Work view does not say which branch a PR is on',
  'Milestone dates are not shown on the board',
  'Fleet listing is slow on 400 hosts',
  'Plant command has no dry run',
  'Help text drifts from the flag table',
  'Sample window drifts under load',
  'Bench harness has no baseline',
  'Board columns lose their order after a drag',
  'Status board shows stale counts for a minute',
  'Archive prefix is case sensitive on one bucket',
  'Reader logs the whole manifest on failure',
  'Backfill cannot be resumed from a named key',
  'Ingest tests write into the repository root',
  'Manifest client has no timeout',
];

const LABELS = [
  { name: 'area/ingest', color: '1d76db' },
  { name: 'area/api', color: '0e8a16' },
  { name: 'docs', color: '0075ca' },
  { name: 'bug', color: 'd73a4a' },
  { name: 'enhancement', color: 'a2eeef' },
  { name: 'good first issue', color: '7057ff' },
  { name: 'needs-repro', color: 'fbca04' },
  { name: 'spike', color: 'c5def5' },
];

/* GitHub の `issueType.color` は 16 進ではなく列挙の名前を返す。glasshive はこの値を
   `#` に繋いで CSS へ渡すので、実際の GitHub でも型のチップに色は乗らない。
   **本物と同じ形で返す** —— ここで 16 進に化かすと、`fixture` でだけ通る絵になる。 */
const ISSUE_TYPES = [
  { name: 'Bug', color: 'RED' },
  { name: 'Feature', color: 'GREEN' },
  { name: 'Task', color: 'BLUE' },
  { name: 'Epic', color: 'PURPLE' },
];

const MILESTONES = [
  { title: '1.4 — Ingest', dueOnAgo: -12 * DAY },
  { title: '1.5 — Streaming', dueOnAgo: -40 * DAY },
  { title: 'Backlog grooming', dueOnAgo: -3 * DAY },
];

/* PR とブランチの繋ぎ目。鍵は並びの番号(0 起点)である。

   **`headRefName` はそのリポジトリに在るブランチしか指せない。** 他所のブランチ名を書くと、
   課題の行に PR のチップだけが出てブランチのチップが出ず、Work の画面が「PR は在るのに
   ブランチが無い」という、実際には起こらない形を見せる。 */
const PULLS = {
  'atlas-api': {
    0: {
      number: 214,
      state: 'OPEN',
      isDraft: false,
      decision: 'APPROVED',
      ref: 'feature/ingest-backfill',
    },
    1: { number: 219, state: 'OPEN', isDraft: true, decision: null, ref: 'fix/stale-cursor' },
    2: {
      number: 221,
      state: 'OPEN',
      isDraft: false,
      decision: 'CHANGES_REQUESTED',
      ref: 'feature/token-window',
    },
    3: { number: 226, state: 'OPEN', isDraft: true, decision: null, ref: 'spike/parquet-writer' },
    4: {
      number: 231,
      state: 'OPEN',
      isDraft: false,
      decision: 'REVIEW_REQUIRED',
      ref: 'docs/work-view',
    },
    5: {
      number: 208,
      state: 'MERGED',
      isDraft: false,
      decision: 'APPROVED',
      ref: 'chore/deps-bump',
    },
  },
  orchard: {
    0: {
      number: 61,
      state: 'OPEN',
      isDraft: false,
      decision: 'CHANGES_REQUESTED',
      ref: 'fix/fleet-listing',
    },
    1: { number: 64, state: 'OPEN', isDraft: true, decision: null, ref: 'feature/plant-command' },
  },
  tidepool: {
    0: {
      number: 38,
      state: 'OPEN',
      isDraft: false,
      decision: 'APPROVED',
      ref: 'fix/sample-window',
    },
    1: {
      number: 41,
      state: 'MERGED',
      isDraft: false,
      decision: 'APPROVED',
      ref: 'chore/bench-harness',
    },
  },
  pinboard: {
    0: {
      number: 17,
      state: 'OPEN',
      isDraft: false,
      decision: 'REVIEW_REQUIRED',
      ref: 'feature/column-order',
    },
  },
};

/* リポジトリごとの課題の数と、題を採り始める位置。

   **どのリポジトリも同じ題から始めない。** 揃えると、プロジェクトを切り替えても同じ一覧が
   出て、4 つが同じリポジトリの写しに見える。`titleFrom` はそれぞれのリポジトリの話題に
   当たる位置を指してある。 */
const REPO_ISSUES = {
  'atlas-api': { count: 44, titleFrom: 0 },
  orchard: { count: 11, titleFrom: 32 },
  tidepool: { count: 7, titleFrom: 35 },
  pinboard: { count: 4, titleFrom: 37 },
};

/** 何番目が閉じているか。堰き止めている相手の状態も、これと同じ答えでなければならない */
const isClosedAt = (i) => i % 7 === 5;
const isNotPlannedAt = (i) => i === 13;

/** 堰き止めている相手。番号ではなく並びの位置で返し、相手の状態を引けるようにする */
const blockerIndexesAt = (i) => (i % 5 === 2 && i > 4 ? [i - 3] : []);

/* コメントの本文。**markdown で書く。** パネルは課題の本文と同じ描き方で出すので、
   平文だけを並べると、引用も一覧も箇条書きも一度も画面に出ない。

   `#` から始まる番号を混ぜてあるのは、それがチップになるからである —— 課題どうしの
   繋がりは、やり取りの中でこそ書かれる。 */
const DISCUSSION_COMMENTS = [
  `Reproduced on the 5h window. The cursor is written at \`ingest/cursor.rs:88\`, before
the batch commits:

\`\`\`rust
store.put_cursor(next)?;
batch.commit()?;
\`\`\`

Swapping the two lines is not enough on its own — a replay has to be safe first.`,

  `Two shapes fit here:

1. one transaction for the cursor and the batch
2. write the cursor last and accept one replayed batch

I would take 2. Replays are already idempotent and 1 holds a lock across the whole write.`,

  `> the gap only shows up in the weekly reconcile

That is the part that worries me. Whatever we do, the reconcile should be able to say
*which* window it disagrees about.`,

  `Picked this up. The test needs a source that can fail mid-page, so the first commit is
just the harness — no behaviour change.`,

  `Same root cause as #103, but that one is about the reader and this one is about the
writer. Keeping them apart.`,

  `Left this out of the release notes on purpose: nothing user-visible changed, only the
order of two writes.`,
];

/* 課題 1 件のやり取り。**`gh` が `timeline` で返す形をそのまま作る。**

   起きたことの順に積んで、最後に立てた時刻から更新された時刻までへ均して置く。GitHub は
   古いものから返すので、この並びがそのまま画面の並びになる。

   一言も無い課題も混ぜてある。**そこが画面の要になる** —— 誰も何も言っていない課題と、
   やり取りを読みに行けなかった課題は、glasshive では別の画面になる。 */
function buildDiscussion(i, context) {
  const {
    createdMs,
    updatedMs,
    titleFrom,
    author,
    assignee,
    milestone,
    closed,
    notPlanned,
    blockers,
    parentNumber,
    pull,
  } = context;

  // 静かな課題。立てただけで誰も触っていない
  if (i % 11 === 6) return [];

  const login = (n) => PEOPLE[(i + n) % PEOPLE.length].login;
  const titleOf = (n) => ISSUE_TITLES[(titleFrom + n) % ISSUE_TITLES.length];
  const said = [];

  said.push({
    __typename: 'LabeledEvent',
    actor: { login: author.login },
    label: LABELS[i % LABELS.length],
  });
  if (assignee !== null) {
    said.push({
      __typename: 'AssignedEvent',
      actor: { login: login(1) },
      assignee: { login: assignee.login },
    });
  }
  if (milestone !== null) {
    said.push({
      __typename: 'MilestonedEvent',
      actor: { login: login(1) },
      milestoneTitle: milestone.title,
    });
  }
  if (parentNumber !== null) {
    said.push({
      __typename: 'ParentIssueAddedEvent',
      actor: { login: login(2) },
      parent: { number: parentNumber, title: titleOf(parentNumber - 101) },
    });
  }
  for (const blocker of blockers) {
    said.push({
      __typename: 'BlockedByAddedEvent',
      actor: { login: login(2) },
      blockingIssue: { number: blocker.number, title: titleOf(blocker.number - 101) },
    });
  }
  if (i % 2 === 0) {
    said.push({
      __typename: 'IssueComment',
      author: { login: login(3) },
      body: DISCUSSION_COMMENTS[i % DISCUSSION_COMMENTS.length],
    });
  }
  if (i % 3 === 1) {
    said.push({
      __typename: 'RenamedTitleEvent',
      actor: { login: author.login },
      previousTitle: `${titleOf(i)} (draft)`,
      currentTitle: titleOf(i),
    });
  }
  if (i % 5 === 3) {
    said.push({
      __typename: 'UnlabeledEvent',
      actor: { login: login(4) },
      label: LABELS[(i + 6) % LABELS.length],
    });
  }
  if (i % 4 === 2) {
    said.push({
      __typename: 'IssueComment',
      author: { login: login(2) },
      body: DISCUSSION_COMMENTS[(i + 2) % DISCUSSION_COMMENTS.length],
    });
  }
  if (pull !== undefined) {
    /* PR からの参照。**閉じる約束をした参照と、触れただけの参照を分ける** ——
       同じ見た目で出すと、どの PR がこの課題を片付けるのか読めない。 */
    said.push({
      __typename: 'CrossReferencedEvent',
      actor: { login: login(1) },
      willCloseTarget: true,
      source: { number: pull.number, title: titleOf(i) },
    });
  }
  if (i % 9 === 4) {
    said.push({
      __typename: 'MarkedAsDuplicateEvent',
      actor: { login: login(3) },
      canonical: { number: 101 + ((i + 2) % 40), title: titleOf(i + 2) },
    });
  }
  if (i % 7 === 4) {
    said.push({ __typename: 'ReopenedEvent', actor: { login: login(2) } });
  }
  if (closed || notPlanned) {
    said.push({
      __typename: 'ClosedEvent',
      actor: { login: login(1) },
      stateReason: notPlanned ? 'NOT_PLANNED' : 'COMPLETED',
    });
  }

  // 立てた時刻から更新された時刻までへ均して置く。GitHub と同じく古いものが先に来る
  const step = (updatedMs - createdMs) / (said.length + 1);
  return said.map((node, index) => ({ createdAt: iso(createdMs + step * (index + 1)), ...node }));
}

/* 課題 1 ページぶんの並び。**`gh` が返す形をそのまま作る。**
   欄を 1 つでも省くと、省いた欄を読んでいる導出だけが黙って落ちる。 */
function buildIssues(repoName, nowMs) {
  const { count, titleFrom } = REPO_ISSUES[repoName];
  const pulls = PULLS[repoName] ?? {};

  /* 誰が誰を堰き止めているかは、辺を張る前に数え切る。GitHub の
     `totalBlocking` は「この課題が堰き止めている数」で、辺の向きが逆だからである。 */
  const blocking = new Map();
  for (let i = 0; i < count; i++) {
    for (const target of blockerIndexesAt(i)) blocking.set(target, (blocking.get(target) ?? 0) + 1);
  }

  const nodes = [];
  for (let i = 0; i < count; i++) {
    const number = 101 + i;
    const title = ISSUE_TITLES[(titleFrom + i) % ISSUE_TITLES.length];
    const closed = isClosedAt(i);
    const notPlanned = isNotPlannedAt(i);
    const updatedAt = nowMs - i * 5 * HOUR - between(0, 3) * HOUR;
    const author = PEOPLE[i % PEOPLE.length];
    const assignees = i % 4 === 3 ? [] : [PEOPLE[(i + 2) % PEOPLE.length]];
    /* 親子は 8 件ごとに 1 つの親へまとめる。**親は自分を親にしない** ——
       自分を指す辺を入れると、入れ子が無限に降りる。 */
    const parentNumber = i % 8 === 0 ? null : 101 + Math.floor(i / 8) * 8;
    const subTotal = i % 8 === 0 ? Math.min(7, count - i - 1) : 0;
    /* 堰き止めている相手の状態も本当のことを言う。**片付いた相手を OPEN と返さない** ——
       返すと glasshive は片付いた依存を数え、手を付けられる課題を blocked として並べる。 */
    const blockers = blockerIndexesAt(i).map((target) => ({
      number: 101 + target,
      state: isClosedAt(target) || isNotPlannedAt(target) ? 'CLOSED' : 'OPEN',
    }));
    const pull = pulls[i];
    /* マイルストーンの無い課題も混ぜる。**間引く周期を並びの数と揃えない** ——
       揃えると 3 つのうち 1 つが必ず落ちて、その名前が画面に一度も出なくなる。 */
    const milestone = i % 5 === 4 ? null : MILESTONES[i % MILESTONES.length];

    nodes.push({
      number,
      title,
      /* 一覧の問い合わせはこれを求めない。**それでも持たせる** —— パネルが 1 件を開いたときに
         別の問い合わせで尋ねに来るので、答えるものがここに無いと本文が読めない。
         5 件に 1 件は空にしてある。本文の無い課題も普通に在る。 */
      body: i % 5 === 4 ? '' : ISSUE_BODIES[(titleFrom + i) % ISSUE_BODIES.length],
      state: closed || notPlanned ? 'CLOSED' : 'OPEN',
      stateReason: notPlanned ? 'NOT_PLANNED' : closed ? 'COMPLETED' : null,
      createdAt: iso(nowMs - (60 - i) * DAY),
      updatedAt: iso(updatedAt),
      url: `https://github.com/${OWNER}/${repoName}/issues/${number}`,
      /* アバターの URL は載せない。**載せれば画面が GitHub の CDN へ取りに行く。**
         架空の login に本物の顔が付くこともない。 */
      author: { login: author.login, avatarUrl: null },
      issueType: i % 6 === 4 ? null : ISSUE_TYPES[i % ISSUE_TYPES.length],
      milestone:
        milestone === null
          ? null
          : { title: milestone.title, dueOn: iso(nowMs - milestone.dueOnAgo) },
      comments: { totalCount: between(0, 14) },
      reactions: { totalCount: between(0, 6) },
      parent: parentNumber === null || parentNumber === number ? null : { number: parentNumber },
      subIssuesSummary: { total: subTotal, completed: Math.floor(subTotal / 3) },
      issueDependenciesSummary: {
        totalBlockedBy: blockers.length,
        totalBlocking: blocking.get(i) ?? 0,
      },
      /* 一覧の問い合わせもこれを求めない。パネルが 1 件を開いたときに、本文とも別の
         問い合わせで尋ねに来る。 */
      discussion: buildDiscussion(i, {
        createdMs: nowMs - (60 - i) * DAY,
        updatedMs: updatedAt,
        titleFrom,
        author,
        assignee: assignees[0] ?? null,
        milestone,
        closed,
        notPlanned,
        blockers,
        parentNumber: parentNumber === number ? null : parentNumber,
        pull,
      }),
      labels: { nodes: [LABELS[i % LABELS.length], LABELS[(i + 3) % LABELS.length]] },
      assignees: { nodes: assignees.map((person) => ({ login: person.login, avatarUrl: null })) },
      blockedBy: { nodes: blockers },
      closedByPullRequestsReferences: {
        nodes:
          pull === undefined
            ? []
            : [
                {
                  number: pull.number,
                  state: pull.state,
                  isDraft: pull.isDraft,
                  reviewDecision: pull.decision,
                  headRefName: pull.ref,
                },
              ],
      },
    });
  }
  // 一覧は更新の新しい順で返る。glasshive はこの順をそのまま並びに使う
  nodes.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return nodes;
}

/* `PATH` の先頭に置く `gh`。glasshive は `execFile` で起こすので、shebang さえ在れば
   何で書いてもよい。

   **中身のコメントは英語で書く。** これは書き出される成果物であって、このリポジトリの
   コードではない。読むのはスクリーンショットを撮る人で、その人が読む文章は README も
   `--help` も英語だと決まっている。 */
const GH_STUB = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

/* A stand-in for the gh CLI, written by scripts/make-screenshot-fixture.mjs.

   It answers the three GraphQL calls glasshive makes — a page of issues, the body of a
   single issue, and the discussion on a single issue — with canned data from issues.json
   next to this directory. Anything else exits non-zero, the same way the real gh does when
   it cannot serve a request. It never touches the network. */

const args = process.argv.slice(2);
if (args[0] !== 'api' || args[1] !== 'graphql') {
  process.stderr.write('fixture gh: only "gh api graphql" is answered here\\n');
  process.exit(1);
}

const fields = new Map();
for (let i = 2; i < args.length; i++) {
  if (args[i] !== '-F' && args[i] !== '-f') continue;
  const raw = args[++i] ?? '';
  const at = raw.indexOf('=');
  if (at > 0) fields.set(raw.slice(0, at), raw.slice(at + 1));
}

const dataFile = path.join(import.meta.dirname, '..', 'issues.json');
const canned = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const key = \`\${fields.get('owner')}/\${fields.get('name')}\`;
const nodes = canned[key];

if (nodes === undefined) {
  // A repository gh cannot see comes back as a null repository, not as an error page.
  process.stdout.write(JSON.stringify({ data: { repository: null } }));
  process.exit(0);
}

/* One issue, asked about on its own. GraphQL returns only the fields a query asks for, so
   each answer carries just what was asked — the panel already holds the rest. Which of the
   two it is can only be read from the query itself. A number that is not here comes back as
   a null issue, which is what GitHub does too. */
if (fields.has('number')) {
  const found = nodes.find((node) => node.number === Number(fields.get('number')));
  const wantsDiscussion = (fields.get('query') ?? '').includes('timelineItems');

  if (wantsDiscussion) {
    /* Comments and events on one timeline, oldest first. Everything canned here fits in a
       single page, so there is never a next page to walk. */
    const timelineItems = {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: found?.discussion ?? [],
    };
    process.stdout.write(
      JSON.stringify({
        data: { repository: { issue: found === undefined ? null : { timelineItems } } },
      }),
    );
    process.exit(0);
  }

  process.stdout.write(
    JSON.stringify({
      data: { repository: { issue: found === undefined ? null : { body: found.body ?? '' } } },
    }),
  );
  process.exit(0);
}

// GitHub's cursor is opaque base64; this one carries the offset it stands for.
const pageSize = Number(fields.get('pageSize')) || 100;
const cursor = fields.get('cursor');
const decoded = cursor === undefined ? '' : Buffer.from(cursor, 'base64').toString('utf8');
const offset = Number(decoded.split(':').pop()) || 0;
const page = nodes.slice(offset, offset + pageSize);
const next = offset + page.length;
const endCursor = Buffer.from(\`cursor:v2:\${next}\`, 'utf8').toString('base64');

process.stdout.write(
  JSON.stringify({
    data: {
      repository: {
        issues: {
          pageInfo: { hasNextPage: next < nodes.length, endCursor },
          // The page query asks for neither the body nor the discussion, so neither is here.
          nodes: page.map(({ body, discussion, ...rest }) => rest),
        },
      },
    },
  }),
);
`;

// ── README ───────────────────────────────────────────────────────────────────

/* README が勧めるポート。**既定の 4483 を勧めない** —— 撮る人が自分の glasshive を
   立てたまま `fixture` を見ることがあり、そのとき既定を勧めると自分の一覧を撮ってしまう。 */
const SUGGESTED_PORT = 4491;

function readmeText({ outDir, projectsRoot, configDir, binDir, repos }) {
  const port = SUGGESTED_PORT;
  return `# glasshive screenshot fixture

A synthetic world for taking the README screenshots. Everything in it is invented:
the projects, the repositories, the commits, the people, and the issues.

Nothing here names anything real. GitHub logins and organization names cannot contain
an underscore, so \`${OWNER}\` and logins like \`rin_sato\` cannot be an account that
exists. Issue authors and assignees carry no avatar URL at all, so the page never
reaches out to \`avatars.githubusercontent.com\` — the initials you see are drawn
locally. Commit authors use \`example.invalid\` addresses, which can never be delivered.

## The one thing that is not invented: this path

    ${outDir}

Everything *under* that directory is synthetic. The directory itself is whatever you
typed, and it is **on screen**: the conversation panel prints the repository path a
session ran in, worktree chips carry it in their tooltip, and the project slug is the
same path with every non-alphanumeric character replaced by a hyphen — so it is in the
address bar too. Regenerate somewhere neutral, such as \`/tmp/glasshive-fixture\`, before
taking a shot you intend to publish.

## Run glasshive against it

    GLASSHIVE_PROJECTS_ROOT=${projectsRoot} \\
    GLASSHIVE_CONFIG_DIR=${configDir} \\
    PATH=${binDir}:$PATH \\
    node bin/glasshive.js --no-open --port ${port}

Run that from a glasshive checkout (or replace \`node bin/glasshive.js\` with
\`glasshive\` if you have it installed). Then open http://127.0.0.1:${port}.

\`GLASSHIVE_CONFIG_DIR\` points inside this directory, so taking a screenshot cannot
touch your own \`preferences.json\`. \`PATH\` puts the stub \`gh\` first; it answers the
issue queries from \`issues.json\` — the page glasshive lists from, and the body and the
discussion it fetches when you open one — and never reaches the network.

### Active rows go stale in 60 seconds

A session counts as \`active\` while its transcript was written within the last minute,
which is the default. The freshest writes here are a few seconds old, so if framing the
shot takes longer than that the active rows fall to \`ended\`. Two ways out:

- regenerate right before shooting (\`--force\`), and shoot within the minute; or
- start glasshive with \`--active-threshold 600\`.

The offsets are chosen so both give the same picture: one session \`active\` and
\`awaiting: agents\`, one \`active\` and \`awaiting: user\`, everything else \`ended\`.

## What to shoot

| View | URL |
| --- | --- |
| Overview | \`/\` |
| Agents | \`/projects/<slug>/agents\` |
| Work — issues | \`/projects/<slug>/work\` |
| Work — branches | \`/projects/<slug>/work?unit=branches\` |
| Work — milestones | \`/projects/<slug>/work?unit=milestones\` |
| Work — dependency graph | \`/projects/<slug>/work?view=graph\` |

The busiest project is \`atlas-api\`; its slug is the path of its repository with every
non-alphanumeric character replaced by a hyphen. Pick it from the overview rather than
typing it.

## The world

Four projects, each a real git repository with an \`origin\` on \`github.com/${OWNER}\`:

${repos.map((repo) => `- \`${repo.name}\` — \`${repo.path}\``).join('\n')}

\`atlas-api\` is the busy one: five sessions, thirteen subagents (three levels deep, some
inside \`subagents/workflows/<runId>/\`), six unmerged branches, three worktrees, and 44
issues.

Where things are:

- Transcripts: \`${projectsRoot}\`
- Stub \`gh\`: \`${binDir}/gh\`
- Canned issues, bodies and discussions included: \`${outDir}/issues.json\`

## What it cannot show

Session state \`waiting\` (an idle agent that still has a process alive) is not
reproducible from files. glasshive counts live agents by asking \`ps\` for processes
named \`claude\` and then reading each one's working directory, so a fixture on disk
cannot produce one. Projects here always report zero live processes, which means no
session is ever \`waiting\` and no project shows the live-process marker. Sessions
\`active\`, \`ended\`, and \`awaiting: user\` are all present.

For the same reason the "processes" line in the overview counts what your own machine is
running, not what the fixture describes.

One more thing worth knowing before you read a screenshot as a bug: GitHub returns the
issue type color as an enum name (\`RED\`, \`BLUE\`, …), not a hex value, and the stub
returns it the same way. glasshive interpolates that value into \`#…\`, so the type chip
is never tinted — against the real API either.

## Regenerating

    npm run fixture -- <output-dir> --force

Timestamps are relative to the moment the script runs, so a fixture generated last week
looks a week stale. \`--now <iso>\` pins that moment, and the same \`--now\` always produces
the same shape of activity — but pin it to a real instant. A \`--now\` in the future makes
every write look like it landed moments ago, and the whole world reads as active.

Regenerating over a running glasshive is fine: it watches the transcripts root and picks
the new world up within a second.
`;
}

// ── 組み立て ─────────────────────────────────────────────────────────────────

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    process.exit(parsed.exitCode ?? 2);
  }

  const outDir = path.resolve(parsed.outDir);
  const unsafe = refuseUnsafeTarget(outDir);
  if (unsafe !== null) {
    process.stderr.write(`${unsafe}\n`);
    process.exit(2);
  }

  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    if (!parsed.force) {
      process.stderr.write(`${outDir} is not empty. Pass --force to replace it.\n`);
      process.exit(2);
    }
    /* `--force` でも、このスクリプトが書いたものしか消さない。目印が無いディレクトリは
       誰かの持ち物である。 */
    if (!fs.existsSync(path.join(outDir, MARKER))) {
      process.stderr.write(`${outDir} was not written by this script. Refusing to replace it.\n`);
      process.exit(2);
    }
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  fs.mkdirSync(outDir, { recursive: true });
  /* 実体のパスで書き回す。`/tmp` のようにリンクされたパスを渡されると、`transcript` に書いた
     作業ディレクトリと glasshive が解決したパスが食い違い、同じプロジェクトが二つに並ぶ。 */
  const root = fs.realpathSync(outDir);
  fs.writeFileSync(path.join(root, MARKER), `${iso(parsed.nowMs)}\n`);

  const projectsRoot = path.join(root, 'projects');
  const configDir = path.join(root, 'config');
  const binDir = path.join(root, 'bin');
  const reposDir = path.join(root, 'repos');
  for (const dir of [projectsRoot, configDir, binDir, reposDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const repoPaths = {};
  for (const project of [...PROJECTS, ...QUIET_PROJECTS]) {
    repoPaths[project.name] = path.join(reposDir, project.name);
  }

  buildRepository(repoPaths['atlas-api'], PROJECTS[0], parsed.nowMs, {
    historyDays: 24,
    mainline: 26,
    worktrees: [
      { name: 'issue-101', branch: 'feature/ingest-backfill' },
      { name: 'issue-102', branch: 'fix/stale-cursor' },
      { name: 'review-221', detached: true, at: 'main~4' },
    ],
  });

  /* 静かなプロジェクトにも、履歴の短いリポジトリを 1 つずつ作る。作らないと `cwd` の指す先が
     無く、Work を開いたときだけ「git のリポジトリではない」と出て、一覧との辻褄が合わない */
  for (const project of QUIET_PROJECTS) {
    buildRepository(repoPaths[project.name], { ...project, branches: [] }, parsed.nowMs, {
      historyDays: 30,
      mainline: 4,
      worktrees: [],
    });
  }

  for (const project of PROJECTS.slice(1)) {
    buildRepository(
      repoPaths[project.name],
      { ...project, branches: SMALL_BRANCHES[project.name] },
      parsed.nowMs,
      { historyDays: 12, mainline: 9, worktrees: [] },
    );
  }

  const counts = writeProjects(projectsRoot, repoPaths, parsed.nowMs);

  const issues = {};
  for (const project of PROJECTS) {
    issues[`${OWNER}/${project.name}`] = buildIssues(project.name, parsed.nowMs);
  }
  fs.writeFileSync(path.join(root, 'issues.json'), `${JSON.stringify(issues, null, 1)}\n`);

  const ghFile = path.join(binDir, 'gh');
  fs.writeFileSync(ghFile, GH_STUB);
  fs.chmodSync(ghFile, 0o755);

  /* タブに留めるものを先に決めておく。**留めないと 22 個ぶんのタブが並ぶ** —— 撮る人が
     毎回手で留め直すことになり、撮った 2 枚でタブの並びが違うことになる。glasshive が
     唯一書くファイルと同じ形式で、同じ場所へ置く。留めるのは動いている 4 つだけ。 */
  fs.writeFileSync(
    path.join(configDir, 'preferences.json'),
    `${JSON.stringify(
      {
        version: 1,
        mode: 'pinned',
        pinned: PROJECTS.map((project) => slugOf(repoPaths[project.name])),
        hidden: [],
      },
      null,
      1,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(root, 'README.md'),
    readmeText({
      outDir: root,
      projectsRoot,
      configDir,
      binDir,
      repos: PROJECTS.map((project) => ({ name: project.name, path: repoPaths[project.name] })),
    }),
  );

  const branches = PROJECTS[0].branches.length;
  process.stdout.write(
    [
      `fixture written to ${root}`,
      `  projects      ${PROJECTS.length + QUIET_PROJECTS.length} (${PROJECTS.length} busy)`,
      `  sessions      ${counts.sessions}`,
      `  subagents     ${counts.subagents}`,
      `  branches      ${branches} unmerged on atlas-api`,
      `  issues        ${Object.values(issues).reduce((sum, list) => sum + list.length, 0)}`,
      `  now           ${iso(parsed.nowMs)}`,
      '',
      /* 中身は架空でも、出力先のパスだけは撮る人のものである。会話パネルの見出しが
         作業ディレクトリをそのまま画面に出すので、黙っていると撮った絵に残る。 */
      'That path is on screen: the conversation panel prints it, and the project slug is',
      'built from it. Generate somewhere neutral before shooting anything you publish.',
      '',
      'Read the README in that directory for the exact command that brings it up.',
      '',
    ].join('\n'),
  );
}

main();
