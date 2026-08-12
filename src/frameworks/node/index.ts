import { parseArgs } from './cli.js';
import { reportStatus, stopRunning } from './commands.js';
import { portsToTry } from './instance.js';
import { launch } from './launcher.js';

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  (parsed.exitCode === 0 ? process.stdout : process.stderr).write(parsed.message);
  process.exit(parsed.exitCode);
}

/* 失敗の中身をそのまま出す。ここで「ポートを取れなかった」と決め打つと、走っている
   glasshive に断られたときに嘘の理由が出る。 */
try {
  const range = portsToTry(parsed.args.port);
  if (parsed.args.action === 'status') process.exit(await reportStatus(range, false));
  if (parsed.args.action === 'stop') process.exit(await stopRunning(range, false));
  await launch(parsed.args);
} catch (e) {
  console.error(`glasshive: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
