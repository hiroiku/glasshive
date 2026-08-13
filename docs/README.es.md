# glasshive

**Observa trabajar a tus agentes de IA, a través del cristal.**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![licencia](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[Lo que ves](#lo-que-ves) · [Solo lectura por diseño](#solo-lectura-por-diseño) · [Opciones](#opciones) · [Desarrollo](#desarrollo)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md)

glasshive es un panel local de solo lectura para [Claude Code](https://claude.com/claude-code). Lee
los registros de sesión que ya están en tu disco y pone los proyectos que observas —sus sesiones y
subagentes, lo que cada uno está haciendo ahora mismo, sus issues y sus ramas de git activas— en una
sola pantalla. Piensa en `htop` para sesiones de agentes, sin la tecla que
mata procesos: glasshive nunca escribe en `~/.claude`, ni en tus repositorios, ni en tu gestor de
issues, y no puede arrancar, detener ni dirigir a un agente.

```sh
npx glasshive
```

Sirve solo en `127.0.0.1:4483` y abre tu navegador. Sin paso de instalación, sin configuración, y
nada sale de tu máquina hasta que abras la vista de GitHub: el paquete publicado tiene cero
dependencias en tiempo de ejecución. Necesitas Node.js 22.12 o posterior y al menos una sesión de
Claude Code dentro de `~/.claude/projects`. Se compila y se prueba en macOS y Linux; en Windows el
recuento de agentes vivos vuelve como «no se pudo observar», porque leerlo necesita `ps` y
`/proc/<pid>/cwd` o `lsof`.

![glasshive walkthrough](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## Lo que ves

### Overview

Los proyectos que observas. Van primero los que esperan tu respuesta, y luego los que siguen en
marcha. Filtra por nombre, estado o intervalo de tiempo, y reordena la barra de pestañas. Empieza
vacío: ejecuta `glasshive` dentro de un repositorio y ese repositorio queda observado, o elige uno
de los directorios que glasshive encontró pero no observa, listados encima de la tabla.

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

Las sesiones y sus subagentes como un solo árbol: status, model, effort, tokens, el issue y el
worktree en el que trabaja cada uno, la herramienta que está ejecutando ahora mismo y una línea de
tiempo de actividad que puedes desplazar y ampliar. Debajo están las estadísticas de tokens y de
concurrencia, acotadas a la misma ventana.

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Work

Los issues, las ramas y los milestones en una sola pantalla, porque son el mismo trabajo visto
desde tres lados. Cambia entre ellos sin salir de la vista.

Los issues vienen de GitHub a través de la CLI [`gh`](https://cli.github.com) —glasshive le
pregunta a `gh` a qué repositorio apuntan tus remotes, igual que lo decide `gh`. Los sub-issues se
anidan, `blocked by` se dibuja como una arista de dependencia, y los tipos de issue, las etiquetas,
los milestones y los asignados vienen con ellos.

Las ramas y los worktrees se dibujan sobre la rama del worktree principal, para que veas quién está
dónde. Los pares que se dirigen a los mismos archivos suben al principio. Elige una ref para ver
sus commits, sus estadísticas de diff y qué agentes han estado activos en ella. Un issue y una rama
solo se vinculan a través de la rama head de un pull request: una coincidencia aproximada se deja
sin vincular en lugar de adivinar el vínculo.

![Work](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/work.png)

### Side panel

Las conversaciones, los issues y las refs se abren en un panel a la derecha. Lo que está abierto vive
en la URL, así que pegar el enlace abre lo mismo en la pantalla de otra persona. El Markdown, el
código y las llamadas a herramientas se renderizan; la transcripción original nunca se reescribe.

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

Un issue trae consigo sus comentarios y su cronología: quién le puso etiquetas, qué lo bloqueaba y
qué pull request lo referenció, leído junto a los agentes que están trabajando en él ahora mismo.

![Issue](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/issue.png)

## Solo lectura por diseño

- **Lee tres cosas y no escribe en ninguna de ellas.** Los registros de sesión de Claude Code
  (`~/.claude/projects/**/*.jsonl`), `git` y —a través de la CLI `gh`— los issues del repositorio de
  GitHub al que apuntan tus remotes. Nunca se modifica ninguna transcripción, ningún repositorio ni
  ningún issue.
- **El único archivo que escribe es el suyo.** `~/.config/glasshive/preferences.json` guarda los
  directorios que observas y tus preferencias de vista. Antes de escribir, glasshive comprueba que la ruta no
  esté dentro de `~/.claude`, de la raíz de las transcripciones ni de un directorio `.git` o
  `.beads` de un proyecto que pueda ver, y se niega si lo está: escribir en lo que observa está
  bloqueado por construcción, no por convención. Borra ese único archivo y no queda nada de lo que
  glasshive haya escrito.
- **El paquete publicado se puede rastrear hasta este repositorio.** Cada versión se publica desde
  GitHub Actions mediante OIDC y lleva una atestación de procedencia, así que `npm audit signatures`
  puede contrastar el paquete que instalaste con el workflow y el commit desde los que se compiló.
- **Dos cosas salen de tu máquina, y las dos tienen que ver con issues que ya puedes ver.** glasshive
  se enlaza a `127.0.0.1`, rechaza las peticiones cuya cabecera `Host` no sea local (para que una
  página hostil no pueda alcanzarlo mediante DNS rebinding) e incluye sus propias fuentes en lugar de
  descargarlas de una CDN. La vista de GitHub hace las dos únicas llamadas salientes que hay: la
  consulta de issues, que pasa por `gh` —así que glasshive nunca lee, retiene ni almacena un token
  propio—, y los avatares de los asignados, que el propio proceso de glasshive descarga de
  `avatars.githubusercontent.com` omitiendo las credenciales y mantiene solo en memoria, así que tu
  navegador nunca recibe una URL de GitHub. Nada de tus sesiones se envía a ningún sitio.
- **«Vacío» y «no se pudo leer» nunca se ven igual.** Un campo que no se ha podido leer se transporta
  como `null` con el motivo adjunto, así que una pantalla en silencio nunca es ambigua.
- **Las opciones erróneas fallan a gritos.** Una opción que no se puede interpretar termina con un
  error en lugar de recurrir en silencio a un valor por defecto.

## Opciones

```sh
npx glasshive                       # http://127.0.0.1:4483 — observar este repositorio
npx glasshive .                     # solo este repositorio
npx glasshive ~/src/foo             # o aquel, desde donde sea
npx glasshive --port 8080           # escuchar en otro sitio
npx glasshive --no-open             # no abrir el navegador
npx glasshive --status              # dónde está corriendo, y desde cuándo
npx glasshive --stop                # terminarlo, desde cualquier terminal
npx glasshive --active-threshold 120  # segundos desde la última escritura que aún cuentan como active
npx glasshive --config-dir ~/somewhere  # dónde se guarda preferences.json
```

Ejecuta `glasshive --help` para ver la lista completa.

**Nombrar un directorio es empezar a observarlo.** `glasshive .` observa este repositorio y lo abre;
un `glasshive` a secas hace lo mismo cuando estás dentro de un repositorio git, y aterriza en el
Overview cuando no lo estás. La ruta se resuelve al repositorio al que pertenece, así que un
subdirectorio o un worktree te llevan al mismo sitio.

**Observar es lo que ves, no lo que glasshive puede leer.** Todos los directorios bajo
`~/.claude/projects` se siguen encontrando por nombre, y el Overview lista los que no observas para
que los añadas con un clic. Solo lo que observas se lee entero; del resto se lee una línea de una
transcripción, lo justo para saber dónde está. Deja de observar un proyecto desde su pestaña y vuelve
a esa lista; no se borra nada.

**Un solo servidor, lo ejecutes las veces que lo ejecutes.** Volver a ejecutar `glasshive` no
arranca un segundo. Encuentra el servidor que ya está escuchando, le pasa la ruta que nombraste y
abre esa ventana —el escaneo, el índice y todo lo que `git` ya ha respondido se reutilizan, así que
la segunda ventana llega casi tan rápido como cambiar de pestaña. Solo la línea de comandos puede
nombrar un directorio así; una página abierta en tu navegador no puede. El puerto por defecto pasa
al siguiente libre solo cuando algo que no es glasshive lo está ocupando.

Como solo hay uno, nunca tienes que recordar qué terminal lo tiene:

```sh
$ glasshive --status
glasshive: http://127.0.0.1:4483 (pid 61651, up 2h 15m)

$ glasshive --stop
glasshive: stopped http://127.0.0.1:4483 (pid 61651, up 2h 15m)
```

`--status` lista todos los glasshive que encuentra y sale con código distinto de cero cuando no hay
ninguno, así que se lee como una condición en un script. `--stop` termina todos y no se queja si no
encuentra ninguno.

### Teclado

| Tecla | Qué hace |
| --- | --- |
| `⌘1` … `⌘9` | Saltar a una pestaña por su posición (la 1 es Overview) |
| `⌘⇧←` / `⌘⇧→` | Mover un lugar a la izquierda o a la derecha la pestaña en la que estás |
| `Tab` | Recorrer filas, chips, encabezados de ordenación y tiradores |
| `Esc` | Cerrar el panel |

Todo se alcanza desde el teclado, y el elemento enfocado siempre lleva un contorno. En los teclados
que no son de Apple, `Ctrl` sustituye a `⌘`.

## Desarrollo

```sh
npm install
npm run dev     # http://127.0.0.1:4483
npm run check   # formato, límites entre capas, tipos, pruebas
npm run build
```

[Bun](https://bun.com/) funciona tal cual: cambia `npm` por `bun`. Consulta
[CONTRIBUTING.md](../CONTRIBUTING.md) para la arquitectura, las puertas de calidad y cómo trabajar en
esto.

## Soporte

¿Has encontrado un error, o quieres algo que glasshive no hace?
[Abre un issue](https://github.com/hiroiku/glasshive/issues).

## Licencia

MIT — consulta [LICENSE](../LICENSE).
