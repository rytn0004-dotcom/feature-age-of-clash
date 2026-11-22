# Production, Construction & Research Timing Reference

Branch baseline: `feat/battle-stress-regression-tests`

All values are **simulation seconds**. They are the data-driven baseline, not guaranteed wall-clock time under pathing, combat, pausing, or a crowded work site.

## Timing rules

- Unit production uses `UnitStats.trainTime`. All unit queues use one shared duration formula: `actual time = base trainTime × 1.12 ÷ capped combined speed`. All technology, landmark and Royal Foundry production bonuses stack multiplicatively, then the combined speed is capped at **1.12×**. A queue processes one unit at a time; different production buildings can work in parallel.
- All three civilization worker units use a 22-second base `trainTime`; without an accelerator, the actual queue duration is **24.64 seconds**. With the maximum 1.12× combined accelerator, the duration bottoms out at 22 seconds.
- Construction uses `BuildingDefinition.buildTime`. A placed building begins at 10% progress. All buildings and wall repairs use the same 1.12 time scale. Builder cooperation remains a separate multiplier: builder 1 contributes `1.00`; builders 2–5 add `0.75, 0.60, 0.50, 0.50`; every builder from number 6 onward adds `0.50`. With (N) builders already in working range:

  `actual work time = 0.9 × buildTime × 1.12 ÷ (capped civilization build speed × summed builder contribution)`

  Civilization/build-speed bonuses are capped at 1.12×; cooperative builder contribution is not subject to that cap. Walking to the site is additional. The selected-building panel shows the live in-range builder count, cooperative multiplier and remaining-time estimate.
- Research uses `TechDefinition.researchTime` and does not receive the extra 1.12 time scale. Its speed bonuses are nevertheless capped at 1.12×. An allied, completed Royal Foundry within 16 world units of a research building therefore reduces research time to at least 89.3% of its listed time; the foundry does not accelerate research performed inside itself.
- The Royal Foundry aura nominally grants 1.25× production and research speed; its effective contribution is limited by the shared 1.12× cap.
- The White Tower nominally grants 1.35× melee-infantry training speed, and the Age II Blitz Doctrine nominally reduces eligible production duration by 25%. Both are included in the same 1.12× combined cap; neither can push actual production above that ceiling. Blitz still excludes workers, siege and special units.
- Anime civilization's configured 1.05× build speed remains active and is included in the 1.12× construction cap. Medieval and Fantasy are 1.0×.
- Hovering a unit, building or technology production option in the HUD displays its current estimated output / build / research time, including the bonuses currently applicable to that location.

## Building construction times

The third column is the actual one-villager work time from initial placement to completion in a neutral-speed civilization: `0.9 × stored buildTime × 1.12`. Anime's time is this column divided by 1.05 (subject to the same 1.12× speed ceiling).

| Building | Stored buildTime | One villager, neutral |
|---|---:|---:|
| Town Center | 35 s | 35.28 s |
| House | 9 s | 9.07 s |
| Barracks | 20 s | 20.16 s |
| Archery Range | 20 s | 20.16 s |
| Stable | 22 s | 22.18 s |
| Siege Workshop | 28 s | 28.22 s |
| Dock | 16 s | 16.13 s |
| Farm | 10 s | 10.08 s |
| Granary | 14 s | 14.11 s |
| Lumber Camp | 15 s | 15.12 s |
| Mining Camp | 15 s | 15.12 s |
| Wall segment | 8 s | 8.06 s per segment |
| Gate | 22 s | 22.18 s |
| Watch Tower | 20 s | 20.16 s |
| Castle | 45 s | 45.36 s |
| Royal Foundry (Medieval unique) | 22 s | 22.18 s |
| Spirit Shrine (Anime unique) | 20 s | 20.16 s |
| Mana Well (Fantasy unique) | 21 s | 21.17 s |

### Age-up landmarks

Age advancement is **not a separate research timer**. The age changes when the chosen landmark finishes construction.

| Age unlocked | Landmark choices | Stored buildTime | One villager, neutral |
|---|---|---:|---:|
| Age II | Aachen Chapel / White Tower Armoury | 222.22 s (internal) | **224 s** |
| Age III | Guild Hall / Citadel Keep | 261.11 s (internal) | **263.2 s** |
| Age IV | Imperial Observatory / Crimson Arsenal | 333.33 s (internal) | **336 s** |

These one-villager neutral times include the global 1.12 production-time scale. Internally, landmark `buildTime` is scaled by `1 / 0.9` because every placed foundation starts at 10% progress. Anime's 1.05× construction bonus reduces the actual times to approximately 213.3 / 250.7 / 320 seconds.

