import { err, ok, type Result } from '~/app-kernel/result.ts';
import { InvalidRevisionError } from '~/domain/errors/git/revision.error.ts';

/* git に渡す「指し」。

   **外から来た字をそのまま渡すと、外の道具の指定として読まれる。**
   `--upload-pack=…` は git が自分で起こす別の道具を指す指定で、渡した先で任意の命令が動く。
   だから求めと共に来た字は、この型を通してしか git まで届かないようにする。

   確かめるのは求めと共に来た字だけでよい。枝の名や sha は git 自身が答えたもので、
   こちらの求めが決めた字ではないので `fromGitOutput` で通す。どちらの道で作った指しも、
   起こすときには `--end-of-options` の後ろに置かれる(二重の守り)。 */

/** 先頭を英数字に限る。`-` で始まれないので、単体では指定になり得ない */
const REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export class Revision {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /** 求めと共に来た字から作る。形が合わなければ断る */
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

  /** git 自身が答えた字から作る。求めの側が決めた字ではないので、形は問わない */
  static fromGitOutput(raw: string): Revision {
    return new Revision(raw);
  }
}

/** 2 つの指しの隔たり。git はこれも 1 つの指しとして受ける */
export class RevisionRange {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /** `a..b` — b にあって a に無い記録 */
  static between(from: Revision, to: Revision): RevisionRange {
    return new RevisionRange(`${from.value}..${to.value}`);
  }

  /** `a...b` — 分かれ目から b までの差 */
  static sinceFork(from: Revision, to: Revision): RevisionRange {
    return new RevisionRange(`${from.value}...${to.value}`);
  }
}
