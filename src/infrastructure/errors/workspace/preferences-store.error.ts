import { AppError } from '~/app-kernel/error.ts';

/* `preferences.json` を置く場所にまつわるエラー。

   glasshive は観測元に一切書き込まない。**唯一の書き込みが `preferences.json` である。**
   だから「書かないと決めたパスを指していた」ことを、独立したエラーコードで外へ出す。 */

/** 書いてよいパスではなかったので断った。もう一度求めても、保存先を変えるまでは同じ */
export class PreferencesRefusedError extends AppError {
  readonly code = 'preferences.refused';
}

/** 断ってはいないが、置けなかった。権限が無い、書き込む余地が無い、など */
export class PreferencesWriteError extends AppError {
  readonly code = 'preferences.unwritable';
}

/** `preferences.json` を読みに行けなかった。無かったのではない */
export class PreferencesReadError extends AppError {
  readonly code = 'preferences.unreadable';
}
