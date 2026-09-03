@AGENTS.md

## Visual rules

- Always read @DESIGN.md before generating any UI in this project.
- Do not invent colours, fonts, radii, or spacing outside DESIGN.md. If a new component needs a token that does not exist yet, add it to DESIGN.md first, in the same format, with a computed WCAG contrast ratio if it carries text.
- Use semantic tokens (`{colors.accent}`, `{colors.reliable}`, `{rounded.sm}`, etc.), never raw hex values, in component code.
- Radius is `{rounded.none}` (0px) on every panel, card, chip, and table; `{rounded.control}` (2px) on buttons and inputs only; `{rounded.full}` only on the line bullet.
- The only chromatic UI accent is MTA blue `{colors.accent}` (#0039A6). `{colors.line-bdfm}` (#FF6319) paints the B/D/F/M bullet only and must never be used as an accent. Status tiers (reliable/watch/unreliable/out) and the ten authentic MTA line-bullet hexes are the sole other colors in the system.

