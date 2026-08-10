// beads module の契約: bd の呼び出しに、そのセッションを指す actor が入る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const HOOK = path.resolve(new URL('..', import.meta.url).pathname, 'modules/beads/hooks/bd-actor.mjs');
const SESSION = 'c502e943-10fb-48ac-b677-c3b2e414e615';

function hook(command, { session = SESSION } = {}) {
  const input = JSON.stringify({
    session_id: session,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command, description: 'test' },
  });
  const out = execFileSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
  return out ? JSON.parse(out).hookSpecificOutput.updatedInput : null;
}

test('bd の呼び出しには、セッションを指す actor が入る', () => {
  const r = hook('bd create --title="x" --type=task');
  assert.equal(r.command, 'bd --actor "claude/c502e943" create --title="x" --type=task');
  assert.equal(r.description, 'test', 'tool_input の他の項目は保つ');
});

test('触らない場合: bd 以外・複合コマンド・明示された actor', () => {
  for (const command of [
    'git status',
    'echo bd create',
    'bd list | head -3',
    'bd list && bd ready',
    'bd create --title="$(date)"',
    'bd close x --actor me',
    'bd close x --actor=me',
  ]) {
    assert.equal(hook(command), null, `${command} は書き換えない`);
  }
});

test('セッション ID が無ければ何もしない', () => {
  const out = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { command: 'bd ready' } }),
    encoding: 'utf8',
  });
  assert.equal(out, '', '判断材料が無いときは打たれたコマンドをそのまま通す');
});
