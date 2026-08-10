# glasshive

**유리 너머로, AI 에이전트가 일하는 모습을 지켜보세요.**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![license](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[보이는 것](#보이는-것) · [설계상 읽기 전용](#설계상-읽기-전용) · [옵션](#옵션) · [개발](#개발)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

glasshive는 [Claude Code](https://claude.com/claude-code)를 위한 읽기 전용 로컬 대시보드입니다. 이미
디스크에 쌓여 있는 세션 로그를 읽어, 에이전트가 작업한 모든 프로젝트를 — 그 세션과 서브에이전트,
각각이 지금 무엇을 하고 있는지, 이슈, 그리고 살아 있는 git 브랜치까지 — 한 화면에 놓습니다. 에이전트
세션을 위한 `htop`, 다만 kill 키는 없다고 생각하면 됩니다. glasshive는 `~/.claude`에도, 저장소에도,
이슈 트래커에도 결코 쓰지 않으며, 에이전트를 시작하거나 멈추거나 조종할 수 없습니다.

```sh
npx glasshive
```

`127.0.0.1:4483`에서만 서비스하고, 브라우저를 엽니다. 설치 단계도, 설정도 없고, GitHub 뷰를 열기
전까지는 아무것도 기기를 벗어나지 않습니다 — 배포된 패키지에는 런타임 의존성이 하나도 없습니다.
Node.js 22.12 이상과,
`~/.claude/projects` 아래에 최소 하나의 Claude Code 세션이 필요합니다. 빌드와 동작 확인은
macOS와 Linux에서 합니다. Windows에서는 살아 있는 에이전트의 수가 "관찰할 수 없음"으로
돌아옵니다 — 세는 데 `ps`와, `/proc/<pid>/cwd` 또는 `lsof`가 필요하기 때문입니다.

![glasshive 둘러보기](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## 보이는 것

### Overview

glasshive를 어디에서 실행했든, 에이전트가 작업한 모든 프로젝트. 당신의 입력을 기다리는 것이 먼저 오고,
그다음이 아직 실행 중인 것입니다. 이름, 상태, 기간으로 걸러내고, 신경 쓰는 프로젝트는 탭 바에
고정하세요.

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

세션과 그 서브에이전트를 하나의 트리로. Status, Model, Effort, 토큰, 각각이 작업 중인 이슈와
worktree, 지금 실행 중인 도구, 그리고 좌우로 끌고 확대·축소할 수 있는 활동 타임라인. 그 아래에는 같은
구간을 기준으로 한 토큰과 동시 실행 통계가 놓입니다.

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Work

이슈, 브랜치, 마일스톤을 한 화면에. 셋 다 같은 일을 세 방향에서 본 것이기 때문입니다. 화면을 떠나지
않고 그 사이를 오갈 수 있습니다.

이슈는 [`gh`](https://cli.github.com) CLI를 통해 GitHub에서 오거나,
[`bd`](https://github.com/gastownhall/beads) 원장에서 옵니다. 어느 저장소인지는 glasshive가 `gh`에게
물어봅니다 — `gh`가 스스로 정하는 방식 그대로, 당신의 remote가 가리키는 저장소입니다. sub-issue는
중첩되고, `blocked by`는 의존 관계의 간선으로 그려지며, 이슈 타입·레이블·마일스톤·담당자도 함께 옵니다.

브랜치와 worktree는 메인 worktree의 브랜치 위에 그려지므로, 누가 어디에 있는지 보입니다. 같은 파일로
향하고 있는 짝은 위쪽으로 올라옵니다. ref를 고르면 그 커밋, diff 통계, 그리고 어떤 에이전트가 그
위에서 활동했는지를 볼 수 있습니다. 이슈와 브랜치는 pull request의 head 브랜치로만 이어집니다 —
비슷해 보이지만 어긋나는 것은 추측으로 잇지 않고 그대로 둡니다.

![Work](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/work.png)

### Side panel

대화, 이슈, ref는 오른쪽 패널에서 열립니다. 무엇이 열려 있는지는 URL에 담기므로, 그 링크를 붙여 넣으면
다른 사람 화면에서도 같은 것이 열립니다. 마크다운, 코드, 도구 호출은 렌더링되지만, 원본 트랜스크립트가
고쳐 쓰이는 일은 없습니다.

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

## 설계상 읽기 전용

- **네 가지를 읽고, 그중 어느 것에도 쓰지 않습니다.** Claude Code 세션 로그
  (`~/.claude/projects/**/*.jsonl`), beads 원장(`<project>/.beads/issues.jsonl`), `git`, 그리고
  `gh` CLI를 통해 당신의 remote가 가리키는 GitHub 저장소의 이슈. 트랜스크립트도, 원장도, 저장소도,
  이슈도 결코 수정되지 않습니다.
- **쓰는 파일은 자기 것 하나뿐입니다.** `~/.config/glasshive/preferences.json`에 고정한 탭과 화면
  설정이 들어갑니다. 쓰기 전에 glasshive는 그 경로가 `~/.claude`, 트랜스크립트 루트, 또는 관찰 중인
  어떤 `.beads`나 `.git` 디렉터리 안에 있지 않은지 확인하고, 안에 있으면 거부합니다 — 관찰하는 대상에
  쓰는 일은 관례가 아니라 구조로 막혀 있습니다. 그 파일 하나를 지우면 glasshive가 쓴 것은
  아무것도 남지 않습니다.
- **배포된 패키지는 이 저장소까지 추적할 수 있습니다.** 모든 버전은 GitHub Actions에서 OIDC로
  publish되며 provenance attestation이 붙으므로, `npm audit signatures`로 설치한 패키지를
  그것을 빌드한 workflow와 커밋까지 대조할 수 있습니다.
- **기기를 벗어나는 것은 두 가지뿐이고, 둘 다 이미 볼 수 있는 이슈에 관한 것입니다.** glasshive는
  `127.0.0.1`에 바인딩하고, `Host` 헤더가 로컬이 아닌 요청은 거부하며(그래서 악의적인 페이지가 DNS
  리바인딩으로 닿을 수 없습니다), 폰트를 CDN에서 가져오는 대신 직접 번들합니다. 바깥으로 나가는 호출은
  GitHub 뷰의 두 가지가 전부입니다. 하나는 이슈 조회로, `gh`에 맡깁니다 — glasshive는 자기 토큰을
  읽지도, 가지지도, 저장하지도 않습니다. 다른 하나는 담당자 아바타로, glasshive의 프로세스가 자격 증명
  없이 `avatars.githubusercontent.com`에서 가져와 메모리에만 담아 두므로, 브라우저에 GitHub URL이
  건네지는 일은 없습니다. 세션의 내용이 어딘가로 보내지는 일은 없습니다.
- **"비어 있음"과 "읽지 못함"은 결코 같아 보이지 않습니다.** 읽지 못한 필드는 그 이유를 붙인 채
  `null`로 전달되므로, 조용한 화면이 모호해지는 일은 없습니다.
- **잘못된 옵션은 요란하게 실패합니다.** 해석할 수 없는 플래그는 조용히 기본값으로 되돌아가지 않고,
  오류와 함께 종료합니다.

## 옵션

```sh
npx glasshive                       # http://127.0.0.1:4483
npx glasshive --port 8080           # 다른 곳에서 듣기
npx glasshive --no-open             # 브라우저를 열지 않기
npx glasshive --active-threshold 120  # 마지막 쓰기로부터 몇 초까지 active로 볼지
npx glasshive --config-dir ~/somewhere  # preferences.json을 둘 곳
```

전체 목록은 `glasshive --help`로 확인하세요. 범위는 시작 옵션이 아닙니다. 에이전트가 작업한 모든
프로젝트가 나열되고, 그중 어떤 것을 탭으로 만들지는 당신이 고릅니다.

### 키보드

| 키 | 하는 일 |
| --- | --- |
| `⌘1` … `⌘9` | 위치로 탭 이동 (1은 Overview) |
| `⌘⇧←` / `⌘⇧→` | 지금 있는 탭을 한 칸 왼쪽·오른쪽으로 이동 |
| `Tab` | 행, 칩, 정렬 헤더, 핸들 사이를 이동 |
| `Esc` | 패널 닫기 |

모든 것에 키보드로 닿을 수 있고, 초점이 있는 요소에는 항상 외곽선이 그려집니다. Apple이 아닌
키보드에서는 `⌘` 자리에 `Ctrl`이 들어갑니다.

## 개발

```sh
npm install
npm run dev     # http://127.0.0.1:4483
npm run check   # 포맷, 레이어 경계, 타입, 테스트
npm run build
```

[Bun](https://bun.com/)도 그대로 동작합니다 — `npm`을 `bun`으로 바꾸면 됩니다. 아키텍처, 품질 게이트,
그리고 이 프로젝트에서 작업하는 방법은 [CONTRIBUTING.md](../CONTRIBUTING.md)를 보세요.

## 지원

버그를 찾았거나, glasshive가 하지 못하는 무언가가 필요한가요?
[이슈를 열어 주세요](https://github.com/hiroiku/glasshive/issues).

## 라이선스

MIT — [LICENSE](../LICENSE)를 보세요.
