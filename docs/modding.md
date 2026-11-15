# Mod pack safety and live-match behavior

The mod editor, JSON importer and browser save restore use one shared runtime validator.

## Accepted limits

- Mod packs: 1–50 per configuration; at most 300 units and 300 AI rules per pack, and 200 technologies.
- Unit HP: 1–50,000; attack/building attack: 0–5,000; defense: 0–500; range: 0–100; move speed: 0–30; attack rate: 0.05–20.
- Unit training time: 0.1–3,600 seconds; gather rate: 0–1,000; carry capacity: 0–10,000.
- Special ability: cooldown 1–600 seconds and potency 0–500.
- Balance and technology multipliers: 0.1x–5x. Additive technology effects and building overrides are bounded separately.
- Resource costs: 0–1,000,000 per resource. IDs use letters, numbers, underscores and hyphens.

Invalid JSON is rejected before it can replace the active configuration. The same checks run when localStorage data is restored; invalid saved configurations are ignored and built-in packs remain available.

## Applying or disabling packs in a live match

When an applied configuration removes or disables a pack, already-spawned units that no longer resolve become built-in units of the same broad role (special units fall back to melee). Their current HP percentage is preserved and mod-only abilities/buffs are cleared. If the fallback changes the unit role, incompatible orders are reset.

Queued units and in-progress custom technologies that no longer exist are cancelled and their progress is reset. Previously spent resource costs are not refunded because the current match model does not retain the original queued definition/cost. Re-enable the pack before applying changes to keep pending custom content in the queue.

This prevents hidden ability leftovers, permanently stalled training queues and stalled research after mod removal.
