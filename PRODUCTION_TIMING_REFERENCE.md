# Production, Construction & Research Timing Reference

Branch baseline: `feat/battle-stress-regression-tests`

All values are **simulation seconds**. They are the data-driven baseline, not guaranteed wall-clock time under pathing, combat, pausing, or a crowded work site.

## Timing rules

- Unit production uses `UnitStats.trainTime`. One production building works on one queue item at a time; different buildings can produce in parallel.
- Construction uses `BuildingDefinition.buildTime`. A placed building begins at 10% progress. Effective builder work follows this requested curve: builder 1 contributes `1.00`; builders 2–5 add `0.75, 0.60, 0.50, 0.50`; every builder from number 6 onward adds `0.50`. With (N) builders already in working range:

  `actual work time = 0.9 × buildTime ÷ (civilization build-speed multiplier × summed builder contribution)`

  Walking to the site is additional. The same diminishing-return curve applies to wall repairs. The selected-building panel shows the live in-range builder count, effective cooperative multiplier and remaining-time estimate.
- Research uses `TechDefinition.researchTime`. An allied, completed Royal Foundry within 16 world units of the research building grants 1.25× research speed (80% of listed time). The foundry does not accelerate research performed inside itself.
- The Royal Foundry aura also grants 1.25× production speed to unit queues in nearby allied production buildings (80% of listed unit time).
- The White Tower landmark grants 1.35× melee-infantry production speed (about 74.1% of listed time). This is now applied by the training queue.
- The Age II Blitz Doctrine multiplies production duration by 0.75 for melee, ranged and cavalry units. It does not apply to workers, siege or special units.
- Anime civilization's mod has 1.05× build speed. This now applies to construction and wall repair; the resulting work duration is 1/1.05 (about 95.2%) of neutral time. Medieval and fantasy are 1.0×.
- The listed times are base times. Applicable bonuses stack multiplicatively.

## Building construction times

The third column is the one-villager work time from initial placement to completion in a neutral-speed civilization (90% of the stored `buildTime`, because the placed foundation starts at 10%). Anime's time is this column divided by 1.05.

| Building | Stored buildTime | One villager, neutral |
|---|---:|---:|
| Town Center | 35 s | 31.5 s |
| House | 9 s | 8.1 s |
| Barracks | 20 s | 18 s |
| Archery Range | 20 s | 18 s |
| Stable | 22 s | 19.8 s |
| Siege Workshop | 28 s | 25.2 s |
| Dock | 16 s | 14.4 s |
| Farm | 10 s | 9 s |
| Granary | 14 s | 12.6 s |
| Lumber Camp | 15 s | 13.5 s |
| Mining Camp | 15 s | 13.5 s |
| Wall segment | 8 s | 7.2 s per segment |
| Gate | 22 s | 19.8 s |
| Watch Tower | 20 s | 18 s |
| Castle | 45 s | 40.5 s |
| Royal Foundry (Medieval unique) | 22 s | 19.8 s |
| Spirit Shrine (Anime unique) | 20 s | 18 s |
| Mana Well (Fantasy unique) | 21 s | 18.9 s |

### Age-up landmarks

Age advancement is **not a separate research timer**. The age changes when the chosen landmark finishes construction.

| Age unlocked | Landmark choices | Stored buildTime | One villager, neutral |
|---|---|---:|---:|
| Age II | Aachen Chapel / White Tower Armoury | 222.22 s (internal) | **200 s** |
| Age III | Guild Hall / Citadel Keep | 261.11 s (internal) | **235 s** |
| Age IV | Imperial Observatory / Crimson Arsenal | 333.33 s (internal) | **300 s** |

These are the exact one-villager completion targets in a neutral-speed civilization. Internally, landmark `buildTime` is scaled by `1 / 0.9` because every placed foundation starts at 10% progress; the HUD's remaining-time estimate still reports the requested 200 / 235 / 300 seconds. Anime's 1.05× construction bonus reduces the actual times to approximately 190.5 / 223.8 / 285.7 seconds.

