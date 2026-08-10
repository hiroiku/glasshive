# glasshive

**Sieh deinen KI-Agenten bei der Arbeit zu – durch Glas.**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![Lizenz](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[Was du siehst](#was-du-siehst) · [Nur lesend, per Design](#nur-lesend-per-design) · [Optionen](#optionen) · [Entwicklung](#entwicklung)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch**

glasshive ist ein rein lesendes, lokales Dashboard für [Claude Code](https://claude.com/claude-code).
Es liest die Session-Logs, die ohnehin schon auf deiner Platte liegen, und bringt jedes Projekt, in
dem ein Agent gearbeitet hat, auf einen Bildschirm – seine Sessions und Subagents, was jedes davon
gerade tut, seine Issues und seine laufenden git-Branches. Denk an `htop` für Agent-Sessions, nur
ohne Kill-Taste: glasshive schreibt nie nach `~/.claude`, nie in deine Repositories und nie in deinen
Issue-Tracker, und es kann einen Agenten weder starten noch stoppen noch steuern.

```sh
npx glasshive
```

Es lauscht ausschließlich auf `127.0.0.1:4483` und öffnet deinen Browser. Kein Installationsschritt,
keine Konfiguration, und nichts verlässt deinen Rechner, bis du die GitHub-Ansicht öffnest – das
veröffentlichte Paket hat null Laufzeitabhängigkeiten. Du brauchst Node.js 22.12 oder neuer und
mindestens eine Session von Claude Code unter `~/.claude/projects`. Gebaut und getestet wird auf
macOS und Linux; unter Windows kommt die Zahl der lebenden Agenten als „nicht beobachtbar“ zurück,
denn sie zu lesen braucht `ps` und entweder `/proc/<pid>/cwd` oder `lsof`.

![glasshive walkthrough](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## Was du siehst

### Overview

Jedes Projekt, in dem ein Agent gearbeitet hat, egal von wo aus du glasshive gestartet hast. Die, die
auf deine Eingabe warten, kommen zuerst, dann die, die noch laufen. Filtere nach Name, Zustand oder
Zeitraum und hefte die Projekte, die dich interessieren, an die Tab-Leiste.

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

Sessions und ihre Subagents als ein Baum: Status, Model, Effort, Tokens, das Issue und der Worktree,
in dem jeder gerade arbeitet, das Tool, das gerade läuft, und eine Aktivitäts-Timeline, die du
verschieben und zoomen kannst. Darunter stehen Token- und Nebenläufigkeitsstatistiken, begrenzt auf
denselben Zeitraum.

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Work

Issues, Branches und Milestones auf einem Bildschirm, denn sie sind dieselbe Arbeit aus drei
Blickwinkeln. Wechsle zwischen ihnen, ohne die Ansicht zu verlassen.

Issues kommen von GitHub über die [`gh`](https://cli.github.com)-CLI – glasshive fragt `gh`, auf
welches Repository deine Remotes zeigen, genauso, wie `gh` es selbst bestimmt – oder aus einem
[`bd`](https://github.com/gastownhall/beads)-Register. Sub-Issues verschachteln sich, `blocked by`
wird als Abhängigkeitskante gezeichnet, und Issue-Typen, Labels, Milestones und Zuständige kommen
mit.

Branches und Worktrees werden über den Branch des Haupt-Worktrees gezeichnet, damit du siehst, wer
wo ist. Paare, die auf dieselben Dateien zusteuern, rücken an den Anfang. Wähle eine Ref, und du
bekommst ihre Commits, Diff-Statistiken und die Agenten, die auf ihr aktiv waren. Ein Issue und ein
Branch werden nur über den Head-Branch eines Pull Requests verbunden – ein Beinahe-Treffer bleibt
unverbunden, statt auf Verdacht verknüpft zu werden.

### Side panel

Konversationen, Issues und Refs öffnen sich in einem Panel rechts. Was geöffnet ist, steht in der
URL, also öffnet der eingefügte Link auf einem fremden Bildschirm dasselbe. Markdown, Code und
Tool-Aufrufe werden gerendert; das rohe Transkript wird nie umgeschrieben.

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

## Nur lesend, per Design

- **Es liest vier Dinge und schreibt in keines davon.** Die Session-Logs von Claude Code
  (`~/.claude/projects/**/*.jsonl`), das beads-Register (`<project>/.beads/issues.jsonl`), `git`
  und – über die `gh`-CLI – die Issues des GitHub-Repositorys, auf das deine Remotes zeigen. Kein
  Transkript, kein Register, kein Repository und kein Issue wird je verändert.
- **Die einzige Datei, die es schreibt, ist seine eigene.** `~/.config/glasshive/preferences.json`
  enthält deine angehefteten Tabs und Ansichtseinstellungen. Vor dem Schreiben prüft glasshive, dass
  der Pfad nicht in `~/.claude`, im Wurzelverzeichnis der Transkripte oder in einem beobachteten
  `.beads`- oder `.git`-Verzeichnis liegt, und verweigert es andernfalls – in das zu schreiben, was es
  beobachtet, ist bauartbedingt ausgeschlossen, nicht bloß per Konvention. Lösche diese eine Datei,
  und von allem, was glasshive je geschrieben hat, bleibt nichts übrig.
- **Das veröffentlichte Paket lässt sich zu diesem Repository zurückverfolgen.** Jede Version wird
  aus GitHub Actions über OIDC veröffentlicht und trägt eine Provenance-Attestation, sodass
  `npm audit signatures` das installierte Paket gegen den Workflow und den Commit prüfen kann, aus
  denen es gebaut wurde.
- **Zwei Dinge verlassen deinen Rechner, und bei beiden geht es um Issues, die du ohnehin schon
  siehst.** glasshive bindet an `127.0.0.1`, weist Anfragen ab, deren `Host`-Header nicht lokal ist
  (damit eine feindselige Seite es nicht per DNS-Rebinding erreicht), und bringt seine Schriften
  selbst mit, statt sie von einem CDN zu holen. Die GitHub-Ansicht macht die beiden einzigen
  ausgehenden Aufrufe, die es gibt: die Issue-Abfrage, die über `gh` läuft – glasshive liest, hält
  und speichert nie ein eigenes Token –, und die Avatare der Zuständigen, die glasshives eigener
  Prozess ohne mitgesendete Zugangsdaten von `avatars.githubusercontent.com` holt und nur im
  Arbeitsspeicher hält, sodass dein Browser nie eine GitHub-URL bekommt. Nichts aus deinen Sessions
  wird irgendwohin gesendet.
- **„Leer“ und „nicht lesbar“ sehen nie gleich aus.** Ein Feld, das nicht gelesen werden konnte, wird
  als `null` mitgeführt, mit dem Grund daran – ein stiller Bildschirm ist damit nie mehrdeutig.
- **Falsche Optionen scheitern laut.** Ein nicht lesbares Flag beendet das Programm mit einem Fehler,
  statt still auf einen Standardwert zurückzufallen.

## Optionen

```sh
npx glasshive                       # http://127.0.0.1:4483
npx glasshive --port 8080           # woanders lauschen
npx glasshive --no-open             # den Browser nicht öffnen
npx glasshive --active-threshold 120  # Sekunden seit dem letzten Schreiben, die noch als active zählen
npx glasshive --config-dir ~/somewhere  # wo preferences.json liegt
```

Führe `glasshive --help` aus für die vollständige Liste. Der Umfang ist keine Startoption: Jedes
Projekt, in dem ein Agent gearbeitet hat, wird aufgeführt, und du wählst, welche davon zu Tabs
werden.

### Tastatur

| Taste | Wirkung |
| --- | --- |
| `⌘1` … `⌘9` | Nach Position zu einem Tab springen (1 ist Overview) |
| `⌘⇧←` / `⌘⇧→` | Den Tab, auf dem du bist, eine Position nach links oder rechts schieben |
| `Tab` | Durch Zeilen, Chips, Sortier-Header und Griffe wandern |
| `Esc` | Das Panel schließen |

Alles ist über die Tastatur erreichbar, und das fokussierte Element ist immer umrandet. Auf
Nicht-Apple-Tastaturen ersetzt `Ctrl` das `⌘`.

## Entwicklung

```sh
npm install
npm run dev     # http://127.0.0.1:4483
npm run check   # Format, Schichtgrenzen, Typen, Tests
npm run build
```

[Bun](https://bun.com/) funktioniert unverändert – ersetze `npm` durch `bun`. Die Architektur, die
Quality Gates und wie man hier arbeitet, stehen in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Support

Einen Fehler gefunden oder etwas vermisst, das glasshive nicht kann?
[Öffne ein Issue](https://github.com/hiroiku/glasshive/issues).

## Lizenz

MIT – siehe [LICENSE](../LICENSE).
