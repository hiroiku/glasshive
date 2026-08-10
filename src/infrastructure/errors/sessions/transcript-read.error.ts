import { AppError } from '~/app-kernel/error.ts';

/** `transcript` を読みに行けなかった。無かったのではなく、読む権限が無いなどの事情がある */
export class TranscriptReadError extends AppError {
  readonly code = 'transcript.unreadable';
}

/** 生きているプロセスを数えに行けなかった */
export class ProcessInspectionError extends AppError {
  readonly code = 'process.uninspectable';
}