| Builders | Contribution multiplier | Age I → II | Age II → III | Age III → IV |
|---:|---:|---:|---:|---:|
| 1 | ×1.00 | 200 s | 235 s | 300 s |
| 2 | ×1.75 | 114.3 s | 134.3 s | 171.4 s |
| 3 | ×2.35 | 85.1 s | 100 s | 127.7 s |
| 4 | ×2.85 | 70.2 s | 82.5 s | 105.3 s |
| 5 | ×3.35 | 59.7 s | 70.1 s | 89.6 s |
| 6 | ×3.85 | 51.9 s | 61 s | 77.9 s |

With the requested curve, four builders provide 2.85 worker-equivalents and five provide 3.35. A sixth and each later builder adds 0.50 more worker-equivalents, so cooperative construction remains faster while the first worker is the most efficient.


## Live remaining-time estimates

The selected-building HUD now estimates:

- Construction / wall repair remaining time from builders actually inside the work radius, civilization construction speed and the shared diminishing-return curve. If no builder is working in range, it reports that it is waiting for workers rather than inventing a countdown.
- Research remaining time from progress, research duration and nearby Royal Foundry aura.
- Current unit and total queue remaining time from each queued unit's training duration, category-scoped technology, White Tower melee bonus and nearby Royal Foundry aura.

These are simulation-time estimates. They do not include future population blocking, interruptions, unit deaths, builder travel, or a future change in the number of active builders. The HUD refreshes selected-building estimates twice per second.

## Unit production times

All are base `trainTime` values, before the Forge, White Tower or Blitz bonuses. The production building listed is the normal civilization roster location.

| Civilization / roster | Unit | Production building / method | Base time |
|---|---|---|---:|
| Shared | Scout Rider | Stable (all civilizations) | 10 s |
| Shared naval | Fishing Boat | Dock | 10 s |
| Shared naval | Transport Boat | Dock | 18 s |
| Shared naval | War Galley | Dock | 22 s |
| Medieval | Villager | Town Center | 8 s |
| Medieval | Swordsman | Barracks | 12 s |
| Medieval | Longbowman | Archery Range | 11 s |
| Medieval | Royal Knight | Stable | 20 s |
| Medieval | Catapult | Siege Workshop | 24 s |
| Medieval | Bombard Cannon | Siege Workshop | 26 s |
| Medieval | Greek-fire Siphon | Siege Workshop | 26 s |
| Anime | Spirit Gatherer | Town Center | 7 s |
| Anime | Soul Reaper | Barracks | 14 s |
| Anime | Leaf Shinobi | Archery Range | 10 s |
| Anime | Ki Striker | Archery Range | 16 s |
| Fantasy | Goblin Sapper | Town Center | 6 s |
| Fantasy | Grove Warden | Barracks | 13 s |
| Fantasy | Archmage | Archery Range | 15 s |
| Fantasy | Holy Paladin | Stable | 18 s |
| Fantasy | Ancient Treant | Siege Workshop | 22 s |

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

1. **Construction stacking is linear.** Four builders are four times as fast as one. This makes Age-up landmarks finish in roughly 9–17 seconds with four builders once the resource threshold is met. Consider a diminishing-return curve or a soft cap after timing has been benchmarked in real matches.
2. **Age-up time is not just the landmark timer.** The practical path includes resource accumulation, builders walking to the site, and the 16-second Field Engineering research before a field ram can be assembled.
3. **A stored unit train time is not always the in-game method.** Battering Ram is the clearest example: the playable path is the 4-infantry assembly project, not a normal queue item.
4. **Production modifiers must match their descriptions.** This branch now applies Anime's configured 1.05× build speed, White Tower's 1.35× melee training speed, and the Blitz Doctrine only to its declared melee/ranged/cavalry categories.
5. **Research building access matters.** A technology's own age requirement does not override the age requirement of its production/research building.

Source of truth: `src/game/mods.ts`, `src/game/civilizations.ts`, `src/game/engine.ts`, and `src/types/game.ts`.
