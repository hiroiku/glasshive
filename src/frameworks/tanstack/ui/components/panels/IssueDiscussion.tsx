import {
  mdiAccountMinusOutline,
  mdiAccountPlusOutline,
  mdiCancel,
  mdiCheckCircleOutline,
  mdiContentDuplicate,
  mdiFileTreeOutline,
  mdiFlagOffOutline,
  mdiFlagOutline,
  mdiGithub,
  mdiLabelOffOutline,
  mdiLabelOutline,
  mdiLinkVariant,
  mdiPencilOutline,
  mdiRestart,
} from '@mdi/js';
import type { ReactNode } from 'react';
import type {
  GithubActorJson,
  GithubIssueDiscussionEntryJson,
  GithubIssueDiscussionJson,
  GithubIssueReferenceJson,
  GithubLabelJson,
} from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { formatSinceIso } from '../../format.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { IssueChip } from '../chips/Chips.tsx';
import { Avatar } from '../primitives/Avatar.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { NotObserved } from '../primitives/NotObserved.tsx';
import { ReadingLines } from '../primitives/ReadingLines.tsx';
import { MdView } from '../text/MdView.tsx';

/* 課題 1 件のやり取り。コメントと `timeline` のイベントを 1 本のタイムラインに並べる。

   **コメントとイベントの重さを変える。** コメントは読むもので、イベントは文脈である。
   同じ姿で並べると、ラベルの付け外し 10 件がコメント 1 件を埋めてしまう。コメントは本文と
   同じ `MdView` で描き、イベントは 1 行に畳んで沈める。

   ここは描くだけで、尋ねるのは `GithubIssueDetail` である。答えをそのまま受け取るのは、
   途中で潰さないためである —— 「まだ返っていない」「誰も何も言っていない」「読めなかった」
   の 3 つは、どれも項目の無い画面になる。

   やり取りはページごとに届く。**届いたぶんから描く** —— 何百も続いた課題の最初の 10 件を、
   5 ページぶんの往復が終わるまで隠しておく理由が無い。まだ途中であることは、届いた項目の
   下に置いた行が言う。 */

export interface IssueDiscussionProps {
  /** 届いたページまでのやり取り。まだ 1 枚も届いていなければ `undefined` */
  readonly answer: GithubIssueDiscussionJson | undefined;
  /** 取りに行けなかったか。答えの無いことと、読めなかったことは違う */
  readonly failed: boolean;
  /** まだ尋ねている最中か。答えの無いことと、読めなかったことは違う */
  readonly pending: boolean;
  readonly project: ProjectJson | undefined;
  readonly nowMs: number;
  /** GitHub 上のこの課題の URL。読めなかったときの手立てに添える */
  readonly url: string | null;
}

/** その項目が名指しているもの。並びの中で 1 項目を指す名前を作るためだけに使う */
function subjectOf(entry: GithubIssueDiscussionEntryJson): string {
  switch (entry.kind) {
    case 'comment':
      return String(entry.body?.length ?? -1);
    case 'closed':
      return entry.reason ?? '';
    case 'reopened':
      return '';
    case 'labeled':
    case 'unlabeled':
      return entry.label.name;
    case 'assigned':
    case 'unassigned':
      return entry.assignee?.login ?? '';
    case 'milestoned':
    case 'demilestoned':
      return entry.milestone_title ?? '';
    case 'renamed':
      return entry.current_title ?? '';
    case 'parent-added':
      return String(entry.parent.number);
    case 'blocked-by-added':
      return String(entry.blocking_issue.number);
    case 'marked-as-duplicate':
      return String(entry.canonical.number);
    case 'cross-referenced':
      return String(entry.source.number);
  }
}

/* 並びの中で 1 項目を指す名前。

   GitHub は項目に id を振って返さないので、区別の付くものを繋いで作る。同じ人が同じ秒に
   同じ種類のイベントを同じ相手へ起こすことは無い。 */
const entryKey = (entry: GithubIssueDiscussionEntryJson): string =>
  `${entry.at}:${entry.kind}:${entry.actor?.login ?? ''}:${subjectOf(entry)}`;

/* 起こした人。**名指されているなら、いつも顔と名前の両方を出す。**

   顔を引けない人には頭文字だけの `.av` が残る。誰も名指されていない項目には `.av` そのものを
   出さない —— GitHub は消えたユーザーやアプリの起こしたイベントに `actor: null` を返すので、
   「顔が無い人」と「名指されていない」を同じ絵にすると、読めなかったことが誰かの不在に化ける。

   顔は `decorative` で伏せる。名前がすぐ隣に文字で並んでいるので、伏せないと 2 回読まれる。 */
function Who({ actor }: { actor: GithubActorJson | null }) {
  if (actor === null) return <span className="dimtxt">unknown</span>;
  return (
    <span className="disc-who">
      <Avatar actor={actor} decorative />
      {actor.login}
    </span>
  );
}

/** イベントが名指す題。GitHub が題を返さなかったことを、無題として出さない */
function Named({ title }: { title: string | null }) {
  if (title === null) return <span className="dimtxt">unknown</span>;
  return <span className="disc-ttl">{title}</span>;
}

