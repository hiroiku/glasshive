# El arnés incluido

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Español | [Français](README.fr.md)

El [README](../../docs/README.es.md) describe el mecanismo — un único corpus, desplegado por `agents-setup` en `~/.agents` y en los `.agents/` de cada proyecto. Este documento describe lo que ese corpus entrega en `payload/`: un arnés completo y funcional, incluido como la muestra de la que partes y que personalizas.

## Escrito para modelos que juzgan

El arnés está construido para la generación actual de modelos, que siguen el juicio mejor que las reglas. Cada instrucción es un coste por partida doble: ocupa la atención finita de la sesión y ata al modelo donde su propio juicio podría ser mejor. Así que el corpus registra solo lo que un modelo capaz no puede derivar:

- **Opiniones** — convenciones que ninguna capacidad puede adivinar: cómo se titulan los commits, qué no va nunca en un mensaje de commit
- **Anclas** — el canon externo que una pieza de trabajo debe satisfacer: OWASP Top 10, WCAG 2.2 AA
- **Fronteras** — quién puede hacer qué: un revisor que no puede editar

Todo lo demás — cómo buscar, hasta dónde profundizar, qué aspecto tiene un hallazgo — se deja al modelo. Cuando un modo de fallo se observa de verdad, se añade la instrucción más pequeña que lo previene; nada se añade por adelantado. Las guías de calibración se nombran en el skill [dotagents-prompting](../skills/dotagents-prompting/SKILL.md) y se leen antes de editar cualquier prompt de este corpus.

## Tres formas de entrega

- **Ubicua** ([AGENTS.md](../AGENTS.md)) — se inyecta en cada sesión, gravando la atención de cada sesión, así que contiene una sola frase: _cuando termina una implementación o una corrección, delega la verificación en los agentes de revisión aplicables antes de informar de la finalización._
- **Momentánea** ([skills/](../skills/)) — se leen solo cuando llega su momento: [dotagents-git](../skills/dotagents-git/SKILL.md) en el momento del commit, [dotagents-prompting](../skills/dotagents-prompting/SKILL.md) al editar prompts. El detalle aquí no le cuesta nada a ningún otro momento.
- **Roles** ([agents/](../agents/)) — subagentes con un contexto propio y un conjunto de herramientas restringido. Lo que un rol no debe hacer se aplica mediante las herramientas que no se le dan, no mediante una frase que deba recordar.

## Revisión — un contexto limpio, a la caza de lo que falta

El modo de fallo peculiar de los agentes de IA es "¡hecho!" cuando no está hecho — no mentira sino omisión: un contexto que solo contiene lo que escribió no puede ver lo que no escribió. Así que la verificación va a agentes de revisión cuyo contexto está limpio. Reciben los requisitos, cómo localizar el objetivo y cómo ejecutarlo — nunca el autoinforme del implementador.

[dotagents-review](../agents/dotagents-review.md) trabaja en dos pasadas, en orden:

1. **Existencia** — partir de cada requisito y encontrar la implementación que lo satisface. Una omisión es invisible en un diff, así que el escaneo va de los requisitos hacia el código, no del diff hacia afuera.
2. **Corrección** — examinar si lo que se encontró está bien hecho.

Los revisores leen y ejecutan; no editan. `Read, Glob, Grep, Bash` es todo el conjunto de herramientas.

## Anclas de requisitos, no listas de verificación

[dotagents-security](../agents/dotagents-security.md) verifica contra el [OWASP Top 10](https://owasp.org/Top10/); [dotagents-accessibility](../agents/dotagents-accessibility.md) contra el nivel de conformidad AA de [WCAG 2.2](https://www.w3.org/TR/WCAG22/). Cada uno nombra su canon y se detiene ahí: ninguna lista de verificación copiada (una copia se pudre a medida que el canon avanza), ningún criterio propio encima (una enumeración ata el juicio a la imaginación de quien enumera). Qué categoría aplica, y cómo, se juzga contra el código que se tiene delante.

## Git — las convenciones que un modelo no puede adivinar

[dotagents-git](../skills/dotagents-git/SKILL.md) contiene toda la opinión en unas pocas líneas: los títulos de commit dicen qué cambió para el negocio, nunca un nombre de archivo ni un identificador interno; ninguna atribución a IA en los mensajes de commit ni en los PR; squash es el valor por defecto para la integración; seguir el upstream con rebase, no con merge.
