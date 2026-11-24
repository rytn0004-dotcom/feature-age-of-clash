export interface LeadershipRosterCandidate {
  id: string;
  faction: string;
  hp: number;
  garrisonedInBuildingId?: string | null;
  unitDef: {
    leadershipAura?: {
      moraleRecoveryPerSecond: number;
      moraleShockResistance: number;
      suppressionResistance: number;
    };
  };
}

interface LeadershipRosterEntry {
  index: number;
  score: number;
  generation: number;
}

/**
 * Keeps the strongest active commander per faction in a reusable output array.
 * Map entries are retained and updated in place between simulation frames.
 */
export class LeadershipRoster<T extends LeadershipRosterCandidate> {
  private readonly entries = new Map<string, LeadershipRosterEntry>();
  private generation = 0;
  public readonly units: T[] = [];

  public rebuild(candidates: readonly T[]): T[] {
    const generation = this.generation + 1;
    this.generation = generation;
    this.units.length = 0;

    for (let i = 0; i < candidates.length; i++) {
      const unit = candidates[i];
      const aura = unit.unitDef.leadershipAura;
      if (unit.hp <= 0 || unit.garrisonedInBuildingId || !aura) continue;

      const score =
        aura.moraleRecoveryPerSecond +
        aura.moraleShockResistance * 4 +
        aura.suppressionResistance * 3;
      let entry = this.entries.get(unit.faction);

      if (!entry) {
        entry = { index: this.units.length, score, generation };
        this.entries.set(unit.faction, entry);
        this.units.push(unit);
        continue;
      }

      if (entry.generation !== generation) {
        entry.index = this.units.length;
        entry.score = score;
        entry.generation = generation;
        this.units.push(unit);
        continue;
      }

      const current = this.units[entry.index];
      if (
        !current ||
        score > entry.score ||
        (score === entry.score && unit.id.localeCompare(current.id) < 0)
      ) {
        entry.score = score;
        this.units[entry.index] = unit;
      }
    }

    for (const [faction, entry] of this.entries) {
      if (entry.generation !== generation) this.entries.delete(faction);
    }

    return this.units;
  }

  public clear(): void {
    this.entries.clear();
    this.units.length = 0;
    this.generation = 0;
  }

  public get cachedFactionCount(): number {
    return this.entries.size;
  }
}
