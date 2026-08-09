import fs from 'node:fs';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { TranscriptReadError } from '~/infrastructure/errors/sessions/transcript-read.error.ts';

/* 大きなファイルを、決めた量だけ読む。

   正本は追記され続けるので、全部を読む作りにすると大きなセッション 1 つで観測が止まる。
   だから読む量に上限を置き、**上限に当たったことを値として持ち帰る**。

   ここは errno が見える唯一の場所である。**無いことと読めなかったことを、ここで分ける。**
   一度潰すと、上の層では二度と分けられない。 */

/** 見に行けなかったのか、無いだけなのかを errno から見分ける */
export function classifyReadFailure(error: unknown, what: string): Observation<never> {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return absent('no-source');
  return unobservable(
    new TranscriptReadError(`Could not read ${what}`, {
      cause: error,
      details: { code },
    }),
  );
}

export interface FileStat {
  readonly mtimeMs: number;
  readonly size: number;
}

export function statFile(file: string): Observation<FileStat> {
  try {
    const stat = fs.statSync(file);
    return observed({ mtimeMs: stat.mtimeMs, size: stat.size });
  } catch (error) {
    return classifyReadFailure(error, file);
  }
}

/** 読み取った窓。`complete` は、その向きでファイルの端まで届いたか */
export interface BoundedWindow {
  readonly text: string;
  readonly complete: boolean;
}

/** 指定の位置から指定の量だけ。読めた分だけを返す */
function readBytes(file: string, start: number, length: number): Observation<Buffer> {
  if (length <= 0) return observed(Buffer.alloc(0));
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch (error) {
    return classifyReadFailure(error, file);
  }
  try {
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, start);
    return observed(buffer.subarray(0, read));
  } catch (error) {
    return classifyReadFailure(error, file);
  } finally {
    fs.closeSync(fd);
  }
}

/* 先頭から読む。**上限ぴったり読めたときだけ、末尾の欠けた行を捨てる。**

   上限に当たったということは、その行が途中で切れている見込みが高い。
   届いたときは最後まで読めているので、捨てない。 */
export function readHeadWindow(
  file: string,
  max: number,
  trimPartialLine: boolean,
): Observation<BoundedWindow> {
  const buffer = readBytes(file, 0, max);
  if (buffer.kind !== 'observed') return buffer;
  const text = buffer.value.toString('utf8');
  const complete = buffer.value.length < max;
  if (complete || !trimPartialLine) return observed({ text, complete });
  const lastBreak = text.lastIndexOf('\n');
  return observed({
    text: lastBreak >= 0 ? text.slice(0, lastBreak) : text,
    complete,
  });
}

/* 末尾から読む。**途中から読み始めたときだけ、最初の欠けた行を捨てる。**

   捨てないと、行の途中から始まる字を 1 行として読み解こうとして、必ず失敗する。
   帯を拾うような、行として読まない使い方では捨てなくてよい。 */
export function readTailWindow(
  file: string,
  max: number,
  size: number,
  trimPartialLine: boolean,
): Observation<BoundedWindow> {
  const start = Math.max(0, size - max);
  const buffer = readBytes(file, start, size - start);
  if (buffer.kind !== 'observed') return buffer;
  const text = buffer.value.toString('utf8');
  const complete = start === 0;
  if (complete || !trimPartialLine) return observed({ text, complete });
  const firstBreak = text.indexOf('\n');
  return observed({
    text: firstBreak >= 0 ? text.slice(firstBreak + 1) : '',
    complete,
  });
}
