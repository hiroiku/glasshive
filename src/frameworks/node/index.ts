import { parseArgs } from './cli.js';
import { runCommand } from './commands.js';
import { launch } from './launcher.js';

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  (parsed.exitCode === 0 ? process.stdout : process.stderr).write(parsed.message);
  process.exit(parsed.exitCode);
}

/* 尋ねて終わるだけの求めは、開発用のスクリプトと同じ `runCommand` を通す。**立ち上げ方に
   よって `--stop` の意味が変わってはいけない。** */
const code = await runCommand(parsed.args, false);
if (code !== null) process.exit(code);

/* 失敗の中身をそのまま出す。ここで「ポートを取れなかった」と決め打つと、走っている
   glasshive に断られたときに嘘の理由が出る。 */
try {
  await launch(parsed.args);
} catch (e) {
  console.error(`glasshive: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
