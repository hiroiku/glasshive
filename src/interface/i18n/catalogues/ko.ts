import type { Catalogue } from '../message.ts';

/** 韓国語。鍵は英語の原文そのもの */
export const ko: Catalogue = {
  'Starting glasshive': 'glasshive를 시작하는 중',
  'The first read of ~/.claude/projects takes a moment.':
    '~/.claude/projects를 처음 읽을 때는 시간이 조금 걸립니다.',
  'Realtime connection: disconnected': '실시간 연결: 끊김',
  'Realtime connection: connected': '실시간 연결: 연결됨',
  'Realtime connection: connected, but the watcher is down — updates will not arrive':
    '실시간 연결: 연결되었지만 워처가 중단됨 — 갱신이 도착하지 않습니다',
  'Some projects could not be read — the count may be short':
    '일부 프로젝트를 읽지 못했습니다 — 개수가 실제보다 적을 수 있습니다',
  'Counted from the projects read so far': '지금까지 읽은 프로젝트를 기준으로 센 값',
  'also in this repository': '같은 저장소',
  active: '실행 중',
  waiting: '대기 중',
  input: '입력 대기',
  ended: '종료됨',
  'Notify when a session starts awaiting input': '세션이 입력 대기 상태가 되면 알림',
  'Notifications on: alerts you when a session starts awaiting input (only while the window is unfocused)':
    '알림 켜짐: 세션이 입력 대기 상태가 되면 알려 줍니다 (창이 활성 상태가 아닐 때만)',
  'Notifications off — click to enable': '알림 꺼짐 — 클릭하여 켜기',
  'Reading transcripts': '트랜스크립트를 읽는 중',
  'A large ~/.claude/projects takes a moment on the first read':
    '~/.claude/projects가 크면 처음 읽을 때 시간이 조금 걸립니다',
  'Could not read the transcript roots — projects are not missing, we could not look':
    '트랜스크립트 루트를 읽지 못했습니다 — 프로젝트가 없는 것이 아니라, 확인할 수 없었습니다',
  '{n, plural, one {# project could not be read — its row shows what we could see, not what is there} other {# projects could not be read — their rows show what we could see, not what is there}}':
    '{n, plural, other {프로젝트 #개를 읽지 못했습니다 — 해당 행은 확인할 수 있었던 것을 보여 줄 뿐, 실제로 있는 것을 보여 주지 않습니다}}',
  'Could not count live processes — waiting and ended cannot be told apart':
    '살아 있는 프로세스를 세지 못했습니다 — 대기 중과 종료됨을 구분할 수 없습니다',
  'Could not read the pinned tabs — the order fell back to the default':
    '고정한 탭을 읽지 못했습니다 — 순서는 기본값으로 되돌렸습니다',
  'No projects yet — run Claude Code and they show up here':
    '아직 프로젝트가 없습니다 — Claude Code를 실행하면 여기에 나타납니다',
  'Nothing to read yet — ~/.claude/projects is not there':
    '아직 읽을 것이 없습니다 — ~/.claude/projects가 없습니다',
  'Unknown — the projects could not be counted': '알 수 없음 — 프로젝트를 세지 못했습니다',
  'No matching projects (0 of {total})': '일치하는 프로젝트가 없습니다 (전체 {total}개 중 0개)',
  'No matches yet among the projects read so far (0 of {total})':
    '지금까지 읽은 프로젝트 중에는 아직 일치하는 것이 없습니다 (전체 {total}개 중 0개)',
  'waiting for you': '당신을 기다리는 중',
  'an agent is working': '에이전트가 작업 중',
  'idle, but the process is alive': '유휴 상태이지만 프로세스는 살아 있음',
  'nothing running': '실행 중인 것이 없음',
  'not read yet, or could not be read': '아직 읽지 않았거나, 읽지 못했습니다',
  'share of the tokens spent in the last 24h by the projects shown':
    '표시된 프로젝트가 최근 24시간 동안 사용한 토큰 중의 비율',
  'when anything in the project was running, over the {span} window':
    '{span} 구간에서 프로젝트 안의 무언가가 실행되고 있던 시간',
  'some of that activity could not be read': '그 활동 중 일부는 읽지 못했습니다',
  'Drag to resize': '드래그하여 크기 조절',
  'Switch to overlay panel (floats over the main area)': '겹치는 패널로 전환 (본문 위에 떠 있음)',
  'Switch to side-by-side panel (shrinks the main area)': '나란히 놓는 패널로 전환 (본문이 좁아짐)',
  'Opening the panel': '패널을 여는 중',
  'Toggle panel': '패널 열고 닫기',
  'The agent columns are blank because the transcripts could not be read — not because nobody is working on these.':
    '에이전트 열이 비어 있는 것은 트랜스크립트를 읽지 못했기 때문이며, 아무도 작업하고 있지 않다는 뜻이 아닙니다.',
  issues: '이슈',
  'Fetching issues from GitHub': 'GitHub에서 이슈를 가져오는 중',
  'gh is paging through this repository — a large one takes a few seconds':
    'gh가 이 저장소를 페이지 단위로 읽고 있습니다 — 크면 몇 초 걸립니다',
  'Fetching the rest of the issues from GitHub': '나머지 이슈를 GitHub에서 가져오는 중',
  'this view needs every issue — the dependencies and milestones are read from the whole list':
    '이 화면에는 모든 이슈가 필요합니다 — 의존성과 마일스톤은 목록 전체에서 읽습니다',
  'Search milestones…': '마일스톤 검색…',
  'Clear the milestone filter: {name}': '마일스톤 필터 해제: {name}',
  'Clear the milestone filter': '마일스톤 필터 해제',
  closed: '닫힘',
  'Reading issues from': '이슈를 읽는 곳:',
  '. This project’s remotes point at {n} GitHub repositories — run `gh repo set-default` to change which one glasshive reads.':
    '. 이 프로젝트의 리모트는 GitHub 저장소 {n}개를 가리킵니다 — 어느 것을 읽을지는 `gh repo set-default`로 바꿉니다.',
  'Showing the most recently updated issues only — this repository has more than glasshive fetches in one go.':
    '가장 최근에 갱신된 이슈만 표시합니다 — 이 저장소에는 glasshive가 한 번에 가져오는 수보다 많은 이슈가 있습니다.',
  'Fetching the rest of the issues — the cumulative flow counts all of them':
    '나머지 이슈를 가져오는 중 — 누적 흐름은 전부를 셉니다',
  'the repository': '이 저장소',
  'Reading branches and worktrees': '브랜치와 워크트리를 읽는 중',
  'No GitHub repository behind this project': '이 프로젝트 뒤에 GitHub 저장소가 없습니다',
  'glasshive asks the remotes where this project lives, and none of them point at GitHub. Branches and worktrees are still readable — switch to Branches above.':
    'glasshive는 이 프로젝트의 리모트에 위치를 묻지만, 그중 어느 것도 GitHub를 가리키지 않습니다. 브랜치와 워크트리는 여전히 읽을 수 있으니 위의 Branches로 전환하세요.',
  'Point a remote at a GitHub repository': '리모트를 GitHub 저장소로 향하게 하기',
  'Then this side fills in: the dependency graph, start order, and which agent is on which issue':
    '그러면 이쪽이 채워집니다: 의존성 그래프, 착수 순서, 그리고 어떤 에이전트가 어떤 이슈를 맡고 있는지',
  'Not a git repository': 'git 저장소가 아닙니다',
  'This project directory has no repository, so there are no branches, worktrees or conflicts to draw.':
    '이 프로젝트 디렉터리에는 저장소가 없으므로 그릴 브랜치도, 워크트리도, 충돌도 없습니다.',
  'Start one': '만들기',
  '{from} → {to} · activity could not be read': '{from} → {to} · 활동을 읽지 못했습니다',
  'input + output + cache write (transcripts active in the last 7 days only)':
    '입력 + 출력 + 캐시 쓰기 (최근 7일 안에 활동한 트랜스크립트만)',
  'Subagents could not be counted — this session may have more':
    '서브에이전트를 세지 못했습니다 — 이 세션에는 더 있을 수 있습니다',
  Timeline: '타임라인',
  'No matching sessions (0 of {total}{short})':
    '일치하는 세션이 없습니다 (전체 {total}개 중 0개{short})',
  'Unknown — the sessions in this project could not be counted':
    '알 수 없음 — 이 프로젝트의 세션을 세지 못했습니다',
  'Reading the transcripts in this project': '이 프로젝트의 트랜스크립트를 읽는 중',
  'Nothing to read — the directory for this project is not there':
    '읽을 것이 없습니다 — 이 프로젝트의 디렉터리가 없습니다',
  'No sessions to show': '표시할 세션이 없습니다',
  'Session / Subagent': '세션 / 서브에이전트',
  Status: '상태',
  Model: '모델',
  Effort: '추론 강도',
  Tokens: '토큰',
  'Working on': '작업 대상',
  Worktree: '워크트리',
  Now: '현재',
  Updated: '갱신',
  'a session that did not give a name': '이름을 밝히지 않은 세션',
  'to {who}': '{who}에게',
  'from {who}': '{who}(으)로부터',
  'the other end was not found in this project': '이 프로젝트 안에서 반대쪽 끝을 찾지 못했습니다',
  '{n} messages': '메시지 {n}건',
  'Press Enter to open the conversation': 'Enter를 눌러 대화 열기',
  'Sessions and subagents': '세션과 서브에이전트',
  'awaiting user input': '사용자 입력을 기다리는 중',
  'waiting on subagents': '서브에이전트를 기다리는 중',
  'Messages sent: {list}': '보낸 메시지: {list}',
  'Could not be read.': '읽지 못했습니다.',
  '{tokens} — {percent}% of the {total} shown.': '{tokens} — 표시된 {total} 중 {percent}%.',
  "Reading the open session's transcripts for messages agents sent each other":
    '열려 있는 세션의 트랜스크립트에서 에이전트끼리 주고받은 메시지를 읽는 중',
  "Draw arrows for messages agents sent each other (reads the open session's transcripts)":
    '에이전트끼리 주고받은 메시지를 화살표로 그리기 (열려 있는 세션의 트랜스크립트를 읽습니다)',
  'Messages could not be read — this is not the same as no messages':
    '메시지를 읽지 못했습니다 — 메시지가 없다는 것과는 다릅니다',
  '{messages} messages in {marks} arrows': '화살표 {marks}개에 메시지 {messages}건',
  '{n} whose other end was not found in this project — only this end is drawn':
    '{n}건은 이 프로젝트 안에서 반대쪽 끝을 찾지 못했습니다 — 이쪽 끝만 그렸습니다',
  'not every session was opened to look for the other end':
    '반대쪽 끝을 찾기 위해 모든 세션을 연 것은 아닙니다',
  'none of these agents messaged each other in this window':
    '이 구간에서는 이 에이전트들끼리 주고받은 메시지가 없습니다',
  '{n} outside the window or over the limit': '{n}건은 구간 밖이거나 상한을 넘었습니다',
  '{n} sent to a name that is not in this session, with nothing recording where they arrived':
    '{n}건은 이 세션에 없는 이름으로 보내졌고, 어디에 도착했는지 기록이 없습니다',
  'messages older than the scan window are not counted':
    '스캔 구간보다 오래된 메시지는 세지 않습니다',
  'Search agents and transcripts…': '에이전트와 트랜스크립트 검색…',
  'Some transcripts could not be read. The rows stay narrowed to the matches found so far, so rows may be missing':
    '일부 트랜스크립트를 읽지 못했습니다. 행은 지금까지 찾은 일치 항목으로만 좁혀져 있으므로 빠진 행이 있을 수 있습니다',
  'Reading inside transcripts (last 1 MiB · last 7 days). Matches are added as they are read':
    '트랜스크립트 내부를 읽는 중 (마지막 1 MiB · 최근 7일). 일치 항목은 읽는 대로 추가됩니다',
  transcripts: '트랜스크립트',
  'transcripts could not be read': '트랜스크립트를 읽지 못했습니다',
  'reading transcripts…': '트랜스크립트를 읽는 중…',
  '{scanned} of {total} transcripts read': '트랜스크립트 {total}건 중 {scanned}건을 읽었습니다',
  messages: '메시지',
  'Show only what needs attention: awaiting your input, or waiting 30 minutes with no activity':
    '손이 필요한 것만 표시: 입력 대기 중이거나 30분 동안 활동이 없는 것',
  attention: '확인 필요',
  'Also show sessions that ended more than a day ago, and every subagent that ended':
    '하루보다 전에 끝난 세션과 종료된 서브에이전트도 표시',
  'Window start': '구간 시작',
  'Window end': '구간 끝',
  'Open conversation for {label}': '{label}의 대화 열기',
  '{id} (closed)': '{id} (닫힘)',
  'Open issue {id}': '이슈 {id} 열기',
  'View commit {label}': '커밋 {label} 보기',
  'View {name} in Git': '{name}을(를) Git에서 보기',
  subagents: '서브에이전트',
  'working on': '작업 중',
  parent: '상위',
  '{range} read from this transcript': '이 트랜스크립트에서 {range}을(를) 읽었습니다',
  'Select a session or subagent to view its conversation':
    '세션이나 서브에이전트를 선택하면 그 대화가 표시됩니다',
  'Reading the conversation': '대화를 읽는 중',
  'glasshive reads the end of the transcript first. A long one takes a moment.':
    'glasshive는 트랜스크립트의 끝부터 읽습니다. 길면 시간이 조금 걸립니다.',
  'Reading older messages': '이전 메시지를 읽는 중',
  'Load older': '이전 것 불러오기',
  thinking: '사고',
  result: '결과',
  '— {n, plural, one {# shared file} other {# shared files}} (merge conflict likely)':
    '— {n, plural, other {공통 파일 #개}} (병합 충돌 가능성 높음)',
  'Press Enter to open the ref or commit': 'Enter를 눌러 ref 또는 커밋 열기',
  'Refs and commits': 'ref와 커밋',
  'Ref / Commit': 'ref / 커밋',
  'Assignee / Agents': '담당자 / 에이전트',
  Ahead: '앞선 커밋',
  SHA: 'SHA',
  'named {id} in its conversation': '대화 안에서는 {id}(이)라고 밝힙니다',
  'Pull request #{number} — {state}{review}': '풀 리퀘스트 #{number} — {state}{review}',
  draft: '초안',
  'Milestone: {title} — show just this milestone': '마일스톤: {title} — 이 마일스톤만 표시',
  'The branch point is not among the commits shown, so this line runs to the bottom of the graph — it did not fork there':
    '분기점이 표시된 커밋 안에 없어서 이 선은 그래프 맨 아래까지 이어집니다 — 거기에서 갈라진 것이 아닙니다',
  'fork not shown': '분기점 미표시',
  '{n, plural, one {# commit behind {base}} other {# commits behind {base}}}':
    '{n, plural, other {{base}보다 #커밋 뒤처짐}}',
  '{n} commits': '커밋 {n}개',
  'glasshive reads only the most recent stretch of {base} — commits older than these are not read, and a branch that left earlier has no branch point to draw':
    'glasshive는 {base}의 최근 구간만 읽습니다 — 그보다 오래된 커밋은 읽지 않으므로, 더 이전에 갈라진 브랜치에는 그릴 분기점이 없습니다',
  'older commits are not read': '더 오래된 커밋은 읽지 않았습니다',
  '{id} {title} — closed by the pull request on this branch':
    '{id} {title} — 이 브랜치의 풀 리퀘스트로 닫힙니다',
  'Search refs & commits…': 'ref와 커밋 검색…',
  '{tips} live lines · {worktrees} worktrees · {branches} branches':
    '살아 있는 선 {tips}개 · 워크트리 {worktrees}개 · 브랜치 {branches}개',
  '{n} matches': '{n}건 일치',
  'Dependency graph': '의존성 그래프',
  'No issue blocks another one': '다른 이슈를 막고 있는 이슈가 없습니다',
  'Caught in a cycle — {n} cannot start': '순환에 갇힘 — {n}건을 시작할 수 없습니다',
  'Ready now': '지금 시작 가능',
  '{n} away': '{n}단계 남음',
  '{n, plural, one {No dependencies — # issue you can start any time} other {No dependencies — # issues you can start any time}}':
    '{n, plural, other {의존성 없음 — 언제든 시작할 수 있는 이슈 #건}}',
  'blocks — follow the arrows to get the start order':
    '차단 — 화살표를 따라가면 시작 순서가 됩니다',
  'blocks inside a cycle': '순환 안의 차단',
  'agent working': '에이전트 작업 중',
  'finishing it frees n issues': '이것을 끝내면 이슈 n건이 풀립니다',
  'it is a sub-issue of #n': '#n의 하위 이슈입니다',
  'n of its m sub-issues are closed': '하위 이슈 m건 중 n건이 닫혔습니다',
  'it has n comments': '댓글이 n건 있습니다',
  'its branch is n commits behind the base': '브랜치가 기준보다 n커밋 뒤처져 있습니다',
  'its branch touches the same files as another': '브랜치가 다른 브랜치와 같은 파일을 건드립니다',
  'the pull request that closes it': '이것을 닫는 풀 리퀘스트',
  'Some blocking issues were not fetched': '막고 있는 이슈 중 일부를 가져오지 않았습니다',
  'some dependencies were not fetched — edges may be missing':
    '일부 의존성을 가져오지 않았습니다 — 간선이 빠져 있을 수 있습니다',
  'Hover an issue to see what finishing it frees':
    '이슈에 마우스를 올리면 그것을 끝냈을 때 무엇이 풀리는지 표시됩니다',
  '{id} is caught in a cycle — nothing frees up until the cycle is broken':
    '{id}은(는) 순환에 갇혀 있습니다 — 순환을 끊기 전에는 아무것도 풀리지 않습니다',
  'Finishing {id} frees nothing': '{id}을(를) 끝내도 풀리는 것이 없습니다',
  '{n, plural, one {Finishing {id} frees # issue} other {Finishing {id} frees # issues}}':
    '{n, plural, other {{id}을(를) 끝내면 이슈 #건이 풀립니다}}',
  '{label} — {state}': '{label} — {state}',
  'Sub-issue of {parent}': '{parent}의 하위 이슈',
  '{closed} of {total} sub-issues closed': '하위 이슈 {total}건 중 {closed}건 닫힘',
  '{n, plural, one {# comment} other {# comments}}': '{n, plural, other {댓글 #건}}',
  'still reading the local git': '로컬 git을 아직 읽는 중',
  'the local git could not be read, so how far behind it is, and whether it conflicts, are unknown':
    '로컬 git을 읽지 못해서 얼마나 뒤처졌는지도, 충돌하는지도 알 수 없습니다',
  '{name} — {ahead} ahead, {behind} behind': '{name} — {ahead} 앞섬, {behind} 뒤처짐',
  'touches the same files as {list}': '{list}과(와) 같은 파일을 건드립니다',
  'Pull request #{number}': '풀 리퀘스트 #{number}',
  '{n, plural, one {# issue} other {# issues}}': '{n, plural, other {이슈 #건}}',
  '{n, plural, one {# other event} other {# other events}}': '{n, plural, other {다른 이벤트 #건}}',
  '{n, plural, one {# event} other {# events}}': '{n, plural, other {이벤트 #건}}',
  '{kind} — {at}': '{kind} — {at}',
  event: '이벤트',
  '{n} events between {from} and {to} · {kinds}': '{from}부터 {to} 사이에 이벤트 {n}건 · {kinds}',
  ' The event log was also cut short, so what is missing lies out there too.':
    ' 이벤트 기록도 도중에 끊겼으므로 빠진 것은 그 너머에도 있습니다.',
  '{what} before this span, the most recent on {at} — widen the span to see them.':
    '이 구간 이전에 {what}이(가) 있고, 가장 최근은 {at}입니다 — 구간을 넓히면 표시됩니다.',
  '{what} beyond this span, the earliest on {at} — widen the span to see them.':
    '이 구간 이후에 {what}이(가) 있고, 가장 이른 것은 {at}입니다 — 구간을 넓히면 표시됩니다.',
  'Open issues and closed issues, day by day': '열린 이슈와 닫힌 이슈의 일별 추이',
  'open now {n} (peak {peak})': '현재 열림 {n} (최대 {peak})',
  'closed cumulative {n}': '닫힘 누계 {n}',
  'last 30d': '최근 30일',
  '{n} waiting on nothing': '아무것도 기다리지 않는 것 {n}건',
  Waiting: '대기',
  '{n} free up as the ones above land': '위의 것이 끝나면 {n}건이 풀립니다',
  'Caught in a cycle': '순환에 갇힘',
  Closed: '닫힘',
  '{n} done': '{n}건 완료',
  'No milestone': '마일스톤 없음',
  '{open} of {total} open': '전체 {total}건 중 {open}건 열림',
  'Sort by start order: open with all blocks cleared, most recently updated first (exclusive with column sort)':
    '시작 순서로 정렬: 차단이 모두 풀린 열린 이슈를 최근 갱신 순으로 (열 정렬과 함께 쓸 수 없음)',
  Start: '시작 순서',
  ID: 'ID',
  Title: '제목',
  Type: '종류',
  Labels: '라벨',
  'Milestone {title} — due {at}': '마일스톤 {title} — 기한 {at}',
  'Reading the issue event log': '이슈 이벤트 기록을 읽는 중',
  'No matching issues': '일치하는 이슈가 없습니다',
  'this order may be missing constraints': '이 순서에는 빠진 제약이 있을 수 있습니다',
  'Issue events could not be read': '이슈 이벤트를 읽지 못했습니다',
  'no reason was given': '이유는 제시되지 않았습니다',
  'This project has no issue event log': '이 프로젝트에는 이슈 이벤트 기록이 없습니다',
  'nothing to read': '읽을 것이 없습니다',
  'these are the events read before the last attempt':
    '이것은 마지막 시도 이전에 읽은 이벤트입니다',
  'the event log was cut short': '이벤트 기록이 도중에 끊겼습니다',
  'they were not in the event log': '이벤트 기록 안에 없었습니다',
  'for some, it stopped before any of their events':
    '일부는 그 이벤트에 닿기 전에 읽기가 멈췄습니다',
  'for some, no event time could be read': '일부는 이벤트 시각을 읽지 못했습니다',
  'The issue events could not be refreshed': '이슈 이벤트를 새로 읽지 못했습니다',
  'Some issues were not read': '일부 이슈를 읽지 않았습니다',
  'This issue was not in the event log that was read':
    '이 이슈는 읽어 온 이벤트 기록 안에 없었습니다',
  ' — the event log was also cut short here': ' — 여기서는 이벤트 기록도 도중에 끊겼습니다',
  'The time on {what} could not be read, so nothing is drawn here{also}':
    '{what}의 시각을 읽지 못해서 여기에는 아무것도 그리지 않았습니다{also}',
  'The event log was cut short before it reached any event on this issue':
    '이벤트 기록은 이 이슈의 어떤 이벤트에도 닿기 전에 끊겼습니다',
  ' — the time on {what} could not be read': ' — {what}의 시각을 읽지 못했습니다',
  'No events on record since it was opened{missed}':
    '열린 뒤 기록에 남은 이벤트가 없습니다{missed}',
  'No events on record for this issue{missed}':
    '이 이슈에 대해 기록에 남은 이벤트가 없습니다{missed}',
  '{what} read, the last on {at}{missed}': '{what}을(를) 읽었고, 가장 최근은 {at}입니다{missed}',
  'Opened {at}': '{at}에 열림',
  '{opened}, before this span starts — the ring sits at the edge, not at that time. Widen the span to place it.':
    '{opened}, 이 구간이 시작되기 전입니다 — 원은 가장자리에 있을 뿐, 그 시각의 위치가 아닙니다. 구간을 넓히면 제자리에 놓입니다.',
  '{opened}, after this span ends — the ring sits at the edge, not at that time.':
    '{opened}, 이 구간이 끝난 뒤입니다 — 원은 가장자리에 있을 뿐, 그 시각의 위치가 아닙니다.',
  'Waiting on {blocker} — about {days}d, measured from a close time taken from updated_at, so where this wait starts is approximate':
    '{blocker}을(를) 기다리는 중 — 약 {days}일. 닫힌 시각을 updated_at에서 가져왔으므로 이 대기의 시작점은 근사값입니다',
  'Waiting on {blocker} — {days}d from {blocker} ending to this issue being created':
    '{blocker}을(를) 기다리는 중 — {blocker}이(가) 끝난 뒤 이 이슈가 만들어지기까지 {days}일',
  '{blocker} ended before this span': '{blocker}은(는) 이 구간 이전에 끝났습니다',
  'this issue was created after this span': '이 이슈는 이 구간 이후에 만들어졌습니다',
  '{measured}. The line stops at the edge of this span: {stopped} — widen the span to see the whole wait.':
    '{measured}. 선은 이 구간의 가장자리에서 멈춥니다: {stopped} — 구간을 넓히면 대기 전체가 보입니다.',
  ' and ': ', 그리고 ',
  'First event {at} — earlier than the time this issue was opened':
    '첫 이벤트는 {at} — 이 이슈가 열린 시각보다 이릅니다',
  'First event {at} — when this issue was opened could not be read':
    '첫 이벤트는 {at} — 이 이슈가 언제 열렸는지는 읽지 못했습니다',
  'last event {at}': '마지막 이벤트는 {at}',
  'closed around {at}, taken from updated_at': '{at} 무렵에 닫힘. updated_at에서 가져온 값',
  'closed {at}': '{at}에 닫힘',
  'it starts before this span': '이 구간 이전에 시작됩니다',
  'it runs past this span': '이 구간 너머까지 이어집니다',
  '{from} — {to}. The line stops at the edge of this span: {stopped} — widen the span to see all of it.':
    '{from} — {to}. 선은 이 구간의 가장자리에서 멈춥니다: {stopped} — 구간을 넓히면 전체가 보입니다.',
  '{n, plural, one {# milestone is} other {# milestones are}} due before this span: {listed} — widen the span to see them':
    '{n, plural, other {마일스톤 #건}}의 기한이 이 구간 이전입니다: {listed} — 구간을 넓히면 보입니다',
  '{n, plural, one {# milestone is} other {# milestones are}} due beyond this span: {listed} — widen the span to see them':
    '{n, plural, other {마일스톤 #건}}의 기한이 이 구간 이후입니다: {listed} — 구간을 넓히면 보입니다',
  '{n, plural, one {# milestone has} other {# milestones have}} no due date: {listed} — nothing can be placed on this axis for them':
    '{n, plural, other {마일스톤 #건}}에 기한이 없습니다: {listed} — 이 축 위에 놓을 수 없습니다',
  'the local git could not be read, so how far ahead or behind it is, and whether it conflicts, are unknown':
    '로컬 git을 읽지 못해서 얼마나 앞서거나 뒤처졌는지도, 충돌하는지도 알 수 없습니다',
  'Open branch {name}': '브랜치 {name} 열기',
  'worktree {name}': '워크트리 {name}',
  'Child issue progress: {closed}/{total} closed': '하위 이슈 진행: {total}건 중 {closed}건 닫힘',
  'Pull request #{number} — {state}{review}{branch}':
    '풀 리퀘스트 #{number} — {state}{review}{branch}',
  'on {branch}': '{branch}에서',
  'Finishing this frees {n}': '이것을 끝내면 {n}건이 풀립니다',
  'Some blocking issues are not shown — this issue has more dependencies than glasshive fetches':
    '막고 있는 이슈 일부가 표시되지 않았습니다 — 이 이슈에는 glasshive가 가져오는 수보다 많은 의존성이 있습니다',
  'deps cut': '의존성 잘림',
  '{n} concurrent': '동시 {n}개',
  'Only the 30 most recent events were read — anything before {to} is not shown':
    '최근 이벤트 30건만 읽었습니다 — {to} 이전의 것은 표시되지 않습니다',
  'Only the 30 most recent events were read — anything between {from} and {to} is not shown':
    '최근 이벤트 30건만 읽었습니다 — {from}부터 {to} 사이의 것은 표시되지 않습니다',
  'When this issue was opened could not be read, and no events are on record — nothing can be placed on this axis for it':
    '이 이슈가 언제 열렸는지 읽지 못했고 기록에 남은 이벤트도 없습니다 — 이 축 위에 놓을 수 없습니다',
  'Closed around {at}, taken from updated_at, so the close time is approximate':
    '{at} 무렵에 닫힘. updated_at에서 가져왔으므로 닫힌 시각은 근사값입니다',
  'Closed {at}': '{at}에 닫힘',
  'parent-child': '상위-하위',
  'blocks — the arrow points at what comes later': '차단 — 화살표는 나중에 오는 쪽을 가리킵니다',
  other: '기타',
  'its branch is n ahead and n behind the base': '브랜치가 기준보다 n 앞서고 n 뒤처져 있습니다',
  'it has a branch, but the local git could not be read':
    '브랜치는 있지만 로컬 git을 읽지 못했습니다',
  'n concurrent': '동시 n개',
  'more than one agent is on it right now': '지금 둘 이상의 에이전트가 붙어 있습니다',
  'from the first instant observed to the last — never to now':
    '관측한 첫 시각부터 마지막 시각까지 — 지금까지가 아닙니다',
  created: '생성',
  'something happened': '무언가 일어났습니다',
  'more than one, too close to tell apart': '둘 이상이며, 너무 가까워 구분할 수 없습니다',
  'closed, the time taken from updated_at': '닫힘. 시각은 updated_at에서 가져온 값',
  'read only back to here': '여기까지만 거슬러 읽었습니다',
  'not read': '읽지 않음',
  'still reading': '아직 읽는 중',
  'a milestone is due': '마일스톤 기한',
  'some dependencies were not fetched — arcs may be missing':
    '일부 의존성을 가져오지 않았습니다 — 호가 빠져 있을 수 있습니다',
  'some issues were not read — those rows are hatched, not empty':
    '일부 이슈를 읽지 않았습니다 — 그 행은 비어 있는 것이 아니라 빗금이 그어져 있습니다',
  blocks: '차단',
  '{kind}: {title}': '{kind}: {title}',
  'This issue and the issues connected to it': '이 이슈와 여기에 연결된 이슈',
  'this issue': '이 이슈',
  'Not read yet': '아직 읽지 않음',
  'Some of this project could not be read — the count may be short':
    '이 프로젝트의 일부를 읽지 못했습니다 — 개수가 실제보다 적을 수 있습니다',
  '{n, plural, one {# run in view} other {# runs in view}}':
    '{n, plural, other {화면 안 실행 #건}}',
  'Some activity could not be read — the gaps may not be quiet':
    '일부 활동을 읽지 못했습니다 — 빈 곳이 조용했다는 뜻은 아닙니다',
  Projects: '프로젝트',
  Pinned: '고정됨',
  Project: '프로젝트',
  Active: '실행 중',
  Input: '입력 대기',
  'Tokens 24h': '토큰 24h',
  Activity: '활동',
  'Last activity': '마지막 활동',
  'Unpin {name}': '{name} 고정 해제',
  'Pin {name}': '{name} 고정',
  'Could not be read': '읽지 못했습니다',
  '{tokens} — {percent}% of the {total} shown': '{tokens} — 표시된 {total} 중 {percent}%',
  all: '전체',
  pinned: '고정됨',
  'any time': '전체 기간',
  'Some projects could not be read — the counts may be short':
    '일부 프로젝트를 읽지 못했습니다 — 개수가 실제보다 적을 수 있습니다',
  'Some transcripts could not be read': '일부 트랜스크립트를 읽지 못했습니다',
  'Search projects…': '프로젝트 검색…',
  'Search projects': '프로젝트 검색',
  'Show projects no matter when they last ran': '마지막 실행 시각과 상관없이 모든 프로젝트 표시',
  'Show only projects active within the last {span}': '최근 {span} 안에 활동한 프로젝트만 표시',
  'Reading the transcripts of each project': '프로젝트별로 트랜스크립트를 읽는 중',
  '{read} of {total} projects read': '프로젝트 {total}개 중 {read}개를 읽었습니다',
  'tokens 24h': '토큰 24h',
  type: '종류',
  assignees: '담당자',
  author: '작성자',
  milestone: '마일스톤',
  'Show just {title}': '{title}만 표시',
  'due {at}': '기한 {at}',
  'sub-issues': '하위 이슈',
  '{closed}/{total} closed': '{total}건 중 {closed}건 닫힘',
  'pull requests': '풀 리퀘스트',
  agents: '에이전트',
  reactions: '반응',
  updated: '갱신',
  'Still fetching issues — anything waiting on this one may not be listed yet':
    '아직 이슈를 가져오는 중 — 이 이슈를 기다리는 것은 아직 표시되지 않았을 수 있습니다',
  '+{n} more upstream': '상류에 {n}건 더',
  '+{n} more downstream': '하류에 {n}건 더',
  'Agent activity': '에이전트 활동',
  'Reading the description': '설명을 읽는 중',
  'The description did not come back': '설명이 돌아오지 않았습니다',
  'The rest of this panel is built from the issue list, which glasshive already has. The body text is fetched on its own when you open an issue, and that fetch did not answer.':
    '이 패널의 나머지 부분은 glasshive가 이미 가지고 있는 이슈 목록으로 구성합니다. 본문은 이슈를 열 때 따로 가져오는데, 그 요청이 응답하지 않았습니다.',
  'Read the whole issue on GitHub': 'GitHub에서 이슈 전체 읽기',
  'Reading the issue': '이슈를 읽는 중',
  unknown: '알 수 없음',
  'closed this': '이 이슈를 닫음',
  'as {reason}': '({reason})',
  'reopened this': '이 이슈를 다시 엶',
  added: '라벨 추가:',
  removed: '라벨 제거:',
  assigned: '담당자 지정:',
  unassigned: '담당자 해제:',
  'added this to': '이 이슈를 추가한 곳:',
  'removed this from': '이 이슈를 뺀 곳:',
  renamed: '이름 변경:',
  to: '→',
  'marked this blocked by': '차단 요인으로 지정:',
  'marked this a duplicate of': '중복으로 표시한 대상:',
  'referenced this in': '이 이슈를 언급한 곳:',
  'will close this': '병합되면 이 이슈를 닫음',
  'The text of this comment did not come back': '이 댓글의 본문이 돌아오지 않았습니다',
  Discussion: '논의',
  'Reading the discussion': '논의를 읽는 중',
  'Read the discussion on GitHub': 'GitHub에서 논의 읽기',
  'GitHub has no discussion under this number': 'GitHub에는 이 번호의 논의가 없습니다',
  'gh answered, and the answer carried no issue with this number. A deleted issue, or a number that belongs to another repository, looks like this. It does not say that nothing was written.':
    'gh는 응답했지만 그 응답에 이 번호의 이슈는 없었습니다. 삭제된 이슈이거나 다른 저장소의 번호일 때 이렇게 보입니다. 아무것도 쓰이지 않았다는 뜻은 아닙니다.',
  'The discussion did not come back': '논의가 돌아오지 않았습니다',
  'Comments and events are fetched on their own when you open an issue, and that fetch did not answer. The rest of this panel is built from the issue list, which glasshive already has.':
    '댓글과 이벤트는 이슈를 열 때 따로 가져오는데, 그 요청이 응답하지 않았습니다. 이 패널의 나머지 부분은 glasshive가 이미 가지고 있는 이슈 목록으로 구성합니다.',
  'Nothing has been said on this issue yet.': '이 이슈에는 아직 아무 말도 없습니다.',
  'Reading more of the discussion': '논의를 더 읽는 중',
  'Only the first part of this discussion was read. Anything said after the last entry above is not on this screen.':
    '이 논의는 앞부분만 읽었습니다. 위의 마지막 항목 이후에 오간 내용은 이 화면에 없습니다.',
  'this ref': '이 ref',
  'Reading commits': '커밋을 읽는 중',
  '{n} commits ahead of {base}': '{base}보다 {n}커밋 앞섬',
  'recent history': '최근 이력',
  'in {files} files since {base}': '{base} 이후 파일 {files}개에서',
  '· behind {base} by {n}': '· {base}보다 {n} 뒤처짐',
  'Top changes': '변경이 많은 것',
  Commits: '커밋',
  'Language of this interface': '인터페이스 언어',
  'Language of this interface. Observed text is never translated':
    '인터페이스 언어. 관측한 텍스트는 번역하지 않습니다',
  'Follow browser': '브라우저 설정 따르기',
  'By model': '모델별',
  'no usage in range': '구간 안에 사용량이 없습니다',
  'At least this many — some agents could not be counted':
    '최소 이만큼 — 세지 못한 에이전트가 있습니다',
  'Peak agents concurrent in range': '구간 안에서 동시에 실행된 에이전트의 최대 수',
  'Agents concurrent over time': '동시에 실행된 에이전트 수의 추이',
  'the dashed band on top is agents whose activity could not be read':
    '위에 쌓인 점선 띠는 활동을 읽지 못한 에이전트입니다',
  'some agents could not be counted, so the counts are a lower bound':
    '세지 못한 에이전트가 있으므로 이 수는 하한입니다',
  Agents: '에이전트',
  now: '현재',
  peak: '최대',
  'Agents whose activity could not be read': '활동을 읽지 못한 에이전트',
  '{n} unknown': '알 수 없음 {n}',
  'agents concurrent': '개 에이전트 동시 실행',
  '{n} could not be read': '{n}건은 읽지 못했습니다',
  'Could not be read — {reason}': '읽지 못했습니다 — {reason}',
  'reading…': '읽는 중…',
  'could not be read': '읽지 못했습니다',
  'input + output + cache write': '입력 + 출력 + 캐시 쓰기',
  'Tokens over time': '토큰 사용량의 추이',
  'in {input} · out {output} · cacheW {cacheWrite} · cacheR {cacheRead}':
    '입력 {input} · 출력 {output} · 캐시 쓰기 {cacheWrite} · 캐시 읽기 {cacheRead}',
  'Approximated from transcripts (this project only) — may not match billing':
    '트랜스크립트에서 추정한 값 (이 프로젝트만) — 청구 내역과 다를 수 있습니다',
  'Windows (observed)': '쿼터 구간 (관측)',
  '{at} (in {left})': '{at} ({left} 남음)',
  'idle — next prompt opens a window': '유휴 상태 — 다음 입력이 새 구간을 엽니다',
  '{tokens}/day avg': '하루 평균 {tokens}',
  Overview: '개요',
  'Pinned projects': '고정한 프로젝트',
  '{name}{slot} — drag to reorder': '{name}{slot} — 드래그하여 순서 변경',
  '{name} — double-click to pin': '{name} — 두 번 클릭하면 고정',
  '{label} (YYYY-MM-DD HH:MM)': '{label} (YYYY-MM-DD HH:MM)',
  '{from} → {to} · earlier activity (density unknown — beyond bounded scan)':
    '{from} → {to} · 그 이전의 활동 (밀도 불명 — 스캔 범위 밖)',
  '{from} → {to} · {took}{live}': '{from} → {to} · {took}{live}',
  live: '진행 중',
  'No milestones on the issues fetched from GitHub':
    'GitHub에서 가져온 이슈에 마일스톤이 하나도 없습니다',
  'No matching milestones (0 of {total})': '일치하는 마일스톤이 없습니다 (전체 {total}개 중 0개)',
  Milestone: '마일스톤',
  Due: '기한',
  Progress: '진행',
  Open: '열림',
  Blocked: '차단됨',
  Branches: '브랜치',
  'Show issues in {title}': '{title}의 이슈 표시',
  'no milestone': '마일스톤 없음',
  '{n, plural, one {# issue in this milestone was not in the event log that was read, so nothing from it is on this line} other {# issues in this milestone were not in the event log that was read, so nothing from them is on this line}}':
    '{n, plural, other {이 마일스톤의 이슈 #건이 읽어 온 이벤트 기록에 없어서, 그 내용은 이 선에 없습니다}}',
  'Only the 30 most recent events were read for at least one issue here — anything before {to} is not shown':
    '여기의 이슈 중 최소 한 건은 최근 이벤트 30건만 읽었습니다 — {to} 이전의 것은 표시되지 않습니다',
  'The first issue here was opened {at}{clamped}': '여기에서 가장 먼저 열린 이슈는 {at}{clamped}',
  ', outside this span — the ring sits at the edge':
    ', 이 구간 밖입니다 — 원은 가장자리에 있습니다',
  'Due {at}': '기한 {at}',
  '{n, plural, one { — # issue of {total} was not in the event log, so nothing from it is drawn here} other { — # issues of {total} were not in the event log, so nothing from them is drawn here}}':
    '{n, plural, other { — 이슈 {total}건 중 #건이 이벤트 기록에 없어서, 그 내용은 여기에 그리지 않았습니다}}',
  'None of the issues here were in the event log that was read':
    '여기의 이슈는 하나도 읽어 온 이벤트 기록에 없었습니다',
  'The time on {what} could not be read, so nothing is drawn here':
    '{what}의 시각을 읽지 못해서 여기에는 아무것도 그리지 않았습니다',
  'The event log was cut short before it reached any issue here':
    '이벤트 기록은 여기의 어떤 이슈에도 닿기 전에 끊겼습니다',
  'No events on record for the {what} here{missing}':
    '여기의 {what}에 대해 기록에 남은 이벤트가 없습니다{missing}',
  '{what} across {across}, the last on {at}{missing}':
    '{across}에 걸쳐 {what}, 가장 최근은 {at}{missing}',
  'First issue opened {from} — last event {to}':
    '첫 이슈가 열린 것은 {from} — 마지막 이벤트는 {to}',
  '{spans}. The line stops at the edge of this span: {stopped} — widen the span to see all of it.':
    '{spans}. 선은 이 구간의 가장자리에서 멈춥니다: {stopped} — 구간을 넓히면 전체가 보입니다.',
  branches: '브랜치',
  milestones: '마일스톤',
  'Still counting the {unit}': '{unit}을(를) 아직 세는 중',
  'The {unit} could not be read — this is not zero':
    '{unit}을(를) 읽지 못했습니다 — 이것은 0이 아닙니다',
  Issues: '이슈',
  Milestones: '마일스톤',
  'List — rows, with dependency arcs in the gutter':
    '목록 — 행으로 나열하고 의존성 호를 여백에 그림',
  List: '목록',
  'Graph — laid out left to right in start order':
    '그래프 — 시작 순서대로 왼쪽에서 오른쪽으로 배치',
  Graph: '그래프',
  'Search issues…': '이슈 검색…',
  Group: '묶기',
  'Leave the issues nested under their parents': '이슈를 상위 항목 아래에 중첩된 채로 둡니다',
  None: '묶지 않음',
  'Gather the issues under the milestone each one is in':
    '이슈를 각자 속한 마일스톤 아래로 모읍니다',
  Span: '구간',
  All: '전체',
  'Every issue with a known creation time, in one view': '생성 시각을 아는 모든 이슈를 한 화면에',
  'The last 7 days': '최근 7일',
  'The last 30 days': '최근 30일',
  'The last 90 days': '최근 90일',
  open: '열림',
  blocked: '차단됨',
  'not planned': '진행 안 함',
  merged: '병합됨',
  approved: '승인됨',
  'changes requested': '변경 요청됨',
  'review required': '리뷰 필요',
  'blocked by': '차단 요인',
  related: '관련',
  duplicates: '중복',
  supersedes: '대체',
  'discovered from': '발견 출처',
  Auto: '자동',
  'The narrowest of these that still shows everything': '전부가 들어가는 것 중 가장 좁은 폭',
  'The last 30 minutes': '최근 30분',
  'The last hour': '최근 1시간',
  "Claude Code's 5h quota window in one view": 'Claude Code의 5시간 쿼터 구간을 한 화면에',
  'The last day': '최근 1일',
  "Claude Code's weekly quota window in one view": 'Claude Code의 주간 쿼터 구간을 한 화면에',
  'GitHub CLI is not installed': 'GitHub CLI가 설치되어 있지 않습니다',
  'glasshive reads GitHub through the gh command, so it never holds a token of its own. There is a repository behind this project — it just has no way to ask about it.':
    'glasshive는 gh 명령을 통해 GitHub를 읽으므로 자체 토큰을 보유하지 않습니다. 이 프로젝트 뒤에 저장소는 있지만, 물어볼 방법이 없을 뿐입니다.',
  'Install the GitHub CLI': 'GitHub CLI 설치하기',
  'Sign in once': '한 번 로그인하기',
  'GitHub refused the request': 'GitHub가 요청을 거부했습니다',
  'gh is installed and answered, but GitHub would not serve this repository. That is usually an expired login, or a token without access to a private repository.':
    'gh는 설치되어 있고 응답했지만, GitHub가 이 저장소를 내주지 않았습니다. 보통 로그인이 만료되었거나, 비공개 저장소에 접근 권한이 없는 토큰입니다.',
  'See who gh thinks you are': 'gh가 당신을 누구로 아는지 확인하기',
  'Sign in again if the token expired': '토큰이 만료되었으면 다시 로그인하기',
  'GitHub answered with something that is not an issue list':
    'GitHub의 응답이 이슈 목록이 아니었습니다',
  'gh ran and came back, but the answer holds no issues to read — an expired login and a GraphQL error both look like this. Nothing is known about the issues in this repository right now; this is not an empty backlog.':
    'gh는 실행되어 응답했지만, 그 응답에는 읽을 이슈가 없습니다 — 로그인 만료와 GraphQL 오류가 모두 이렇게 보입니다. 지금 이 저장소의 이슈에 대해서는 아무것도 알 수 없습니다. 이슈가 없다는 뜻이 아닙니다.',
  'Ask for the issues by hand to see what comes back':
    '직접 이슈를 요청해 무엇이 돌아오는지 확인하기',
  'GitHub did not answer in time': 'GitHub가 제때 응답하지 않았습니다',
  'The request was sent and never came back. Nothing is known about the issues in this repository right now — this is not an empty backlog.':
    '요청은 보내졌지만 끝내 돌아오지 않았습니다. 지금 이 저장소의 이슈에 대해서는 아무것도 알 수 없습니다 — 이슈가 없다는 뜻이 아닙니다.',
  'Run the same query by hand to see where it stalls':
    '같은 질의를 직접 실행해 어디에서 멈추는지 확인하기',
  'Check whether GitHub itself is degraded': 'GitHub 자체에 장애가 있는지 확인하기',
  'gh exited with an error': 'gh가 오류로 종료되었습니다',
  'gh started and stopped with a non-zero status. It knows why; glasshive only sees the exit code. Running the same command by hand prints the reason.':
    'gh는 실행되었다가 0이 아닌 상태로 멈췄습니다. 이유는 gh가 알고 있고, glasshive는 종료 코드만 볼 수 있습니다. 같은 명령을 직접 실행하면 이유가 출력됩니다.',
  'Run it yourself in this project': '이 프로젝트에서 직접 실행하기',
  'Could not reach GitHub': 'GitHub에 닿지 못했습니다',
  'The request to gh did not produce an answer glasshive could read. The code below is what came back — nothing is known about the issues in this repository right now.':
    'gh에 보낸 요청에서 glasshive가 읽을 수 있는 응답을 얻지 못했습니다. 아래 코드가 돌아온 것입니다 — 지금 이 저장소의 이슈에 대해서는 아무것도 알 수 없습니다.',
  'git is not installed': 'git이 설치되어 있지 않습니다',
  'glasshive shells out to git for branches, worktrees and conflicts. Without it, every project looks like it has no repository — which is not what is being said here.':
    'glasshive는 브랜치, 워크트리, 충돌을 git에 물어봅니다. git이 없으면 모든 프로젝트가 저장소를 갖고 있지 않은 것처럼 보입니다 — 여기서 말하는 것은 그것이 아닙니다.',
  'Install git': 'git 설치하기',
  'git refused to read this repository': 'git이 이 저장소 읽기를 거부했습니다',
  'The directory exists and git ran, but it would not answer. On a shared or mounted checkout this is usually ownership: git declines repositories owned by another user. The repository is there — this is not an empty or missing one.':
    '디렉터리는 있고 git도 실행되었지만 응답하지 않았습니다. 공유되거나 마운트된 체크아웃에서는 보통 소유권 문제입니다: git은 다른 사용자가 소유한 저장소를 거부합니다. 저장소는 거기 있습니다 — 비어 있는 것도, 없는 것도 아닙니다.',
  'Ask git what it objects to': 'git에 무엇이 문제인지 묻기',
  'If it is ownership, trust this checkout': '소유권 문제라면 이 체크아웃을 신뢰하도록 설정하기',
  'git did not finish in time': 'git이 제때 끝나지 않았습니다',
  'The command was started and never returned. A very large history or a stalled network remote can do this.':
    '명령은 시작되었지만 끝내 돌아오지 않았습니다. 매우 큰 이력이나 응답하지 않는 네트워크 리모트가 원인일 수 있습니다.',
  'git exited with an error': 'git이 오류로 종료되었습니다',
  'git ran and stopped with a non-zero status, and what it printed is not a refusal or a missing repository. It knows why; glasshive only sees that it failed. Running the same command by hand prints the reason.':
    'git은 실행되어 0이 아닌 상태로 멈췄고, 출력된 내용은 거부도 저장소 부재도 아닙니다. 이유는 git이 알고 있고, glasshive는 실패했다는 것만 볼 수 있습니다. 같은 명령을 직접 실행하면 이유가 출력됩니다.',
  'Could not read the repository': '저장소를 읽지 못했습니다',
  'git did not produce an answer glasshive could read. The code below is what came back.':
    'git에서 glasshive가 읽을 수 있는 응답을 얻지 못했습니다. 아래 코드가 돌아온 것입니다.',
  'Could not ask glasshive for {what}': 'glasshive에 {what}을(를) 요청하지 못했습니다',
  'The request to the local glasshive server did not come back. The page is still open but the server behind it is not answering — this says nothing about your repository.':
    '로컬 glasshive 서버에 보낸 요청이 돌아오지 않았습니다. 페이지는 열려 있지만 그 뒤의 서버가 응답하지 않습니다 — 이는 저장소에 대해 아무것도 말해 주지 않습니다.',
  'Check the terminal glasshive is running in': 'glasshive를 실행 중인 터미널 확인하기',
  'Reload once the server is back': '서버가 돌아오면 새로 고치기',
  'No project by that name': '그런 이름의 프로젝트가 없습니다',
  'glasshive lists whatever it finds under ~/.claude/projects, and nothing there answers to this name. A renamed or removed directory leaves a link like this behind — the link is stale, the tool is fine.':
    'glasshive는 ~/.claude/projects 아래에서 찾은 것만 나열하는데, 그곳에 이 이름에 해당하는 것이 없습니다. 이름을 바꾸거나 지운 디렉터리는 이런 링크를 남깁니다 — 링크가 오래된 것일 뿐, 도구에는 문제가 없습니다.',
  'Open the overview and pick a project that is actually there':
    '개요를 열어 실제로 있는 프로젝트 고르기',
  'See what glasshive can see': 'glasshive가 볼 수 있는 것 확인하기',
  'Could not read the transcripts directory': '트랜스크립트 디렉터리를 읽지 못했습니다',
  'glasshive reads every session from ~/.claude/projects. That read did not come back, so the list below is not empty — it is unknown.':
    'glasshive는 모든 세션을 ~/.claude/projects에서 읽습니다. 그 읽기가 돌아오지 않았으므로 아래 목록은 비어 있는 것이 아니라 알 수 없는 것입니다.',
  'Check that the directory is readable': '그 디렉터리를 읽을 수 있는지 확인하기',
  'Nothing at that ref': '그 ref에는 아무것도 없습니다',
  'git ran and answered, and there are no commits under this name. A deleted branch, a squashed worktree, or a tag that never landed all look like this.':
    'git은 실행되어 응답했고, 이 이름 아래에는 커밋이 없습니다. 삭제된 브랜치, 정리된 워크트리, 끝내 만들어지지 않은 태그가 모두 이렇게 보입니다.',
  'Ask git yourself': '직접 git에 물어보기',
  'Could not read this issue': '이 이슈를 읽지 못했습니다',
  'The request came back with an error instead of the issue. The code below is what came back.':
    '이슈 대신 오류가 돌아왔습니다. 아래 코드가 돌아온 것입니다.',
  'This issue is not in view': '이 이슈는 화면 안에 없습니다',
  'The issues fetched from GitHub for this project do not include {id}. It may have been created after this page loaded, or it may live in another project.':
    '이 프로젝트에 대해 GitHub에서 가져온 이슈에는 {id}이(가) 없습니다. 이 페이지를 불러온 뒤에 만들어졌거나, 다른 프로젝트에 있을 수 있습니다.',
  'Reload to fetch the issues again': '새로 고쳐서 이슈를 다시 가져오기',
  'Check that the project on the tab is the one that owns this id':
    '탭의 프로젝트가 이 id를 가진 쪽인지 확인하기',
  'Could not read more of this conversation': '이 대화를 더 읽지 못했습니다',
  'The transcript is read in windows as you scroll, and this window did not come back. What is already on screen is still what was written — only the part beyond it is unknown.':
    '트랜스크립트는 스크롤에 맞춰 구간별로 읽는데, 이 구간이 돌아오지 않았습니다. 화면에 있는 것은 쓰인 그대로이며, 알 수 없는 것은 그 너머뿐입니다.',
  'Scroll again to retry': '다시 스크롤해서 재시도하기',
  'This view stopped': '이 화면이 멈췄습니다',
  'Something in glasshive itself threw while drawing this view. Nothing was written anywhere — glasshive only reads — so reloading is safe.':
    '이 화면을 그리는 중에 glasshive 자체가 예외를 던졌습니다. 어디에도 쓰지 않았으므로 — glasshive는 읽기만 합니다 — 새로 고쳐도 안전합니다.',
  'Reload the page': '페이지 새로 고치기',
  'Check the terminal glasshive is running in for the full trace':
    'glasshive를 실행 중인 터미널에서 전체 추적 확인하기',
  'No such page': '그런 페이지가 없습니다',
  'glasshive has an overview of every project, and per-project Agents and Work views. This address is none of them.':
    'glasshive에는 모든 프로젝트의 개요와, 프로젝트별 Agents 및 Work 화면이 있습니다. 이 주소는 그중 어느 것도 아닙니다.',
  'Pick a project from the Overview tab above': '위의 Overview 탭에서 프로젝트 고르기',
  'on the branch of PR #{number}': 'PR #{number}의 브랜치에서',
  '{n}s ago': '{n}초 전',
  '{n}m ago': '{n}분 전',
  '{n}h ago': '{n}시간 전',
  '{n}d ago': '{n}일 전',
  today: '오늘',
  'in {n}d': '{n}일 뒤',
  '{n}d overdue': '{n}일 지남',
  '{s}s': '{s}초',
  '{m}m{s}s': '{m}분 {s}초',
  '{h}h{m}m': '{h}시간 {m}분',
  '{m}m': '{m}분',
  '{done} of {total} {unit}': '{total} {unit} 중 {done}',
  '{project}: awaiting your input': '{project}: 입력을 기다리는 중',
};
