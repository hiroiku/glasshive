// コミットメッセージ、PR、issue に、AI の関与を示す記述が入るのを止める。規則をすり抜けたときの最後の止めである。
// ハーネスが署名を足すよう促すことがあり、規則を読んでいても混じる。
//
// 見るのは、それらを書く git と gh の呼び出しだけにする。本文はコマンドの文字列に加え、-F や --body-file で渡す
// ファイルの中身も読む。Claude Code と Codex は同じ入出力(stdin の JSON と hookSpecificOutput)を使うので、
// 1 つで両方に効く。判定できない入力は必ず通す — フックの誤りで作業そのものを止めないため。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 本文を書く呼び出し
const WRITES = [
  /\bgit\b[^|;&]*\bcommit\b/,
  /\bgh\s+(?:pr|issue)\s+(?:create|edit|comment|review|merge)\b/,
  /\bgh\s+api\b[^|;&]*\b(?:issues|pulls)\b/,
];

// AI の関与を示す記述。署名の行と、セッションの URL
const MARKS = /Generated with \[?(?:Claude Code|Codex)|Co-Authored-By:[^\n]*(?:Claude|Codex|noreply@anthropic\.com|noreply@openai\.com)|claude\.ai\/code\/session/i;

// 本文をファイルで渡す指定。git commit -F / --file、gh の --body-file と -F/-f/--field body=@
// body=@ の形を先に試す。-F の後に body=@ が来たとき、-F <ファイル> と読み違えないため
const FILES = /(?:(?:\s-F|\s-f|\s--field)\s+body=@|\s-F\s+|\s--file[= ]|\s--body-file[= ])(['"]?)([^\s'"]+)\1/g;

export function check(command, cwd = process.cwd()) {
  if (!WRITES.some((re) => re.test(command))) return null;
  let text = command;
  for (const [, , file] of command.matchAll(FILES)) {
    try {
      text += `\n${fs.readFileSync(path.resolve(cwd, file), 'utf8')}`;
    } catch {}
  }
  const hit = text.match(MARKS);
  if (!hit) return null;
  return `コミットメッセージ、PR、issue に、AI の関与を示す記述(\`${hit[0].trim()}\`)を入れないでください。その行を落としてから実行し直してください。`;
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return;
  }
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return;
  const reason = check(command, input.cwd);
  if (!reason) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch {}
}
