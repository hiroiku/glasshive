import { AppError } from '~/app-kernel/error.ts';

/** 見張りを張れなかった。機械の側の事情なので、観測そのものは続けられる */
export class TranscriptWatchError extends AppError {
  readonly code = 'transcript.watch_unavailable';
}