| Builders | Contribution multiplier | Age I → II | Age II → III | Age III → IV |
|---:|---:|---:|---:|---:|
| 1 | ×1.00 | 224 s | 263.2 s | 336 s |
| 2 | ×1.75 | 128 s | 150.4 s | 192 s |
| 3 | ×2.35 | 95.3 s | 112 s | 143 s |
| 4 | ×2.85 | 78.6 s | 92.4 s | 117.9 s |
| 5 | ×3.35 | 66.9 s | 78.6 s | 100.3 s |
| 6 | ×3.85 | 58.2 s | 68.4 s | 87.3 s |

With the requested curve, four builders provide 2.85 worker-equivalents and five provide 3.35. A sixth and each later builder adds 0.50 more worker-equivalents, so cooperative construction remains faster while the first worker is the most efficient.


## Live remaining-time estimates

The selected-building HUD now estimates:

- Construction / wall repair remaining time from builders actually inside the work radius, civilization construction speed and the shared diminishing-return curve. If no builder is working in range, it reports that it is waiting for workers rather than inventing a countdown.
- Research remaining time from progress, research duration and the capped Royal Foundry aura.
- Current unit and total queue remaining time from each queued unit's scaled training duration, category-scoped technology, White Tower melee bonus and capped Royal Foundry aura.
- Build-menu, training and research option hover text uses these same effective timers, rather than showing only the raw data-field value.

These are simulation-time estimates. They do not include future population blocking, interruptions, unit deaths, builder travel, or a future change in the number of active builders. The HUD refreshes selected-building estimates twice per second.

## Unit production times

The second time column is the real unboosted queue duration: `base trainTime × 1.12`. Live tooltips may show a shorter duration when current accelerators apply, but their combined speed cannot exceed 1.12×. The production building listed is the normal civilization roster location.

| Civilization / roster | Unit | Production building / method | Base trainTime | Neutral output |
|---|---|---|---:|---:|
| Shared | Scout Rider | Stable (all civilizations) | 10 s | 11.2 s |
| Shared naval | Fishing Boat | Dock | 10 s | 11.2 s |
| Shared naval | Transport Boat | Dock | 18 s | 20.16 s |
| Shared naval | War Galley | Dock | 22 s | 24.64 s |
| Medieval | Villager | Town Center | 22 s | **24.64 s** |
| Medieval | Swordsman | Barracks | 12 s | 13.44 s |
| Medieval | Longbowman | Archery Range | 11 s | 12.32 s |
| Medieval | Royal Knight | Stable | 20 s | 22.4 s |
| Medieval | Catapult | Siege Workshop | 24 s | 26.88 s |
| Medieval | Bombard Cannon | Siege Workshop | 26 s | 29.12 s |
| Medieval | Greek-fire Siphon | Siege Workshop | 26 s | 29.12 s |
| Anime | Spirit Gatherer | Town Center | 22 s | **24.64 s** |
| Anime | Soul Reaper | Barracks | 14 s | 15.68 s |
| Anime | Leaf Shinobi | Archery Range | 10 s | 11.2 s |
| Anime | Ki Striker | Archery Range | 16 s | 17.92 s |
| Fantasy | Goblin Sapper | Town Center | 22 s | **24.64 s** |
| Fantasy | Grove Warden | Barracks | 13 s | 14.56 s |
| Fantasy | Archmage | Archery Range | 15 s | 16.8 s |
| Fantasy | Holy Paladin | Stable | 18 s | 20.16 s |
| Fantasy | Ancient Treant | Siege Workshop | 22 s | 24.64 s |

### Special case: Battering Ram

The unit definition stores `trainTime: 18` seconds, but the normal `trainUnit` queue rejects direct Battering Ram production. The playable route is field assembly:

- Age II and the shared Field Engineering technology are required.
- Cost: 140 wood and 60 gold.
- Four melee infantry are selected; the assembly advances at 18 s when all four are in position.
- If only three builders are in the ready radius, it takes 24 s. If fewer than three remain, the project is cancelled.
- Unit travel and gathering the technology/cost are additional.

Thus the data-field value and the actual production path happen to share an 18-second reference, but the unit is not normally queued like a Catapult.

## Technology research times

The age column below is the technology's own `requiredAge` (default I). A higher-age research building can impose a later practical unlock even when the technology itself lists Age I.

### Medieval technologies

