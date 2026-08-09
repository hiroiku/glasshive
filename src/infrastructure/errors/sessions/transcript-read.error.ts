import { AppError } from '~/app-kernel/error.ts';

/** 正本を読みに行けなかった。無かったのではなく、読む権利が無いなどの事情がある */
export class TranscriptReadError extends AppError {
  readonly code = 'transcript.unreadable';
}

/** 生きている道具を数えに行けなかった */
export class ProcessInspectionError extends AppError {
  readonly code = 'process.uninspectable';
}