/* イベントが名指す課題や PR。**押せる。** ここを素の番号で出すと、話の繋がった先を
   読んだ人が自分で探すことになる。 */
function Reference({ reference }: { reference: GithubIssueReferenceJson }) {
  return (
    <>
      <IssueChip id={`#${reference.number}`} />
      {reference.title !== null && <span className="disc-ttl"> {reference.title}</span>}
    </>
  );
}

/* ラベル。課題のパネルのラベルの行と同じ姿にしてある —— 同じものが場所によって違う
   見た目で出ると、同じものだと読めない。押せば、そのラベルで絞った一覧へ移る。 */
function Label({ label }: { label: GithubLabelJson }) {
  const nav = useNav();
  const color = label.color === null || label.color === '' ? null : label.color;
  return (
    <button
      type="button"
      className={`lbl${color === null ? '' : ' tinted'}`}
      style={color === null ? undefined : { ['--lc' as string]: `#${color}` }}
      onClick={() => nav.gotoIssues(label.name)}
    >
      {label.name}
    </button>
  );
}

/** コメント以外の項目。コメントは本文を持つので、1 行のイベントとは別の姿で描く */
type DiscussionEventJson = Exclude<GithubIssueDiscussionEntryJson, { kind: 'comment' }>;

/* イベント 1 件の、アイコンと言い分と、アイコンの色。

   **種類を網羅した `switch` にする。** `default` でまとめると、種類を足したときに
   「何かが起きた」としか出ない行が黙って混ざる。

   色が付くのは、閉じた・開き直した・堰き止めたと言う行と、マイルストーンを付け外しした行
   だけである。前者は一覧がその状態に使っている `st-*` をそのまま渡すので、色を決める表は
   1 つのままになる。これは行が何をしたかの色であって、この課題がいま一覧でどう並ぶかでは
   ない —— 閉じた課題に堰き止めが足されることも在る。後者の `ev-ms` は、ガントの期日の
   縦線と同じ `--input` から採る。それ以外の行は色を持たない。 */
function eventOf(entry: DiscussionEventJson): { icon: string; what: ReactNode; tone?: string } {
  switch (entry.kind) {
    case 'closed':
      return {
        icon: mdiCheckCircleOutline,
        /* 「やり終えた」と「やらないことにした」で色が違う。一覧のチップがそう分けている。
           `reason` は GitHub の `stateReason` をそのまま運ぶので、一覧の状態を組み立てる
           `statusOf` と同じ綴りで見る */
        tone: (entry.reason ?? '').toUpperCase() === 'NOT_PLANNED' ? 'st-not_planned' : 'st-closed',
        what: (
          <>
            closed this
            {entry.reason !== null && <span className="dimtxt"> as {entry.reason}</span>}
          </>
        ),
      };
    case 'reopened':
      return { icon: mdiRestart, tone: 'st-open', what: 'reopened this' };
    case 'labeled':
      return {
        icon: mdiLabelOutline,
        what: (
          <>
            added <Label label={entry.label} />
          </>
        ),
      };
    case 'unlabeled':
      return {
        icon: mdiLabelOffOutline,
        what: (
          <>
            removed <Label label={entry.label} />
          </>
        ),
      };
    case 'assigned':
      return {
        icon: mdiAccountPlusOutline,
        what: (
          <>
            assigned <Who actor={entry.assignee} />
          </>
        ),
      };
    case 'unassigned':
      return {
        icon: mdiAccountMinusOutline,
        what: (
          <>
            unassigned <Who actor={entry.assignee} />
          </>
        ),
      };
    case 'milestoned':
      return {
        icon: mdiFlagOutline,
        tone: 'ev-ms',
        what: (
          <>
            added this to <Named title={entry.milestone_title} />
          </>
        ),
      };
    case 'demilestoned':
      return {
        icon: mdiFlagOffOutline,
        tone: 'ev-ms',
        what: (
          <>
            removed this from <Named title={entry.milestone_title} />
          </>
        ),
      };
    /* 改題は前と後ろを両方出す。後ろだけでは、題の何が変わったのかが読めない */
    case 'renamed':
      return {
        icon: mdiPencilOutline,
        what: (
          <>
            renamed <span className="disc-was">{entry.previous_title}</span> to{' '}
            <Named title={entry.current_title} />
          </>
        ),
      };
    case 'parent-added':
      return {
        icon: mdiFileTreeOutline,
        what: (
          <>
            added this to <Reference reference={entry.parent} />
          </>
        ),
      };
    case 'blocked-by-added':
      return {
        icon: mdiCancel,
        tone: 'st-blocked',
        what: (
          <>
            marked this blocked by <Reference reference={entry.blocking_issue} />
          </>
        ),
      };
    case 'marked-as-duplicate':
      return {
        icon: mdiContentDuplicate,
        what: (
          <>
            marked this a duplicate of <Reference reference={entry.canonical} />
          </>
        ),
      };
    /* 触れただけの参照と、マージされたらこの課題を閉じる参照は別のことである */
    case 'cross-referenced':
      return {
        icon: mdiLinkVariant,
        what: (
          <>
            referenced this in <Reference reference={entry.source} />
            {entry.will_close_target && <span className="dimtxt"> will close this</span>}
          </>
        ),
      };
  }
}

