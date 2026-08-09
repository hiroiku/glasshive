import { AppError } from '~/app-kernel/error.ts';

/* 覚え書きを置く場所にまつわる誤り。

   この道具は観測元に一切書き込まない。**唯一の書き込みが覚え書きである。**
   だから「書かないと決めた場所を指していた」ことを、独立した名札で外へ出す。 */

/** 書いてよい場所ではなかったので断った。もう一度求めても、置き場を変えるまでは同じ */
export class PreferencesRefusedError extends AppError {
  readonly code = 'preferences.refused';
}

/** 断ってはいないが、置けなかった。権利が無い、書き込む余地が無い、など */
export class PreferencesWriteError extends AppError {
  readonly code = 'preferences.unwritable';
}

/** 覚え書きを読みに行けなかった。無かったのではない */
export class PreferencesReadError extends AppError {
  readonly code = 'preferences.unreadable';
}
