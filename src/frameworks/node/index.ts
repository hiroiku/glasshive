import { parseArgs } from './cli.js';
import { launch } from './launcher.js';

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  (parsed.exitCode === 0 ? process.stdout : process.stderr).write(parsed.message);
  process.exit(parsed.exitCode);
}

try {
  await launch(parsed.args);
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`起動できませんでした(番号 ${parsed.args.port}): ${message}`);
  process.exit(1);
}
