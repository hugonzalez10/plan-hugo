# skills/ — respaldo durable de skills volátiles

La skill `food-tracker` se carga desde el plugin **gestionado** `anthropic-skills`
de Claude Desktop. Su `SKILL.md` vive en
`~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/<uuid>/<uuid>/skills/food-tracker/SKILL.md`
y **un sync de Claude Desktop puede sobrescribirlo**, revirtiendo cualquier parche.

`skills/food-tracker/SKILL.md` es una **copia de respaldo** del archivo parcheado
(flujo de escritura por POST directo al Apps Script, ver `apps-script/bridge-writer.gs`).
NO es la fuente que la skill carga en vivo: es el original a reaplicar si un sync
pisa el del plugin.

## Reaplicar tras un sync que lo revierta

```sh
cp skills/food-tracker/SKILL.md \
  ~/Library/Application\ Support/Claude/local-agent-mode-sessions/skills-plugin/*/*/skills/food-tracker/SKILL.md
```

Blindaje real e independiente de la skill: el Apps Script (`doPost` + auto-heal).
Aunque el SKILL.md se revierta, el servidor sigue aceptando el POST directo.