function Entry({
  entry,
  project,
  nowMs,
}: {
  entry: GithubIssueDiscussionEntryJson;
  project: ProjectJson | undefined;
  nowMs: number;
}) {
  const since = formatSinceIso(entry.at, nowMs);

  if (entry.kind === 'comment') {
    return (
      <div className="cmt">
        <div className="cmt-h">
          <i className="disc-dot" />
          <Who actor={entry.actor} />
          <span className="disc-when">{since}</span>
        </div>
        {/* 本文の無いコメントと、本文を読めなかったコメントを同じ空白にしない */}
        {entry.body === null ? (
          <span className="dimtxt">The text of this comment did not come back</span>
        ) : (
          entry.body !== '' && <MdView text={entry.body} source="github" project={project} />
        )}
      </div>
    );
  }

  const { icon, what, tone } = eventOf(entry);
  return (
    <div className="disc-ev">
      <i className="disc-dot" />
      <Icon
        path={icon}
        size={11}
        className={tone === undefined ? 'disc-ico' : `disc-ico ${tone}`}
      />
      <span className="disc-say">
        <Who actor={entry.actor} /> {what}
      </span>
      <span className="disc-when">{since}</span>
    </div>
  );
}

export function IssueDiscussion({
  answer,
  failed,
  pending,
  project,
  nowMs,
  url,
}: IssueDiscussionProps) {
  const discussion = failed ? undefined : answer;
  /* 1 枚も届いていないあいだ。**空の並びも、何も無い画面も出さない** —— どちらも、これから
     届くやり取りが「まだ何も言われていない」ものとして画面に出る。見出しは先に置く ——
     やり取りがここに来ることは、届く前から分かっている。

     尋ねてもいない `absent` もここに入る。歩き終える前の `absent` は「この番号のやり取りは
     無かった」ではなく、まだ最初の 1 枚が着いていないという意味である。**`unobservable` は
     入らない** —— 読めなかったことは最初の 1 枚で決まっているので、歩き終えるのを待たない。 */
  const reading =
    discussion !== undefined &&
    !discussion.walked &&
    discussion.entries.length === 0 &&
    discussion.state !== 'unobservable';
  if ((discussion === undefined && pending) || reading) {
    return (
      <>
        <div className="sec-h">Discussion</div>
        <ReadingLines lines={4} label="Reading the discussion" />
      </>
    );
  }

  if (discussion === undefined || discussion.state !== 'observed') {
    /* 読めなかった理由。`gh` が入っていないのか、認証が切れたのか、その番号が無かったのかは
       ここにしか残らない */
    const code = discussion?.reason ?? null;
    const steps =
      url === null ? {} : { steps: [{ text: 'Read the discussion on GitHub', href: url }] };
    /* **観測できなかったのと、その番号が無かったのは別である。** 前者は `gh` が答えなかった
       ことで、後者は `gh` が答えたうえで、その答えにこの課題が無かったことである。 */
    if (discussion?.state === 'absent') {
      return (
        <NotObserved
          partial
          icon={mdiGithub}
          title="GitHub has no discussion under this number"
          detail="gh answered, and the answer carried no issue with this number. A deleted issue, or a number that belongs to another repository, looks like this. It does not say that nothing was written."
          {...(code === null ? {} : { code })}
          {...steps}
        />
      );
    }
    return (
      <NotObserved
        partial
        icon={mdiGithub}
        title="The discussion did not come back"
        detail="Comments and events are fetched on their own when you open an issue, and that fetch did not answer. The rest of this panel is built from the issue list, which glasshive already has."
        {...(code === null ? {} : { code })}
        {...steps}
      />
    );
  }

  return (
    <>
      <div className="sec-h">Discussion</div>
      {discussion.entries.length === 0 ? (
        /* 誰も何も言っていない。**読めなかったのとは違う画面にする** —— 同じ画面にすると、
           静かな課題と観測できなかった課題の見分けが付かない。 */
        <p className="disc-quiet">Nothing has been said on this issue yet.</p>
      ) : (
        <div className="disc">
          {/* GitHub が返した順のまま、古いものから並べる。並べ替えると、同じ時刻に並んだ
              イベントの前後が入れ替わる */}
          {discussion.entries.map((entry) => (
            <Entry key={entryKey(entry)} entry={entry} project={project} nowMs={nowMs} />
          ))}
        </div>
      )}
      {/* 続きが届く先を、届く前から空けておく。**畳まない** —— 項目の下で画面が止まって
          見えると、そこがやり取りの終わりとして読める */}
      {!discussion.walked && <ReadingLines lines={2} label="Reading more of the discussion" />}
      {/* 切ったことを黙らない。黙ると、読まなかったぶんが「言われなかった」ことになる */}
      {discussion.walked && discussion.truncated && (
        <p className="disc-cut">
          Only the first part of this discussion was read. Anything said after the last entry above
          is not on this screen.
        </p>
      )}
    </>
  );
}
