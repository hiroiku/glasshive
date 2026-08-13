# glasshive

**Observez vos agents IA au travail, à travers le verre.**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![licence](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[Ce que vous voyez](#ce-que-vous-voyez) · [En lecture seule par conception](#en-lecture-seule-par-conception) · [Options](#options) · [Développement](#développement)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md)

glasshive est un tableau de bord local en lecture seule pour [Claude Code](https://claude.com/claude-code).
Il lit les journaux de session déjà présents sur votre disque et place sur un seul écran les projets
que vous observez — leurs sessions et leurs subagents, ce que chacun est en train de faire, leurs
tickets et leurs branches `git` actives. Voyez-le comme un `htop` pour les sessions d'agents, sans la
touche kill : glasshive n'écrit jamais dans `~/.claude`, ni dans vos dépôts, ni dans votre gestionnaire
de tickets, et il ne peut ni démarrer, ni arrêter, ni piloter un agent.

```sh
npx glasshive
```

Il n'écoute que sur `127.0.0.1:4483` et ouvre votre navigateur. Aucune installation, aucune
configuration, et rien ne quitte votre machine tant que vous n'ouvrez pas la vue GitHub — le paquet
publié n'a aucune dépendance d'exécution. Il vous faut Node.js 22.12 ou plus récent et au moins une
session Claude Code sous `~/.claude/projects`. Il est construit et testé sur macOS et Linux ; sous
Windows le compte des agents vivants revient comme « non observable », car le lire demande `ps` et
soit `/proc/<pid>/cwd`, soit `lsof`.

![glasshive walkthrough](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## Ce que vous voyez

### Overview

Les projets que vous observez. Ceux qui attendent votre réponse viennent en premier, puis ceux qui
tournent encore. Filtrez par nom, par état ou par période, et réorganisez la barre d'onglets. Elle
commence vide : lancez `glasshive` dans un dépôt et ce dépôt est observé désormais, ou choisissez-en
un parmi les répertoires que glasshive a trouvés sans les observer, listés au-dessus du tableau.

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

Les sessions et leurs subagents en un seul arbre : status, model, effort, tokens, le ticket et le
worktree sur lesquels chacun travaille, l'outil qu'il exécute à l'instant, et une frise d'activité que
vous pouvez déplacer et zoomer. Les statistiques de tokens et de concurrence se trouvent en dessous,
sur la même fenêtre de temps.

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Work

Les tickets, les branches et les milestones sur un seul écran, parce qu'il s'agit du même travail
vu sous trois angles. Passez de l'un à l'autre sans quitter la vue.

Les tickets viennent de GitHub via la CLI [`gh`](https://cli.github.com) — glasshive demande à `gh`
vers quel dépôt pointent vos remotes, exactement comme `gh` le décide. Les sous-tickets
s'imbriquent, `blocked by` est tracé comme une arête de dépendance, et les types de ticket, les
labels, les milestones et les assignés suivent.

Les branches et les worktrees sont tracés par-dessus la branche du worktree principal, pour voir
qui est où. Les paires qui se dirigent vers les mêmes fichiers remontent en haut. Choisissez une ref
pour obtenir ses commits, ses statistiques de diff et les agents qui y ont été actifs. Un ticket et
une branche ne sont reliés que par la branche head d'une pull request — en cas de correspondance
approximative, le lien est laissé de côté plutôt que deviné.

![Work](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/work.png)

### Side panel

Les conversations, les tickets et les refs s'ouvrent dans un panneau sur la droite. Ce qui est ouvert
vit dans l'URL : coller le lien ouvre la même chose sur l'écran de quelqu'un d'autre. Le Markdown, le
code et les appels d'outils sont rendus ; la transcription brute n'est jamais réécrite.

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

Un ticket amène avec lui ses commentaires et sa chronologie : qui l'a étiqueté, ce qui le bloquait
et quelle pull request y a fait référence, lus à côté des agents qui y travaillent en ce moment.

![Issue](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/issue.png)

## En lecture seule par conception

- **Il lit trois choses et n'écrit dans aucune.** Les journaux de session de Claude Code
  (`~/.claude/projects/**/*.jsonl`), `git` et — via la CLI `gh` — les tickets du dépôt GitHub vers
  lequel pointent vos remotes. Aucune transcription, aucun dépôt, aucun ticket n'est jamais modifié.
- **Le seul fichier qu'il écrit est le sien.** `~/.config/glasshive/preferences.json` conserve les
  répertoires que vous observez et vos préférences d'affichage. Avant d'écrire, glasshive vérifie que le chemin
  n'est ni dans `~/.claude`, ni dans la racine des transcriptions, ni dans un répertoire `.git` ou
  `.beads` appartenant à un projet qu'il peut voir, et refuse si c'est le cas — écrire dans ce qu'il
  observe est empêché par construction, pas par convention. Supprimez ce seul fichier et il ne reste
  rien de ce que glasshive a écrit.
- **Le paquet publié remonte jusqu'à ce dépôt.** Chaque version est publiée depuis GitHub Actions
  via OIDC et porte une attestation de provenance ; `npm audit signatures` peut donc confronter le
  paquet que vous avez installé au workflow et au commit à partir desquels il a été construit.
- **Deux choses quittent votre machine, et toutes deux concernent des tickets que vous pouvez déjà
  voir.** glasshive écoute sur `127.0.0.1`, rejette les requêtes dont l'en-tête `Host` n'est pas
  local (pour qu'une page hostile ne puisse pas l'atteindre par DNS rebinding) et embarque ses
  propres polices au lieu de les récupérer depuis un CDN. La vue GitHub fait les deux seuls appels
  sortants qui existent : la requête des tickets, qui passe par `gh` — de sorte que glasshive ne lit,
  ne détient ni ne stocke jamais de jeton qui lui soit propre — et les avatars des assignés, que le
  processus de glasshive récupère lui-même depuis `avatars.githubusercontent.com` sans transmettre
  d'identifiants et ne garde qu'en mémoire, si bien que votre navigateur ne reçoit jamais d'URL
  GitHub. Rien de ce qui concerne vos sessions n'est jamais envoyé où que ce soit.
- **« Vide » et « lecture impossible » ne se ressemblent jamais.** Un champ qui n'a pas pu être lu est
  porté comme `null` avec la raison attachée, si bien qu'un écran silencieux n'est jamais ambigu.
- **Les mauvaises options échouent bruyamment.** Un drapeau illisible sort en erreur au lieu de se
  rabattre silencieusement sur une valeur par défaut.

## Options

```sh
npx glasshive                       # http://127.0.0.1:4483 — observer ce dépôt
npx glasshive .                     # seulement ce dépôt
npx glasshive ~/src/foo             # ou celui-là, depuis n'importe où
npx glasshive --port 8080           # écouter ailleurs
npx glasshive --no-open             # ne pas ouvrir le navigateur
npx glasshive --status              # où il tourne, et depuis quand
npx glasshive --stop                # l'arrêter, depuis n'importe quel terminal
npx glasshive --active-threshold 120  # secondes depuis la dernière écriture comptant encore comme active
npx glasshive --config-dir ~/somewhere  # où preferences.json est conservé
```

Lancez `glasshive --help` pour la liste complète.

**Nommer un répertoire, c'est commencer à l'observer.** `glasshive .` observe ce dépôt et l'ouvre ;
un `glasshive` seul fait de même lorsque vous êtes dans un dépôt git, et atterrit sur l'Overview
sinon. Le chemin est résolu vers le dépôt auquel il appartient : un sous-répertoire ou un worktree
vous mènent au même endroit.

**Observer, c'est ce que vous voyez, pas ce que glasshive a le droit de lire.** Tous les répertoires
sous `~/.claude/projects` restent trouvés par leur nom, et l'Overview liste ceux que vous n'observez
pas pour que vous les ajoutiez en un clic. Seul ce que vous observez est lu en entier ; du reste, on
ne lit qu'une ligne d'une transcription, juste de quoi savoir où il se trouve. Cessez d'observer un
projet depuis son onglet et il retourne dans cette liste ; rien n'est supprimé.

**Un seul serveur, quel que soit le nombre de lancements.** Relancer `glasshive` n'en démarre pas un
second. Il trouve le serveur déjà à l'écoute, lui transmet le chemin que vous avez nommé et ouvre
cette fenêtre — le balayage, l'index et tout ce que `git` a déjà répondu sont réutilisés, si bien
que la deuxième fenêtre arrive presque aussi vite qu'un changement d'onglet. Seule la ligne de
commande peut nommer un répertoire ainsi ; une page ouverte dans votre navigateur ne le peut pas. Le
port par défaut ne glisse vers le suivant que lorsque quelque chose qui n'est pas glasshive
l'occupe.

Comme il n'y en a qu'un, vous n'avez jamais à vous rappeler quel terminal le détient :

```sh
$ glasshive --status
glasshive: http://127.0.0.1:4483 (pid 61651, up 2h 15m)

$ glasshive --stop
glasshive: stopped http://127.0.0.1:4483 (pid 61651, up 2h 15m)
```

`--status` liste tous les glasshive qu'il trouve et sort avec un code non nul quand il n'y en a
aucun : il se lit donc comme une condition dans un script. `--stop` les arrête tous et ne se plaint
pas de n'en trouver aucun.

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

## Licence

MIT — voir [LICENSE](../LICENSE).
