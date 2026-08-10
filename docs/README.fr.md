# glasshive

**Observez vos agents IA au travail, à travers le verre.**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![licence](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[Ce que vous voyez](#ce-que-vous-voyez) · [En lecture seule par conception](#en-lecture-seule-par-conception) · [Options](#options) · [Développement](#développement)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md)

glasshive est un tableau de bord local en lecture seule pour [Claude Code](https://claude.com/claude-code).
Il lit les journaux de session déjà présents sur votre disque et place sur un seul écran chaque projet
dans lequel un agent a travaillé — ses sessions et ses subagents, ce que chacun est en train de faire,
ses tickets et ses branches `git` actives. Voyez-le comme un `htop` pour les sessions d'agents, sans la
touche kill : glasshive n'écrit jamais dans `~/.claude`, ni dans vos dépôts, ni dans votre gestionnaire
de tickets, et il ne peut ni démarrer, ni arrêter, ni piloter un agent.

```sh
npx glasshive
```

Il n'écoute que sur `127.0.0.1:4483` et ouvre votre navigateur. Aucune installation, aucune
configuration, aucun accès réseau — le paquet publié n'a aucune dépendance d'exécution. Il vous faut
Node.js 22.12 ou plus récent et au moins une session Claude Code sous `~/.claude/projects`. Il est
construit et testé sur macOS et Linux ; sous Windows le compte des agents vivants revient comme
« non observable », car le lire demande `ps` et soit `/proc/<pid>/cwd`, soit `lsof`.

![glasshive walkthrough](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## Ce que vous voyez

### Overview

Chaque projet dans lequel un agent a travaillé, d'où que vous ayez lancé glasshive. Ceux qui
attendent votre réponse viennent en premier, puis ceux qui tournent encore. Filtrez par nom, par
état ou par période, et épinglez à la barre d'onglets les projets qui comptent pour vous.

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

Les sessions et leurs subagents en un seul arbre : status, model, effort, tokens, le ticket et le
worktree sur lesquels chacun travaille, l'outil qu'il exécute à l'instant, et une frise d'activité que
vous pouvez déplacer et zoomer. Les statistiques de tokens et de concurrence se trouvent en dessous,
sur la même fenêtre de temps.

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Git

Les branches et worktrees actifs tracés par-dessus la branche du worktree principal, pour voir qui est où. Les
paires qui se dirigent vers les mêmes fichiers remontent en haut de la liste. Choisissez une ref pour
obtenir ses commits, ses statistiques de diff et les agents qui y ont été actifs.

![Git](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/git.png)

### Beads

Le registre de tickets de [`bd`](https://github.com/gastownhall/beads), avec les arêtes de dépendance,
l'imbrication parent–enfant et le flux ouvert/fermé dans le temps. Les projets qui n'utilisent pas
`bd` reçoivent une courte note au lieu d'un écran vide.

![Beads](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/beads.png)

### Side panel

Les conversations, les tickets et les refs s'ouvrent dans un panneau sur la droite. Ce qui est ouvert
vit dans l'URL : coller le lien ouvre la même chose sur l'écran de quelqu'un d'autre. Le Markdown, le
code et les appels d'outils sont rendus ; la transcription brute n'est jamais réécrite.

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

## En lecture seule par conception

- **Il lit trois choses et n'écrit dans aucune.** Les journaux de session de Claude Code
  (`~/.claude/projects/**/*.jsonl`), le registre beads (`<project>/.beads/issues.jsonl`) et `git`.
  Aucune transcription, aucun registre, aucun dépôt n'est jamais modifié.
- **Le seul fichier qu'il écrit est le sien.** `~/.config/glasshive/preferences.json` conserve vos
  onglets épinglés et vos préférences d'affichage. Avant d'écrire, glasshive vérifie que le chemin
  n'est ni dans `~/.claude`, ni dans la racine des transcriptions, ni dans un répertoire `.beads` ou
  `.git` observé, et refuse si c'est le cas — écrire dans ce qu'il observe est empêché par
  construction, pas par convention. Supprimez ce seul fichier et il ne reste rien de ce que
  glasshive a écrit.
- **Le paquet publié remonte jusqu'à ce dépôt.** Chaque version est publiée depuis GitHub Actions
  via OIDC et porte une attestation de provenance ; `npm audit signatures` peut donc confronter le
  paquet que vous avez installé au workflow et au commit à partir desquels il a été construit.
- **Rien ne quitte votre machine.** Il écoute sur `127.0.0.1`, rejette les requêtes dont l'en-tête
  `Host` n'est pas local (pour qu'une page hostile ne puisse pas l'atteindre par DNS rebinding),
  n'émet aucune requête sortante et embarque ses propres polices au lieu de les récupérer depuis
  un CDN.
- **« Vide » et « lecture impossible » ne se ressemblent jamais.** Un champ qui n'a pas pu être lu est
  porté comme `null` avec la raison attachée, si bien qu'un écran silencieux n'est jamais ambigu.
- **Les mauvaises options échouent bruyamment.** Un drapeau illisible sort en erreur au lieu de se
  rabattre silencieusement sur une valeur par défaut.

## Options

```sh
npx glasshive                       # http://127.0.0.1:4483
npx glasshive --port 8080           # écouter ailleurs
npx glasshive --no-open             # ne pas ouvrir le navigateur
npx glasshive --active-threshold 120  # secondes depuis la dernière écriture comptant encore comme active
npx glasshive --config-dir ~/somewhere  # où preferences.json est conservé
```

Lancez `glasshive --help` pour la liste complète. La portée n'est pas une option de démarrage : chaque
projet dans lequel un agent a travaillé est listé, et c'est vous qui choisissez lesquels deviennent
des onglets.

### Clavier

| Touche | Effet |
| --- | --- |
| `⌘1` … `⌘9` | Aller à un onglet par sa position (1 = Overview) |
| `⌘⇧←` / `⌘⇧→` | Déplacer d'un cran à gauche ou à droite l'onglet où vous êtes |
| `Tab` | Parcourir les lignes, les puces, les en-têtes de tri et les poignées |
| `Esc` | Fermer le panneau |

Tout est accessible au clavier, et l'élément qui a le focus est toujours entouré. `Ctrl` remplace `⌘`
sur les claviers non Apple.

## Développement

```sh
npm install
npm run dev     # http://127.0.0.1:4483
npm run check   # format, frontières de couches, types, tests
npm run build
```

[Bun](https://bun.com/) fonctionne tel quel — remplacez `npm` par `bun`. Voir
[CONTRIBUTING.md](../CONTRIBUTING.md) pour l'architecture, les contrôles qualité et la façon de
travailler dessus.

## Support

Vous avez trouvé un bug, ou vous voulez quelque chose que glasshive ne fait pas ?
[Ouvrez une issue](https://github.com/hiroiku/glasshive/issues).

Voir aussi : [Claude Code](https://claude.com/claude-code) ·
[beads](https://github.com/gastownhall/beads)

## Licence

MIT — voir [LICENSE](../LICENSE).
