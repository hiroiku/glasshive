# glasshive

**Observa trabajar a tus agentes de IA, a través del cristal.**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![licencia](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[Lo que ves](#lo-que-ves) · [Solo lectura por diseño](#solo-lectura-por-diseño) · [Opciones](#opciones) · [Desarrollo](#desarrollo)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md)

glasshive es un panel local de solo lectura para [Claude Code](https://claude.com/claude-code). Lee
los registros de sesión que ya están en tu disco y pone cada proyecto en el que ha trabajado un
agente —sus sesiones y subagentes, lo que cada uno está haciendo ahora mismo, sus issues y sus ramas
de git activas— en una sola pantalla. Piensa en `htop` para sesiones de agentes, sin la tecla que
mata procesos: glasshive nunca escribe en `~/.claude`, ni en tus repositorios, ni en tu gestor de
issues, y no puede arrancar, detener ni dirigir a un agente.

```sh
npx glasshive
```

Sirve solo en `127.0.0.1:4483` y abre tu navegador. Sin paso de instalación, sin configuración, sin
acceso a la red: el paquete publicado tiene cero dependencias en tiempo de ejecución. Necesitas
Node.js 22.12 o posterior y al menos una sesión de Claude Code dentro de `~/.claude/projects`. Se
compila y se prueba en macOS y Linux; en Windows el recuento de agentes vivos vuelve como «no se
pudo observar», porque leerlo necesita `ps` y `/proc/<pid>/cwd` o `lsof`.

![glasshive walkthrough](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## Lo que ves

### Overview

Cada proyecto en el que ha trabajado un agente, desde donde sea que hayas arrancado glasshive. Van
primero los que esperan tu respuesta, y luego los que siguen en marcha. Filtra por nombre, estado
o intervalo de tiempo, y fija en la barra de pestañas los proyectos que te importan.

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

Las sesiones y sus subagentes como un solo árbol: status, model, effort, tokens, el issue y el
worktree en el que trabaja cada uno, la herramienta que está ejecutando ahora mismo y una línea de
tiempo de actividad que puedes desplazar y ampliar. Debajo están las estadísticas de tokens y de
concurrencia, acotadas a la misma ventana.

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Git

Las ramas y los worktrees activos dibujados sobre la rama del worktree principal, para que veas quién está
dónde. Los pares que se dirigen a los mismos archivos suben al principio de la lista. Elige una ref
para ver sus commits, sus estadísticas de diff y qué agentes han estado activos en ella.

![Git](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/git.png)

### Beads

El registro de issues de [`bd`](https://github.com/gastownhall/beads), con las aristas de
dependencia, el anidamiento padre-hijo y el flujo de abiertos/cerrados a lo largo del tiempo. Los
proyectos que no usan `bd` reciben una nota breve en lugar de una pantalla vacía.

![Beads](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/beads.png)

### Side panel

Las conversaciones, los issues y las refs se abren en un panel a la derecha. Lo que está abierto vive
en la URL, así que pegar el enlace abre lo mismo en la pantalla de otra persona. El Markdown, el
código y las llamadas a herramientas se renderizan; la transcripción original nunca se reescribe.

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

## Solo lectura por diseño

- **Lee tres cosas y no escribe en ninguna de ellas.** Los registros de sesión de Claude Code
  (`~/.claude/projects/**/*.jsonl`), el registro de beads (`<project>/.beads/issues.jsonl`) y `git`.
  Nunca se modifica ninguna transcripción, ningún registro ni ningún repositorio.
- **El único archivo que escribe es el suyo.** `~/.config/glasshive/preferences.json` guarda tus
  pestañas fijadas y tus preferencias de vista. Antes de escribir, glasshive comprueba que la ruta no
  esté dentro de `~/.claude`, de la raíz de las transcripciones ni de ningún directorio `.beads` o
  `.git` observado, y se niega si lo está: escribir en lo que observa está bloqueado por
  construcción, no por convención. Borra ese único archivo y no queda nada de lo que glasshive
  haya escrito.
- **El paquete publicado se puede rastrear hasta este repositorio.** Cada versión se publica desde
  GitHub Actions mediante OIDC y lleva una atestación de procedencia, así que `npm audit signatures`
  puede contrastar el paquete que instalaste con el workflow y el commit desde los que se compiló.
- **Nada sale de tu máquina.** Se enlaza a `127.0.0.1`, rechaza las peticiones cuya cabecera `Host`
  no sea local (para que una página hostil no pueda alcanzarlo mediante DNS rebinding), no hace
  peticiones salientes e incluye sus propias fuentes en lugar de descargarlas de una CDN.
- **«Vacío» y «no se pudo leer» nunca se ven igual.** Un campo que no se ha podido leer se transporta
  como `null` con el motivo adjunto, así que una pantalla en silencio nunca es ambigua.
- **Las opciones erróneas fallan a gritos.** Una opción que no se puede interpretar termina con un
  error en lugar de recurrir en silencio a un valor por defecto.

## Opciones

```sh
npx glasshive                       # http://127.0.0.1:4483
npx glasshive --port 8080           # escuchar en otro sitio
npx glasshive --no-open             # no abrir el navegador
npx glasshive --active-threshold 120  # segundos desde la última escritura que aún cuentan como active
npx glasshive --config-dir ~/somewhere  # dónde se guarda preferences.json
```

Ejecuta `glasshive --help` para ver la lista completa. El alcance no es una opción de arranque: se
listan todos los proyectos en los que ha trabajado un agente, y tú eliges cuáles se vuelven pestañas.

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

Relacionado: [Claude Code](https://claude.com/claude-code) ·
[beads](https://github.com/gastownhall/beads)

## Licencia

MIT — consulta [LICENSE](../LICENSE).
