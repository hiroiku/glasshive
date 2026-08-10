import { err, ok, type Result } from '~/app-kernel/result.ts';
import { InvalidRevisionError } from '~/domain/errors/git/revision.error.ts';

/* `git` に渡すリビジョン。

   **外から来た文字列をそのまま渡すと、`git` のオプションとして読まれる。**
   `--upload-pack=…` は `git` が自分で起動する別のコマンドを指すオプションで、
   渡した先で任意の命令が動く。だから呼び出しと共に来た文字列は、この型を通してしか
   `git` まで届かないようにする。

   検証するのは呼び出しと共に来た文字列だけでよい。ブランチの名や sha は `git` 自身が答えた
   もので、こちらの呼び出しが決めた文字列ではないので `fromGitOutput` で通す。どちらの経路で作った
   リビジョンも、起動するときには `--end-of-options` の後ろに置かれる(二重の守り)。 */

/** 先頭を英数字に限る。`-` で始まれないので、単体ではオプションになり得ない */
const REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export class Revision {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /** 呼び出しと共に来た文字列から作る。形が合わなければ断る */
  static create(raw: string): Result<Revision, InvalidRevisionError> {
    if (!REVISION_PATTERN.test(raw)) {
      return err(
        new InvalidRevisionError('Not a usable revision', {
          details: { raw },
        }),
      );
    }
    return ok(new Revision(raw));
  }

  /** `git` 自身が答えた文字列から作る。呼び出しの側が決めた文字列ではないので、形は問わない */
  static fromGitOutput(raw: string): Revision {
    return new Revision(raw);
  }
}

/** 2 つのリビジョンの隔たり。`git` はこれも 1 つのリビジョンとして受ける */
export class RevisionRange {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /** `a..b` — b にあって a に無いコミット */
  static between(from: Revision, to: Revision): RevisionRange {
    return new RevisionRange(`${from.value}..${to.value}`);
  }

  /** `a...b` — 分かれ目から b までの差 */
  static sinceFork(from: Revision, to: Revision): RevisionRange {
    return new RevisionRange(`${from.value}...${to.value}`);
  }
}
