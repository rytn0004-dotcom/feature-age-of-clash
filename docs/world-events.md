# World Events

Age of Clash now runs a shared world-event schedule during every match. The event order is shuffled from the same match seed used by the map generator, so replays with the same seed produce the same event sequence.

Each event lasts 90 seconds and is followed by a 45-second intermission. The HUD previews the upcoming event during the break. Every faction is affected equally.

| Event | Effect |
| --- | --- |
| 🌊 Monsoon Current | Naval movement +18%; fishing-boat harvest rate +25% |
| 🌾 Harvest Bloom | Food gathering +18%; farm passive output +18% |
| ⛏️ Earth Vein Pulse | Gold and stone gathering +22% |
| 🥁 Ancient War Drums | Attack rate +10%; unit training speed +12% |

Bonuses are intentionally moderate and temporary. They stack multiplicatively with existing unit abilities, civilization bonuses and building bonuses. Research speed is not affected by War Drums, and land gatherers do not receive the fishing-boat bonus.

The system is deterministic, simulation-time based, and does not depend on wall-clock time. Pausing the match pauses the event timer as well.