| Age | Technology | Research building | Time |
|---|---|---|---:|
| I | Royal Mining Charter | Town Center | 10 s |
| I | Forged Steel Blades | Royal Foundry | 12 s |
| I | Royal Plate Tempering | Royal Foundry | 14 s |
| I | Yew Longbow Heavy Draw | Archery Range | 11 s |
| II | Iron Bastion Doctrine | Royal Foundry | 12 s |
| II | Templar Expedition Doctrine | Royal Foundry | 12 s |
| III | Naphtha Pot Formula | Archery Range | 11 s |
| III | Templar Heavy Cavalry Charge | Castle | 12 s |

### Anime technologies

| Age | Technology | Research building | Time |
|---|---|---|---:|
| I | Shikigami Harvest Scroll | Town Center | 9 s |
| I | Chakra Meridian Flow | Spirit Shrine | 11 s |
| I | Lightning Flash Step | Spirit Shrine | 11 s |
| I | Ki Awakening | Barracks | 14 s |
| II | Shadow Division Ambush Doctrine | Spirit Shrine | 11 s |
| II | Hidden Leaf Barrier Doctrine | Spirit Shrine | 11 s |
| II | Shadow Clone Kunai Volley | Archery Range | 10 s |
| III | Susanoo Spirit Armour | Castle | 12 s |

### Fantasy technologies

| Age | Technology | Research building | Time |
|---|---|---|---:|
| I | Goblin Alchemy | Town Center | 9 s |
| I | Arcane Resonance | Mana Well | 12 s |
| I | Elder Bark Hardening | Mana Well | 13 s |
| I | Sacred Bloom | Barracks | 11 s |
| II | Overgrowth Regeneration Doctrine | Mana Well | 11 s |
| II | Cataclysmic Flame Doctrine | Mana Well | 11 s |
| II | Mithril Arcane Focusing Lens | Archery Range | 10 s |
| III | Ancient Root Breach Formation | Castle | 12 s |

### Shared technologies

| Age | Technology | Research building | Time |
|---|---|---|---:|
| I | Wheelbarrow | Town Center | 10 s |
| I | Double-Bit Axe | Lumber Camp | 9 s |
| I | Deep-Vein Prospecting Picks | Mining Camp | 9 s |
| I | Crop Rotation | Granary | 9 s |
| I | Ocean Harpoon Nets | Dock | 9 s |
| II | Precision Sawmill Gear | Lumber Camp | 11 s |
| II | Preserved Rations | Granary | 11 s |
| II | Reinforced Keel | Dock | 11 s |
| II | Pavise Shield Formation | Barracks | 10 s |
| II | Pike Formation | Barracks | 10 s |
| II | Blitz Recruitment Doctrine | Barracks | 10 s |
| II | Elite Guard Doctrine | Barracks | 12 s |
| II | Bodkin-Point Arrows | Archery Range | 11 s |
| II | Masonry | Town Center | 12 s |
| II | Arrow Slits | Watch Tower | 11 s |
| II | Field Engineering | Barracks | 16 s |
| III | Blast-Furnace Mining | Mining Camp | 12 s |
| III | Fire Arrows | Archery Range | 12 s |
| III | Flanking Spurs | Castle | 12 s |
| III | Murder Holes | Watch Tower | 13 s |
| III | Siege Engineers | Siege Workshop | 13 s |
| IV | Imperial Fortification | Castle | 16 s |

Prerequisites: Precision Sawmill Gear requires Double-Bit Axe; Preserved Rations requires Crop Rotation; Blast-Furnace Mining requires Prospecting Picks. Blitz and Elite Guard doctrines are mutually exclusive. Medieval, Anime and Fantasy each also have their own mutually exclusive Age II doctrine pair.

## Implementation findings and balance watchlist

1. **Construction has diminishing returns.** Four builders contribute 2.85 worker-equivalents rather than 4.0; the separate 1.12× production-time scale slows the neutral one-builder baseline without removing the reward for cooperative work.
2. **Age-up time is not just the landmark timer.** The practical path includes resource accumulation, builders walking to the site, and the 16-second Field Engineering research before a field ram can be assembled.
3. **A stored unit train time is not always the in-game method.** Battering Ram is the clearest example: the playable path is the 4-infantry assembly project, not a normal queue item.
4. **Production modifiers share a hard ceiling.** Unit training and building construction scale by 1.12, while all stacked speed bonuses are capped at 1.12×. Worker base training is standardized at 22 seconds across civilizations; hover text and live queue ETAs use the same effective-duration functions.
5. **Research building access matters.** A technology's own age requirement does not override the age requirement of its production/research building.

Source of truth: `src/game/mods.ts`, `src/game/civilizations.ts`, `src/game/engine.ts`, and `src/types/game.ts`.
