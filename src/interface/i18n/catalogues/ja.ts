import type { Catalogue } from '../message.ts';

/** 日本語。鍵は英語の原文そのもの */
export const ja: Catalogue = {
  'Starting glasshive': 'glasshive を起動しています',
  'The first read of ~/.claude/projects takes a moment.':
    '~/.claude/projects の最初の読み取りには少し時間がかかります。',
  'Realtime connection: disconnected': 'リアルタイム接続: 切断',
  'Realtime connection: connected': 'リアルタイム接続: 接続中',
  'Realtime connection: connected, but the watcher is down — updates will not arrive':
    'リアルタイム接続: 接続しているがウォッチャーが停止している — 更新は届かない',
  'Some projects could not be read — the count may be short':
    '一部のプロジェクトを読めなかった — 件数は足りていない可能性がある',
  'Counted from the projects read so far': 'ここまでに読めたプロジェクトから数えたもの',
  'also in this repository': '同じリポジトリ',
  active: '稼働中',
  waiting: '待機',
  input: '入力待ち',
  ended: '終了',
  'Notify when a session starts awaiting input': 'セッションが入力待ちになったら知らせる',
  'Notifications on: alerts you when a session starts awaiting input (only while the window is unfocused)':
    '通知オン: セッションが入力待ちになったら知らせる（ウィンドウが前面にないときだけ）',
  'Notifications off — click to enable': '通知オフ — クリックで有効にする',
  'Reading transcripts': 'トランスクリプトを読んでいます',
  'A large ~/.claude/projects takes a moment on the first read':
    '~/.claude/projects が大きいと、最初の読み取りに少し時間がかかる',
  'Could not read the transcript roots — projects are not missing, we could not look':
    'トランスクリプトの置き場所を読めなかった — プロジェクトが無いのではなく、見に行けなかった',
  '{n, plural, one {# project could not be read — its row shows what we could see, not what is there} other {# projects could not be read — their rows show what we could see, not what is there}}':
    '{n, plural, other {# 件のプロジェクトを読めなかった — その行に出ているのは見えたものであって、そこに在るものではない}}',
  'Could not count live processes — waiting and ended cannot be told apart':
    '生きているプロセスを数えられなかった — 待機と終了を見分けられない',
  'Could not read the watched projects — the order fell back to the default':
    '観ているプロジェクトを読めなかった — 並びは既定に戻した',
  'Nothing watched yet — pick a directory above, or run `glasshive` where you work':
    'まだ観ているものが無い — 上の一覧から選ぶか、作業するディレクトリで `glasshive` を動かす',
  'Nothing watched yet — run `glasshive` in a directory to watch it':
    'まだ観ているものが無い — 観たいディレクトリで `glasshive` を動かす',
  '{n, plural, one {# directory found that you are not watching} other {# directories found that you are not watching}}':
    '{n, plural, other {観ていないディレクトリが # 件見つかっている}}',
  Watch: '観る',
  'could not read where this is': 'どこに在るかを読めなかった',
  'Nothing to read yet — ~/.claude/projects is not there':
    '読むものがまだ無い — ~/.claude/projects が無い',
  'Unknown — the projects could not be counted': '不明 — プロジェクトを数えられなかった',
  'No matching projects (0 of {total})': '一致するプロジェクトが無い（{total} 件中 0 件）',
  'No matches yet among the projects read so far (0 of {total})':
    'ここまでに読めたプロジェクトの中に、まだ一致するものが無い（{total} 件中 0 件）',
  'waiting for you': 'あなたを待っている',
  'an agent is working': 'エージェントが動いている',
  'idle, but the process is alive': '動いていないが、プロセスは生きている',
  'nothing running': '何も動いていない',
  'not read yet, or could not be read': 'まだ読んでいない、または読めなかった',
  'share of the tokens spent in the last 24h by the projects shown':
    '出ているプロジェクトが直近 24 時間に使ったトークンのうちの割合',
  'when anything in the project was running, over the {span} window':
    '{span} の範囲で、プロジェクトの中で何かが動いていた時間',
  'some of that activity could not be read': 'その稼働の一部を読めなかった',
  'Drag to resize': 'ドラッグで幅を変える',
  'Switch to overlay panel (floats over the main area)':
    '重ねるパネルに切り替える（本文の上に浮かぶ）',
  'Switch to side-by-side panel (shrinks the main area)':
    '並べるパネルに切り替える（本文が狭くなる）',
  'Opening the panel': 'パネルを開いています',
  'Toggle panel': 'パネルの開閉',
  'The agent columns are blank because the transcripts could not be read — not because nobody is working on these.':
    'エージェントの列が空なのは、トランスクリプトを読めなかったからである。誰も手を付けていないという意味ではない。',
  issues: '課題',
  'Fetching issues from GitHub': 'GitHub から課題を取得しています',
  'gh is paging through this repository — a large one takes a few seconds':
    'gh がこのリポジトリを順に読んでいる — 大きいと数秒かかる',
  'Fetching the rest of the issues from GitHub': '残りの課題を GitHub から取得しています',
  'this view needs every issue — the dependencies and milestones are read from the whole list':
    'この画面には全ての課題が要る — 依存とマイルストーンは一覧全体から読む',
  'Search milestones…': 'マイルストーンを検索…',
  'Clear the milestone filter: {name}': 'マイルストーンの絞り込みを外す: {name}',
  'Clear the milestone filter': 'マイルストーンの絞り込みを外す',
  closed: '完了',
  'Reading issues from': '課題の読み取り元:',
  '. This project’s remotes point at {n} GitHub repositories — run `gh repo set-default` to change which one glasshive reads.':
    '。このプロジェクトのリモートは {n} 個の GitHub リポジトリを指している — どれを読むかは `gh repo set-default` で変えられる。',
  'Showing the most recently updated issues only — this repository has more than glasshive fetches in one go.':
    '直近に更新された課題だけを出している — このリポジトリには、glasshive が一度に取得する数より多く在る。',
  'Fetching the rest of the issues — the cumulative flow counts all of them':
    '残りの課題を取得している — 累積の推移は全件を数える',
  'the repository': 'このリポジトリ',
  'Reading branches and worktrees': 'ブランチと worktree を読んでいます',
  'No GitHub repository behind this project': 'このプロジェクトの後ろに GitHub リポジトリが無い',
  'glasshive asks the remotes where this project lives, and none of them point at GitHub. Branches and worktrees are still readable — switch to Branches above.':
    'glasshive はこのプロジェクトのリモートにパスを尋ねるが、どれも GitHub を指していない。ブランチと worktree は読めるので、上の Branches に切り替えてほしい。',
  'Point a remote at a GitHub repository': 'リモートを GitHub リポジトリに向ける',
  'Then this side fills in: the dependency graph, start order, and which agent is on which issue':
    'そうすればこちら側が埋まる。依存グラフ、着手の順、どのエージェントがどの課題に付いているかである',
  'Not a git repository': 'git リポジトリではない',
  'This project directory has no repository, so there are no branches, worktrees or conflicts to draw.':
    'このプロジェクトのディレクトリにはリポジトリが無いので、描けるブランチも worktree も衝突も無い。',
  'Start one': '作る',
  '{from} → {to} · activity could not be read': '{from} → {to} · 稼働を読めなかった',
  'input + output + cache write (transcripts active in the last 7 days only)':
    '入力 + 出力 + キャッシュ書き込み（直近 7 日に動いていたトランスクリプトのみ）',
  'Subagents could not be counted — this session may have more':
    'サブエージェントを数えられなかった — このセッションにはもっと居るかもしれない',
  Timeline: 'タイムライン',
  'No matching sessions (0 of {total}{short})':
    '一致するセッションが無い（{total} 件中 0 件{short}）',
  'Unknown — the sessions in this project could not be counted':
    '不明 — このプロジェクトのセッションを数えられなかった',
  'Reading the transcripts in this project': 'このプロジェクトのトランスクリプトを読んでいます',
  'Nothing to read — the directory for this project is not there':
    '読むものが無い — このプロジェクトのディレクトリが無い',
  'No sessions to show': '出せるセッションが無い',
  'Session / Subagent': 'セッション / サブエージェント',
  Status: '状態',
  Model: 'モデル',
  Effort: '推論の深さ',
  Tokens: 'トークン',
  'Working on': '作業中の対象',
  Worktree: 'worktree',
  Now: '現在',
  Updated: '更新',
  'a session that did not give a name': '名前を名乗らなかったセッション',
  'to {who}': '{who} へ',
  'from {who}': '{who} から',
  'the other end was not found in this project':
    'もう一方の端をこのプロジェクトの中に見つけられなかった',
  '{n} messages': '{n} 件のメッセージ',
  'Press Enter to open the conversation': 'Enter で会話を開く',
  'Sessions and subagents': 'セッションとサブエージェント',
  'awaiting user input': '利用者の入力を待っている',
  'waiting on subagents': 'サブエージェントを待っている',
  'Messages sent: {list}': '送ったメッセージ: {list}',
  'Could not be read.': '読めなかった。',
  '{tokens} — {percent}% of the {total} shown.': '{tokens} — 出ている {total} のうち {percent}%。',
  "Reading the open session's transcripts for messages agents sent each other":
    '開いているセッションのトランスクリプトから、エージェント同士のメッセージを読んでいます',
  "Draw arrows for messages agents sent each other (reads the open session's transcripts)":
    'エージェント同士のメッセージを矢印で描く（開いているセッションのトランスクリプトを読む）',
  'Messages could not be read — this is not the same as no messages':
    'メッセージを読めなかった — メッセージが無かったこととは違う',
  '{messages} messages in {marks} arrows': '{marks} 本の矢印に {messages} 件のメッセージ',
  '{n} whose other end was not found in this project — only this end is drawn':
    '{n} 件は、もう一方の端をこのプロジェクトの中に見つけられなかった — こちらの端だけを描いている',
  'not every session was opened to look for the other end':
    'もう一方の端を探すために全てのセッションを開いたわけではない',
  'none of these agents messaged each other in this window':
    'この範囲では、これらのエージェント同士のメッセージは 1 件も無い',
  '{n} outside the window or over the limit': '{n} 件は範囲の外か、上限を超えている',
  '{n} sent to a name that is not in this session, with nothing recording where they arrived':
    '{n} 件は、このセッションに無い名前へ送られていて、どこへ届いたかの記録が無い',
  'messages older than the scan window are not counted':
    '走査の範囲より古いメッセージは数えていない',
  'Search agents and transcripts…': 'エージェントとトランスクリプトを検索…',
  'Some transcripts could not be read. The rows stay narrowed to the matches found so far, so rows may be missing':
    '一部のトランスクリプトを読めなかった。行はここまでに見つかった一致に絞られたままなので、抜けている行が在るかもしれない',
  'Reading inside transcripts (last 1 MiB · last 7 days). Matches are added as they are read':
    'トランスクリプトの中を読んでいます（末尾 1 MiB · 直近 7 日）。一致は読めたものから足していく',
  transcripts: 'トランスクリプト',
  'transcripts could not be read': 'トランスクリプトを読めなかった',
  'reading transcripts…': 'トランスクリプトを読んでいます…',
  '{scanned} of {total} transcripts read': '{total} 件中 {scanned} 件のトランスクリプトを読んだ',
  messages: 'メッセージ',
  'Show only what needs attention: awaiting your input, or waiting 30 minutes with no activity':
    '手当てが要るものだけを出す。入力待ち、または 30 分何も動いていないもの',
  attention: '要対応',
  'Also show sessions that ended more than a day ago, and every subagent that ended':
    '1 日より前に終わったセッションと、終わったサブエージェントも出す',
  'Window start': '範囲の始まり',
  'Window end': '範囲の終わり',
  'Open conversation for {label}': '{label} の会話を開く',
  '{id} (closed)': '{id}（完了）',
  'Open issue {id}': '課題 {id} を開く',
  'View commit {label}': 'コミット {label} を見る',
  'View {name} in Git': '{name} を Git で見る',
  subagents: 'サブエージェント',
  'working on': '作業中',
  parent: '親',
  '{range} read from this transcript': 'このトランスクリプトから {range} を読んだ',
  'Select a session or subagent to view its conversation':
    'セッションかサブエージェントを選ぶと、その会話が出る',
  'Reading the conversation': '会話を読んでいます',
  'glasshive reads the end of the transcript first. A long one takes a moment.':
    'glasshive はトランスクリプトの末尾から読む。長いと少し時間がかかる。',
  'Reading older messages': '古いメッセージを読んでいます',
  'Load older': '古いものを読む',
  thinking: '思考',
  result: '結果',
  '— {n, plural, one {# shared file} other {# shared files}} (merge conflict likely)':
    '— 共通のファイル {n, plural, other {# 件}}（マージ衝突の可能性が高い）',
  'Press Enter to open the ref or commit': 'Enter で ref かコミットを開く',
  'Refs and commits': 'ref とコミット',
  'Ref / Commit': 'ref / コミット',
  'Assignee / Agents': '担当 / エージェント',
  Ahead: '先行',
  SHA: 'SHA',
  'named {id} in its conversation': '会話の中では {id} と名乗っている',
  'Pull request #{number} — {state}{review}': 'プルリクエスト #{number} — {state}{review}',
  draft: '下書き',
  'Milestone: {title} — show just this milestone':
    'マイルストーン: {title} — このマイルストーンだけを出す',
  'The branch point is not among the commits shown, so this line runs to the bottom of the graph — it did not fork there':
    '分岐点が、出ているコミットの中に無い。だからこの線は図の下端まで伸びている — そこで分かれたわけではない',
  'fork not shown': '分岐点は出ていない',
  '{n, plural, one {# commit behind {base}} other {# commits behind {base}}}':
    '{n, plural, other {{base} より # コミット遅れている}}',
  '{n} commits': '{n} コミット',
  'glasshive reads only the most recent stretch of {base} — commits older than these are not read, and a branch that left earlier has no branch point to draw':
    'glasshive は {base} の直近の範囲しか読まない — それより古いコミットは読んでいないので、それ以前に分かれたブランチには描ける分岐点が無い',
  'older commits are not read': 'それより古いコミットは読んでいない',
  '{id} {title} — closed by the pull request on this branch':
    '{id} {title} — このブランチのプルリクエストで閉じられる',
  'Search refs & commits…': 'ref とコミットを検索…',
  '{tips} live lines · {worktrees} worktrees · {branches} branches':
    '{tips} 本の生きている線 · {worktrees} 個の worktree · {branches} 本のブランチ',
  '{n} matches': '{n} 件が一致',
  'Dependency graph': '依存グラフ',
  'No issue blocks another one': '他を堰き止めている課題は無い',
  'Caught in a cycle — {n} cannot start': '循環に入っている — {n} 件が着手できない',
  'Ready now': 'いま着手できる',
  '{n} away': '{n} つ先',
  '{n, plural, one {No dependencies — # issue you can start any time} other {No dependencies — # issues you can start any time}}':
    '{n, plural, other {依存が無い — いつでも着手できる課題が # 件}}',
  'blocks — follow the arrows to get the start order': '堰き止め — 矢印を辿ると着手の順になる',
  'blocks inside a cycle': '循環の中の堰き止め',
  'agent working': 'エージェントが作業中',
  'finishing it frees n issues': 'これを終えると n 件が動けるようになる',
  'it is a sub-issue of #n': '#n の子課題である',
  'n of its m sub-issues are closed': 'm 件の子課題のうち n 件が完了している',
  'it has n comments': 'コメントが n 件ある',
  'its branch is n commits behind the base': 'ブランチが base より n コミット遅れている',
  'its branch touches the same files as another': 'ブランチが他と同じファイルを触っている',
  'the pull request that closes it': 'これを閉じるプルリクエスト',
  'Some blocking issues were not fetched': '堰き止めている課題の一部を取得していない',
  'some dependencies were not fetched — edges may be missing':
    '依存の一部を取得していない — 辺が抜けているかもしれない',
  'Hover an issue to see what finishing it frees':
    '課題にカーソルを合わせると、終えたときに何が動けるようになるかが出る',
  '{id} is caught in a cycle — nothing frees up until the cycle is broken':
    '{id} は循環に入っている — 循環を断つまで何も動けるようにならない',
  'Finishing {id} frees nothing': '{id} を終えても、何も動けるようにはならない',
  '{n, plural, one {Finishing {id} frees # issue} other {Finishing {id} frees # issues}}':
    '{n, plural, other {{id} を終えると # 件が動けるようになる}}',
  '{label} — {state}': '{label} — {state}',
  'Sub-issue of {parent}': '{parent} の子課題',
  '{closed} of {total} sub-issues closed': '子課題 {total} 件のうち {closed} 件が完了',
  '{n, plural, one {# comment} other {# comments}}': '{n, plural, other {コメント # 件}}',
  'still reading the local git': '手元の git をまだ読んでいる',
  'the local git could not be read, so how far behind it is, and whether it conflicts, are unknown':
    '手元の git を読めなかったので、どれだけ遅れているかも、衝突するかどうかも分からない',
  '{name} — {ahead} ahead, {behind} behind': '{name} — {ahead} 先行、{behind} 遅れ',
  'touches the same files as {list}': '{list} と同じファイルを触っている',
  'Pull request #{number}': 'プルリクエスト #{number}',
  '{n, plural, one {# issue} other {# issues}}': '{n, plural, other {課題 # 件}}',
  '{n, plural, one {# other event} other {# other events}}':
    '{n, plural, other {その他のイベント # 件}}',
  '{n, plural, one {# event} other {# events}}': '{n, plural, other {イベント # 件}}',
  '{kind} — {at}': '{kind} — {at}',
  event: 'イベント',
  '{n} events between {from} and {to} · {kinds}':
    '{from} から {to} の間に {n} 件のイベント · {kinds}',
  ' The event log was also cut short, so what is missing lies out there too.':
    ' イベントの記録も途中で切れているので、抜けているものはその先にも在る。',
  '{what} before this span, the most recent on {at} — widen the span to see them.':
    'この範囲より前に {what} が在り、いちばん新しいものは {at} — 範囲を広げると出る。',
  '{what} beyond this span, the earliest on {at} — widen the span to see them.':
    'この範囲より先に {what} が在り、いちばん古いものは {at} — 範囲を広げると出る。',
  'Open issues and closed issues, day by day': '開いている課題と完了した課題の、日ごとの推移',
  'open now {n} (peak {peak})': 'いま開いている {n}（最大 {peak}）',
  'closed cumulative {n}': '完了の累計 {n}',
  'last 30d': '直近 30 日',
  '{n} waiting on nothing': '何も待っていないもの {n} 件',
  Waiting: '待ち',
  '{n} free up as the ones above land': '上のものが片付けば {n} 件が動けるようになる',
  'Caught in a cycle': '循環に入っている',
  Closed: '完了',
  '{n} done': '{n} 件が完了',
  'No milestone': 'マイルストーン無し',
  '{open} of {total} open': '{total} 件中 {open} 件が開いている',
  'Sort by start order: open with all blocks cleared, most recently updated first (exclusive with column sort)':
    '着手の順に並べる。堰き止めが全て外れた開いている課題を、更新の新しい順に（列での並べ替えとは併用できない）',
  Start: '着手順',
  ID: 'ID',
  Title: '題名',
  Type: '種類',
  Labels: 'ラベル',
  'Milestone {title} — due {at}': 'マイルストーン {title} — 期日 {at}',
  'Reading the issue event log': '課題のイベントの記録を読んでいます',
  'No matching issues': '一致する課題が無い',
  'this order may be missing constraints': 'この並びには、抜けている制約が在るかもしれない',
  'Issue events could not be read': '課題のイベントを読めなかった',
  'no reason was given': '理由は示されなかった',
  'This project has no issue event log': 'このプロジェクトには課題のイベントの記録が無い',
  'nothing to read': '読むものが無い',
  'these are the events read before the last attempt':
    'これは、最後の試みより前に読めたイベントである',
  'the event log was cut short': 'イベントの記録が途中で切れている',
  'they were not in the event log': 'イベントの記録の中に無かった',
  'for some, it stopped before any of their events':
    '一部は、そのイベントに届く前に読み取りが止まった',
  'for some, no event time could be read': '一部は、イベントの時刻を読めなかった',
  'The issue events could not be refreshed': '課題のイベントを読み直せなかった',
  'Some issues were not read': '一部の課題を読んでいない',
  'This issue was not in the event log that was read':
    'この課題は、読めたイベントの記録の中に無かった',
  ' — the event log was also cut short here': ' — ここではイベントの記録も途中で切れている',
  'The time on {what} could not be read, so nothing is drawn here{also}':
    '{what} の時刻を読めなかったので、ここには何も描いていない{also}',
  'The event log was cut short before it reached any event on this issue':
    'イベントの記録は、この課題のイベントに届く前に切れている',
  ' — the time on {what} could not be read': ' — {what} の時刻を読めなかった',
  'No events on record since it was opened{missed}':
    '開かれてから記録に残っているイベントが無い{missed}',
  'No events on record for this issue{missed}':
    'この課題について記録に残っているイベントが無い{missed}',
  '{what} read, the last on {at}{missed}': '{what} を読んだ。いちばん新しいものは {at}{missed}',
  'Opened {at}': '{at} に開かれた',
  '{opened}, before this span starts — the ring sits at the edge, not at that time. Widen the span to place it.':
    '{opened}。この範囲が始まる前である — 丸は端に置いてあり、その時刻の位置ではない。範囲を広げると正しい位置に置ける。',
  '{opened}, after this span ends — the ring sits at the edge, not at that time.':
    '{opened}。この範囲が終わった後である — 丸は端に置いてあり、その時刻の位置ではない。',
  'Waiting on {blocker} — about {days}d, measured from a close time taken from updated_at, so where this wait starts is approximate':
    '{blocker} を待っている — およそ {days} 日。updated_at から取った完了の時刻で測っているので、この待ちの始まりはおおよそである',
  'Waiting on {blocker} — {days}d from {blocker} ending to this issue being created':
    '{blocker} を待っている — {blocker} が終わってからこの課題が作られるまで {days} 日',
  '{blocker} ended before this span': '{blocker} はこの範囲より前に終わっている',
  'this issue was created after this span': 'この課題はこの範囲より後に作られている',
  '{measured}. The line stops at the edge of this span: {stopped} — widen the span to see the whole wait.':
    '{measured}。線はこの範囲の端で止まっている: {stopped} — 範囲を広げると待ちの全体が出る。',
  ' and ': '、また',
  'First event {at} — earlier than the time this issue was opened':
    '最初のイベントは {at} — この課題が開かれた時刻より前である',
  'First event {at} — when this issue was opened could not be read':
    '最初のイベントは {at} — この課題がいつ開かれたかは読めなかった',
  'last event {at}': 'いちばん新しいイベントは {at}',
  'closed around {at}, taken from updated_at': '{at} 前後に完了。updated_at から取ったもの',
  'closed {at}': '{at} に完了',
  'it starts before this span': 'この範囲より前から始まっている',
  'it runs past this span': 'この範囲より先まで続いている',
  '{from} — {to}. The line stops at the edge of this span: {stopped} — widen the span to see all of it.':
    '{from} — {to}。線はこの範囲の端で止まっている: {stopped} — 範囲を広げると全体が出る。',
  '{n, plural, one {# milestone is} other {# milestones are}} due before this span: {listed} — widen the span to see them':
    '{n, plural, other {# 件のマイルストーン}}の期日がこの範囲より前に在る: {listed} — 範囲を広げると出る',
  '{n, plural, one {# milestone is} other {# milestones are}} due beyond this span: {listed} — widen the span to see them':
    '{n, plural, other {# 件のマイルストーン}}の期日がこの範囲より先に在る: {listed} — 範囲を広げると出る',
  '{n, plural, one {# milestone has} other {# milestones have}} no due date: {listed} — nothing can be placed on this axis for them':
    '{n, plural, other {# 件のマイルストーン}}に期日が無い: {listed} — この軸の上には置けない',
  'the local git could not be read, so how far ahead or behind it is, and whether it conflicts, are unknown':
    '手元の git を読めなかったので、どれだけ先行・遅れているかも、衝突するかどうかも分からない',
  'Open branch {name}': 'ブランチ {name} を開く',
  'worktree {name}': 'worktree {name}',
  'Child issue progress: {closed}/{total} closed': '子課題の進み: {total} 件中 {closed} 件が完了',
  'Pull request #{number} — {state}{review}{branch}':
    'プルリクエスト #{number} — {state}{review}{branch}',
  'on {branch}': '{branch} 上',
  'Finishing this frees {n}': 'これを終えると {n} 件が動けるようになる',
  'Some blocking issues are not shown — this issue has more dependencies than glasshive fetches':
    '堰き止めている課題の一部が出ていない — この課題には、glasshive が取得する数より多くの依存が在る',
  'deps cut': '依存が切れている',
  '{n} concurrent': '同時に {n}',
  'Only the 30 most recent events were read — anything before {to} is not shown':
    '直近 30 件のイベントしか読んでいない — {to} より前は出ていない',
  'Only the 30 most recent events were read — anything between {from} and {to} is not shown':
    '直近 30 件のイベントしか読んでいない — {from} から {to} の間は出ていない',
  'When this issue was opened could not be read, and no events are on record — nothing can be placed on this axis for it':
    'この課題がいつ開かれたかを読めず、記録に残っているイベントも無い — この軸の上には置けない',
  'Closed around {at}, taken from updated_at, so the close time is approximate':
    '{at} 前後に完了。updated_at から取ったものなので、完了の時刻はおおよそである',
  'Closed {at}': '{at} に完了',
  'parent-child': '親子',
  'blocks — the arrow points at what comes later': '堰き止め — 矢印は後に来るほうを指す',
  other: 'その他',
  'its branch is n ahead and n behind the base': 'ブランチが base より n 先行し、n 遅れている',
  'it has a branch, but the local git could not be read':
    'ブランチは在るが、手元の git を読めなかった',
  'n concurrent': '同時に n',
  'more than one agent is on it right now': 'いま 2 つ以上のエージェントが付いている',
  'from the first instant observed to the last — never to now':
    '観測した最初の時刻から最後の時刻まで — 現在までではない',
  created: '作成',
  'something happened': '何かが起きた',
  'more than one, too close to tell apart': '2 つ以上あり、近すぎて分けられない',
  'closed, the time taken from updated_at': '完了。時刻は updated_at から取ったもの',
  'read only back to here': 'ここまでしか遡って読んでいない',
  'not read': '読んでいない',
  'still reading': 'まだ読んでいる',
  'a milestone is due': 'マイルストーンの期日',
  'some dependencies were not fetched — arcs may be missing':
    '依存の一部を取得していない — 弧が抜けているかもしれない',
  'some issues were not read — those rows are hatched, not empty':
    '一部の課題を読んでいない — その行は空ではなく、斜線が引いてある',
  blocks: '堰き止め',
  '{kind}: {title}': '{kind}: {title}',
  'This issue and the issues connected to it': 'この課題と、繋がっている課題',
  'this issue': 'この課題',
  'Not read yet': 'まだ読んでいない',
  'Some of this project could not be read — the count may be short':
    'このプロジェクトの一部を読めなかった — 件数は足りていない可能性がある',
  '{n, plural, one {# run in view} other {# runs in view}}':
    '{n, plural, other {表示中の稼働 # 件}}',
  'Some activity could not be read — the gaps may not be quiet':
    '一部の稼働を読めなかった — 空いているところが静かだったとは限らない',
  Projects: 'プロジェクト',
  Watched: '観ている',
  Project: 'プロジェクト',
  Active: '稼働中',
  Input: '入力待ち',
  'Tokens 24h': 'トークン 24h',
  Activity: '稼働',
  'Last activity': '最終稼働',
  'Stop watching {name}': '{name} を観るのをやめる',
  'Watch {name}': '{name} を観る',
  'Could not be read': '読めなかった',
  '{tokens} — {percent}% of the {total} shown': '{tokens} — 出ている {total} のうち {percent}%',
  all: 'すべて',
  'any time': '全期間',
  'Some projects could not be read — the counts may be short':
    '一部のプロジェクトを読めなかった — 件数は足りていない可能性がある',
  'Some transcripts could not be read': '一部のトランスクリプトを読めなかった',
  'Search projects…': 'プロジェクトを検索…',
  'Search projects': 'プロジェクトを検索',
  'Show projects no matter when they last ran':
    '最後に動いた時刻に関わらず、すべてのプロジェクトを出す',
  'Show only projects active within the last {span}': '直近 {span} に動いたプロジェクトだけを出す',
  'Reading the transcripts of each project': 'プロジェクトごとにトランスクリプトを読んでいます',
  '{read} of {total} projects read': '{total} 件中 {read} 件のプロジェクトを読んだ',
  'tokens 24h': 'トークン 24h',
  type: '種類',
  assignees: '担当',
  author: '作成者',
  milestone: 'マイルストーン',
  'Show just {title}': '{title} だけを出す',
  'due {at}': '期日 {at}',
  'sub-issues': '子課題',
  '{closed}/{total} closed': '{total} 件中 {closed} 件が完了',
  'pull requests': 'プルリクエスト',
  agents: 'エージェント',
  reactions: 'リアクション',
  updated: '更新',
  'Still fetching issues — anything waiting on this one may not be listed yet':
    'まだ課題を取得している — この課題を待っているものは、まだ出ていないかもしれない',
  '+{n} more upstream': '上流にあと {n} 件',
  '+{n} more downstream': '下流にあと {n} 件',
  'Agent activity': 'エージェントの稼働',
  'Reading the description': '説明を読んでいます',
  'The description did not come back': '説明が返ってこなかった',
  'The rest of this panel is built from the issue list, which glasshive already has. The body text is fetched on its own when you open an issue, and that fetch did not answer.':
    'このパネルの他の部分は、glasshive が既に持っている課題の一覧から組んでいる。本文は課題を開いたときに別途取得するもので、その取得が答えなかった。',
  'Read the whole issue on GitHub': 'GitHub で課題の全文を読む',
  'Reading the issue': '課題を読んでいます',
  unknown: '不明',
  'closed this': 'がこれを完了にした',
  'as {reason}': '（{reason}）',
  'reopened this': 'がこれを開き直した',
  added: 'がラベルを追加:',
  removed: 'がラベルを削除:',
  assigned: 'が担当に指名:',
  unassigned: 'が担当から外した:',
  'added this to': 'がこれを追加した先:',
  'removed this from': 'がこれを外した元:',
  renamed: 'が改題:',
  to: '→',
  'marked this blocked by': 'がこれの堰き止めに指定:',
  'marked this a duplicate of': 'がこれを重複とした先:',
  'referenced this in': 'がこれに言及:',
  'will close this': 'マージするとこれを閉じる',
  'The text of this comment did not come back': 'このコメントの本文が返ってこなかった',
  Discussion: 'やりとり',
  'Reading the discussion': 'やりとりを読んでいます',
  'Read the discussion on GitHub': 'GitHub でやりとりを読む',
  'GitHub has no discussion under this number': 'GitHub には、この番号のやりとりが無い',
  'gh answered, and the answer carried no issue with this number. A deleted issue, or a number that belongs to another repository, looks like this. It does not say that nothing was written.':
    'gh は答えたが、その答えにこの番号の課題は無かった。削除された課題や、別のリポジトリの番号はこう見える。何も書かれていないという意味ではない。',
  'The discussion did not come back': 'やりとりが返ってこなかった',
  'Comments and events are fetched on their own when you open an issue, and that fetch did not answer. The rest of this panel is built from the issue list, which glasshive already has.':
    'コメントとイベントは課題を開いたときに別途取得するもので、その取得が答えなかった。このパネルの他の部分は、glasshive が既に持っている課題の一覧から組んでいる。',
  'Nothing has been said on this issue yet.': 'この課題には、まだ何も書かれていない。',
  'Reading more of the discussion': 'やりとりの続きを読んでいます',
  'Only the first part of this discussion was read. Anything said after the last entry above is not on this screen.':
    'このやりとりは最初の一部しか読めていない。上のいちばん下の項目より後に書かれたものは、この画面には出ていない。',
  'this ref': 'この ref',
  'Reading commits': 'コミットを読んでいます',
  '{n} commits ahead of {base}': '{base} より {n} コミット先行',
  'recent history': '直近の履歴',
  'in {files} files since {base}': '{base} 以降、{files} 個のファイルで',
  '· behind {base} by {n}': '· {base} より {n} 遅れ',
  'Top changes': '変更の多いもの',
  Commits: 'コミット',
  'Language of this interface': 'この画面の言葉',
  'Language of this interface. Observed text is never translated':
    'この画面の言葉。観測したテキストは訳さない',
  'Follow browser': 'ブラウザーに合わせる',
  'By model': 'モデル別',
  'no usage in range': 'この範囲に消費が無い',
  'At least this many — some agents could not be counted':
    '少なくともこの数 — 数えられなかったエージェントが居る',
  'Peak agents concurrent in range': 'この範囲で同時に動いたエージェントの最大数',
  'Agents concurrent over time': '同時に動いていたエージェントの数の推移',
  'the dashed band on top is agents whose activity could not be read':
    '上に積んだ破線の面は、稼働を読めなかったエージェントである',
  'some agents could not be counted, so the counts are a lower bound':
    '数えられなかったエージェントが居るので、この数は下限である',
  Agents: 'エージェント',
  now: '現在',
  peak: '最大',
  'Agents whose activity could not be read': '稼働を読めなかったエージェント',
  '{n} unknown': '不明 {n}',
  'agents concurrent': 'が同時に動いていた',
  '{n} could not be read': '{n} 件は読めなかった',
  'Could not be read — {reason}': '読めなかった — {reason}',
  'reading…': '読んでいます…',
  'could not be read': '読めなかった',
  'input + output + cache write': '入力 + 出力 + キャッシュ書き込み',
  'Tokens over time': 'トークンの消費の推移',
  'in {input} · out {output} · cacheW {cacheWrite} · cacheR {cacheRead}':
    '入力 {input} · 出力 {output} · キャッシュ書き {cacheWrite} · キャッシュ読み {cacheRead}',
  'Approximated from transcripts (this project only) — may not match billing':
    'トランスクリプトからの概算（このプロジェクトのみ） — 課金の数字とは一致しないことがある',
  'Windows (observed)': '枠（観測）',
  '{at} (in {left})': '{at}（あと {left}）',
  'idle — next prompt opens a window': '動いていない — 次の入力で枠が始まる',
  '{tokens}/day avg': '1 日あたり平均 {tokens}',
  Overview: '概観',
  'Watched projects': '観ているプロジェクト',
  '{name}{slot} — drag to reorder': '{name}{slot} — ドラッグで並べ替える',
  '{name} — double-click to watch': '{name} — ダブルクリックで観る',
  '{label} (YYYY-MM-DD HH:MM)': '{label}（YYYY-MM-DD HH:MM）',
  '{from} → {to} · earlier activity (density unknown — beyond bounded scan)':
    '{from} → {to} · それより前の稼働（濃さは不明 — 走査の範囲の外）',
  '{from} → {to} · {took}{live}': '{from} → {to} · {took}{live}',
  live: '稼働中',
  'No milestones on the issues fetched from GitHub':
    'GitHub から取得した課題に、マイルストーンが 1 つも付いていない',
  'No matching milestones (0 of {total})': '一致するマイルストーンが無い（{total} 件中 0 件）',
  Milestone: 'マイルストーン',
  Due: '期日',
  Progress: '進み',
  Open: '開いている',
  Blocked: '堰き止められている',
  Branches: 'ブランチ',
  'Show issues in {title}': '{title} の課題を出す',
  'no milestone': 'マイルストーン無し',
  '{n, plural, one {# issue in this milestone was not in the event log that was read, so nothing from it is on this line} other {# issues in this milestone were not in the event log that was read, so nothing from them is on this line}}':
    '{n, plural, other {このマイルストーンの課題 # 件が、読めたイベントの記録の中に無かった。だからその分はこの線に出ていない}}',
  'Only the 30 most recent events were read for at least one issue here — anything before {to} is not shown':
    'ここの課題のうち少なくとも 1 件は、直近 30 件のイベントしか読んでいない — {to} より前は出ていない',
  'The first issue here was opened {at}{clamped}': 'ここでいちばん早く開かれた課題は {at}{clamped}',
  ', outside this span — the ring sits at the edge': '。この範囲の外である — 丸は端に置いてある',
  'Due {at}': '期日 {at}',
  '{n, plural, one { — # issue of {total} was not in the event log, so nothing from it is drawn here} other { — # issues of {total} were not in the event log, so nothing from them is drawn here}}':
    '{n, plural, other { — {total} 件のうち # 件がイベントの記録の中に無かった。だからその分はここに描いていない}}',
  'None of the issues here were in the event log that was read':
    'ここの課題は、1 件も読めたイベントの記録の中に無かった',
  'The time on {what} could not be read, so nothing is drawn here':
    '{what} の時刻を読めなかったので、ここには何も描いていない',
  'The event log was cut short before it reached any issue here':
    'イベントの記録は、ここのどの課題にも届く前に切れている',
  'No events on record for the {what} here{missing}':
    'ここの {what} について記録に残っているイベントが無い{missing}',
  '{what} across {across}, the last on {at}{missing}':
    '{across} にわたって {what}。いちばん新しいものは {at}{missing}',
  'First issue opened {from} — last event {to}':
    '最初の課題が開かれたのは {from} — いちばん新しいイベントは {to}',
  '{spans}. The line stops at the edge of this span: {stopped} — widen the span to see all of it.':
    '{spans}。線はこの範囲の端で止まっている: {stopped} — 範囲を広げると全体が出る。',
  branches: 'ブランチ',
  milestones: 'マイルストーン',
  'Still counting the {unit}': '{unit} をまだ数えている',
  'The {unit} could not be read — this is not zero': '{unit} を読めなかった — これは 0 ではない',
  Issues: '課題',
  Milestones: 'マイルストーン',
  'List — rows, with dependency arcs in the gutter': '一覧 — 行で並べ、依存の弧を余白に引く',
  List: '一覧',
  'Graph — laid out left to right in start order': '図 — 着手の順に左から右へ並べる',
  Graph: '図',
  'Search issues…': '課題を検索…',
  Group: '束ね方',
  'Leave the issues nested under their parents': '課題を親の下に入れ子のままにする',
  None: '束ねない',
  'Gather the issues under the milestone each one is in':
    '課題を、それぞれが属するマイルストーンの下に集める',
  Span: '範囲',
  All: '全部',
  'Every issue with a known creation time, in one view':
    '作成の時刻が分かっている課題を、1 つの画面に全部',
  'The last 7 days': '直近 7 日',
  'The last 30 days': '直近 30 日',
  'The last 90 days': '直近 90 日',
  open: '開いている',
  blocked: '堰き止められている',
  'not planned': 'やらない',
  merged: 'マージ済み',
  approved: '承認',
  'changes requested': '修正の求め',
  'review required': 'レビュー待ち',
  'blocked by': '堰き止めている',
  related: '関連',
  duplicates: '重複',
  supersedes: '置き換え',
  'discovered from': '派生元',
  Auto: '自動',
  'The narrowest of these that still shows everything': '全部が収まる中でいちばん狭い幅',
  'The last 30 minutes': '直近 30 分',
  'The last hour': '直近 1 時間',
  "Claude Code's 5h quota window in one view": 'Claude Code の 5 時間の枠を 1 つの画面に',
  'The last day': '直近 1 日',
  "Claude Code's weekly quota window in one view": 'Claude Code の 1 週間の枠を 1 つの画面に',
  'GitHub CLI is not installed': 'GitHub CLI が入っていない',
  'glasshive reads GitHub through the gh command, so it never holds a token of its own. There is a repository behind this project — it just has no way to ask about it.':
    'glasshive は gh コマンド越しに GitHub を読むので、自分でトークンを持つことはない。このプロジェクトの後ろにリポジトリは在るが、尋ねる手立てが無いだけである。',
  'Install the GitHub CLI': 'GitHub CLI を入れる',
  'Sign in once': '一度サインインする',
  'GitHub refused the request': 'GitHub が要求を断った',
  'gh is installed and answered, but GitHub would not serve this repository. That is usually an expired login, or a token without access to a private repository.':
    'gh は入っていて答えたが、GitHub はこのリポジトリを渡さなかった。多くはサインインの期限切れか、非公開リポジトリへの権限が無いトークンである。',
  'See who gh thinks you are': 'gh が誰だと思っているかを見る',
  'Sign in again if the token expired': 'トークンが切れていればサインインし直す',
  'GitHub answered with something that is not an issue list':
    'GitHub の答えが課題の一覧ではなかった',
  'gh ran and came back, but the answer holds no issues to read — an expired login and a GraphQL error both look like this. Nothing is known about the issues in this repository right now; this is not an empty backlog.':
    'gh は動いて返ってきたが、その答えに読める課題は入っていない。サインインの期限切れも GraphQL の誤りもこう見える。いまこのリポジトリの課題については何も分かっていない。課題が無いという意味ではない。',
  'Ask for the issues by hand to see what comes back': '自分で課題を尋ねて、何が返るかを見る',
  'GitHub did not answer in time': 'GitHub が時間内に答えなかった',
  'The request was sent and never came back. Nothing is known about the issues in this repository right now — this is not an empty backlog.':
    '要求は送られ、そのまま返ってこなかった。いまこのリポジトリの課題については何も分かっていない — 課題が無いという意味ではない。',
  'Run the same query by hand to see where it stalls':
    '同じ問い合わせを自分で走らせて、どこで止まるかを見る',
  'Check whether GitHub itself is degraded': 'GitHub 自体が不調でないかを確かめる',
  'gh exited with an error': 'gh が異常終了した',
  'gh started and stopped with a non-zero status. It knows why; glasshive only sees the exit code. Running the same command by hand prints the reason.':
    'gh は動き出し、0 でない終了コードで止まった。理由は gh が知っていて、glasshive には終了コードしか見えない。同じコマンドを自分で走らせれば理由が出る。',
  'Run it yourself in this project': 'このプロジェクトで自分で走らせる',
  'Could not reach GitHub': 'GitHub に届かなかった',
  'The request to gh did not produce an answer glasshive could read. The code below is what came back — nothing is known about the issues in this repository right now.':
    'gh への要求から、glasshive が読める答えは得られなかった。下のエラーコードが返ってきたものである。いまこのリポジトリの課題については何も分かっていない。',
  'git is not installed': 'git が入っていない',
  'glasshive shells out to git for branches, worktrees and conflicts. Without it, every project looks like it has no repository — which is not what is being said here.':
    'glasshive はブランチ・worktree・衝突を git に尋ねる。git が無いと、どのプロジェクトもリポジトリを持たないように見える — ここで言っているのはそれではない。',
  'Install git': 'git を入れる',
  'git refused to read this repository': 'git がこのリポジトリを読むのを断った',
  'The directory exists and git ran, but it would not answer. On a shared or mounted checkout this is usually ownership: git declines repositories owned by another user. The repository is there — this is not an empty or missing one.':
    'ディレクトリは在り、git も動いたが、答えなかった。共有やマウント越しの作業ツリーでは、たいてい所有者の問題である。git は他の利用者が持つリポジトリを断る。リポジトリはそこに在る — 空でも、無いのでもない。',
  'Ask git what it objects to': 'git に何が不満かを尋ねる',
  'If it is ownership, trust this checkout': '所有者の問題なら、この作業ツリーを信頼させる',
  'git did not finish in time': 'git が時間内に終わらなかった',
  'The command was started and never returned. A very large history or a stalled network remote can do this.':
    'コマンドは始まり、そのまま返ってこなかった。非常に大きな履歴や、応答しないリモートでこうなることがある。',
  'git exited with an error': 'git が異常終了した',
  'git ran and stopped with a non-zero status, and what it printed is not a refusal or a missing repository. It knows why; glasshive only sees that it failed. Running the same command by hand prints the reason.':
    'git は動き、0 でない終了コードで止まった。出力は拒否でもリポジトリ不在でもない。理由は git が知っていて、glasshive には失敗したことしか見えない。同じコマンドを自分で走らせれば理由が出る。',
  'Could not read the repository': 'リポジトリを読めなかった',
  'git did not produce an answer glasshive could read. The code below is what came back.':
    'git から、glasshive が読める答えは得られなかった。下のエラーコードが返ってきたものである。',
  'Could not ask glasshive for {what}': 'glasshive に {what} を尋ねられなかった',
  'The request to the local glasshive server did not come back. The page is still open but the server behind it is not answering — this says nothing about your repository.':
    '手元の glasshive サーバーへの要求が返ってこなかった。画面は開いたままだが、後ろのサーバーが答えていない — あなたのリポジトリについては何も言っていない。',
  'Check the terminal glasshive is running in': 'glasshive を動かしている端末を見る',
  'Reload once the server is back': 'サーバーが戻ったら読み込み直す',
  'No project by that name': 'その名前のプロジェクトが無い',
  'glasshive lists whatever it finds under ~/.claude/projects, and nothing there answers to this name. A renamed or removed directory leaves a link like this behind — the link is stale, the tool is fine.':
    'glasshive は ~/.claude/projects の下に見つかったものを並べるだけで、そこにこの名前のものは無い。名前を変えたり消したりしたディレクトリは、このようなリンクを残す — リンクが古いだけで、glasshive のほうは壊れていない。',
  'Open the overview and pick a project that is actually there':
    '概観を開いて、実際に在るプロジェクトを選ぶ',
  'See what glasshive can see': 'glasshive に見えているものを見る',
  'Could not read the transcripts directory': 'トランスクリプトのディレクトリを読めなかった',
  'glasshive reads every session from ~/.claude/projects. That read did not come back, so the list below is not empty — it is unknown.':
    'glasshive は全てのセッションを ~/.claude/projects から読む。その読み取りが返ってこなかったので、下の一覧は空なのではなく、分からないのである。',
  'Check that the directory is readable': 'そのディレクトリが読めるかを確かめる',
  'Nothing at that ref': 'その ref には何も無い',
  'git ran and answered, and there are no commits under this name. A deleted branch, a squashed worktree, or a tag that never landed all look like this.':
    'git は動いて答え、この名前の下にコミットは無かった。消したブランチ、潰した worktree、結局作られなかったタグは、どれもこう見える。',
  'Ask git yourself': '自分で git に尋ねる',
  'Could not read this issue': 'この課題を読めなかった',
  'The request came back with an error instead of the issue. The code below is what came back.':
    '課題ではなくエラーが返ってきた。下のエラーコードが返ってきたものである。',
  'This issue is not in view': 'この課題は表示の中に無い',
  'The issues fetched from GitHub for this project do not include {id}. It may have been created after this page loaded, or it may live in another project.':
    'このプロジェクトについて GitHub から取得した課題に {id} は入っていない。この画面を読み込んだ後に作られたか、別のプロジェクトに在るのかもしれない。',
  'Reload to fetch the issues again': '読み込み直して課題を取得し直す',
  'Check that the project on the tab is the one that owns this id':
    'タブのプロジェクトが、この id を持つほうかを確かめる',
  'Could not read more of this conversation': 'この会話の続きを読めなかった',
  'The transcript is read in windows as you scroll, and this window did not come back. What is already on screen is still what was written — only the part beyond it is unknown.':
    'トランスクリプトはスクロールに合わせて範囲ごとに読む。その範囲が返ってこなかった。画面に出ているものは書かれたとおりのままで、分からないのはその先だけである。',
  'Scroll again to retry': 'もう一度スクロールして読み直す',
  'This view stopped': 'この画面が止まった',
  'Something in glasshive itself threw while drawing this view. Nothing was written anywhere — glasshive only reads — so reloading is safe.':
    'この画面を描いている途中で、glasshive 自身が例外を投げた。どこにも書き込みはしていない — glasshive は読むだけである — ので、読み込み直しても危険は無い。',
  'Reload the page': '画面を読み込み直す',
  'Check the terminal glasshive is running in for the full trace':
    'glasshive を動かしている端末で、詳しい記録を見る',
  'No such page': 'そのような画面は無い',
  'glasshive has an overview of the projects you watch, and per-project Agents and Work views. This address is none of them.':
    'glasshive に在るのは、観ているプロジェクトの一覧と、プロジェクトごとの Agents と Work の画面である。このアドレスはそのどれでもない。',
  'Pick a project from the Overview tab above': '上の Overview タブからプロジェクトを選ぶ',
  'on the branch of PR #{number}': 'PR #{number} のブランチ上',
  '{n}s ago': '{n} 秒前',
  '{n}m ago': '{n} 分前',
  '{n}h ago': '{n} 時間前',
  '{n}d ago': '{n} 日前',
  today: '今日',
  'in {n}d': 'あと {n} 日',
  '{n}d overdue': '{n} 日超過',
  '{s}s': '{s} 秒',
  '{m}m{s}s': '{m} 分 {s} 秒',
  '{h}h{m}m': '{h} 時間 {m} 分',
  '{m}m': '{m} 分',
  '{done} of {total} {unit}': '{total} {unit} 中 {done}',
  '{project}: awaiting your input': '{project}: 入力を待っている',
  'You are not watching this project': 'このプロジェクトを観ていない',
  'glasshive found it under ~/.claude/projects but is not reading it. Watching it adds it to the tab bar and reads it from now on — nothing about the project changes.':
    '~/.claude/projects の中に見つけてはいるが、読んでいない。観ると決めると、タブに足されて、そこから読むようになる — プロジェクトの側は何も変わらない。',
  'Or pick it from the overview, with everything else it found':
    '見つけたものと一緒に、Overview から選び直すこともできる',
};
