#!/usr/bin/env node
// PreToolUse(Bash)。bd の呼び出しに、このセッションを指す actor を差し込む。
// 何も返さなければ、Claude Code は打たれたコマンドをそのまま実行する。

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

let input;
try {
  input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
} catch {
  process.exit(0);
}

const command = input?.tool_input?.command;
const session = input?.session_id;
if (typeof command !== 'string' || typeof session !== 'string') process.exit(0);

const rewritten = withActor(command, `claude/${session.split('-')[0]}`);
if (rewritten === null) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    updatedInput: { ...input.tool_input, command: rewritten },
  },
}));

// 書き換えるのは、単独で完結した bd の呼び出しだけ。パイプ・連結・展開を含む
// コマンドは構造を読み違えるので触らない。明示された --actor には譲る。
function withActor(command, actor) {
  const trimmed = command.trim();
  if (!/^bd\s/.test(trimmed)) return null;
  if (/[|;&`$(){}<>\n]/.test(trimmed)) return null;
  if (/(^|\s)--actor([=\s]|$)/.test(trimmed)) return null;
  return trimmed.replace(/^bd\s/, `bd --actor ${JSON.stringify(actor)} `);
}
