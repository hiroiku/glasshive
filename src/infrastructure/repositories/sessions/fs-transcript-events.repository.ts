import fs from 'node:fs';
import { type Observation, observed } from '~/app-kernel/observation.ts';
import type {
  TranscriptEventsRepository,
  TranscriptPage,
  TranscriptPageRequest,
} from '~/application/ports/repositories/sessions/transcript-events.repository.ts';
import { classifyReadFailure } from '~/infrastructure/io/bounded-read.ts';

/* `transcript` を、バイト位置でページに切って読む。

   ここは `transcript` の中身を一切知らない。知っているのは「行は改行で終わる」ことだけで、
   行が何であるかは渡された `reduce` が決める。

   守るべき不変条件が 2 つある。**どちらも破ると、追いかけている会話が黙って欠ける。**

   1. 行の頭から読む。途中の位置を渡されたら、そこから最初の改行までを捨てる。
      捨てないと、行の途中から始まる文字列を 1 行としてパースしようとして必ず失敗する。
   2. 書き込み途中の行を消費しない。改行で終わっていない末尾は、読まずに残して
      `next` を進めない。進めると、その行が完成した後にもう一度読む手段が無くなる。 */

/** 読み出した 1 行と、それが占めていたバイト数 */
interface RawLine {
  readonly line: string;
  /** 改行を含めた長さ。0 なら、もう読むものが無い */
  readonly bytes: number;
  /** 改行で終わっていたか。`false` は書き込み途中 */
  readonly complete: boolean;
}

/* fd から 1 行を読む。改行が見付かるまで、決めた単位で読み進む。

   まとめて読まないのは、1 行の長さが分からないからである。長い行のために大きく取ると
   短い行ばかりの `transcript` で無駄が出て、小さく取ると長い行で何度も読み直すことになる。 */
function readLineAt(fd: number, pos: number, size: number, blockBytes: number): RawLine {
  const parts: Buffer[] = [];
  let scanned = 0;
  while (pos + scanned < size) {
    const length = Math.min(blockBytes, size - pos - scanned);
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, pos + scanned);
    if (read <= 0) break;
    const chunk = buffer.subarray(0, read);
    const breakAt = chunk.indexOf(0x0a);
    if (breakAt >= 0) {
      parts.push(chunk.subarray(0, breakAt + 1));
      const whole = Buffer.concat(parts);
      return {
        line: whole.toString('utf8'),
        bytes: whole.length,
        complete: true,
      };
    }
    parts.push(chunk);
    scanned += read;
  }
  const whole = Buffer.concat(parts);
  return { line: whole.toString('utf8'), bytes: whole.length, complete: false };
}

/* 読み始めの位置を行の頭へ揃える。

   直前のバイトが改行なら、そこはもう行の頭である。そうでなければ、
   途中から始まる 1 行を読み捨てて次の行の頭へ移る。 */
function alignToLineStart(fd: number, from: number, size: number, blockBytes: number): number {
  if (from <= 0) return 0;
  const probe = Buffer.alloc(1);
  fs.readSync(fd, probe, 0, 1, from - 1);
  if (probe[0] === 0x0a) return from;
  return from + readLineAt(fd, from, size, blockBytes).bytes;
}

export function createFsTranscriptEventsRepository(): TranscriptEventsRepository {
  return {
    async readPage<T>(
      file: string,
      request: TranscriptPageRequest,
      reduce: (line: string) => T | null,
    ): Promise<Observation<TranscriptPage<T>>> {
      let fd: number;
      try {
        fd = fs.openSync(file, 'r');
      } catch (error) {
        return classifyReadFailure(error, file);
      }
      try {
        const size = fs.fstatSync(fd).size;
        const requested =
          request.from === null
            ? Math.max(0, size - request.tailWindowBytes)
            : Math.min(request.from, size);
        const start = alignToLineStart(fd, requested, size, request.readBlockBytes);

        const limit = request.to ?? Number.POSITIVE_INFINITY;
        const items: T[] = [];
        let pos = start;
        while (
          pos < limit &&
          items.length < request.maxItems &&
          pos - start < request.maxChunkBytes
        ) {
          const { line, bytes, complete } = readLineAt(fd, pos, size, request.readBlockBytes);
          // 読むものが尽きたか、書き込み途中の行に当たった。どちらもここで止める
          if (bytes === 0 || !complete) break;
          pos += bytes;
          const item = reduce(line);
          if (item !== null) items.push(item);
        }
        return observed({ start, next: pos, eof: pos >= size, size, items });
      } catch (error) {
        return classifyReadFailure(error, file);
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}
