import assert from 'node:assert/strict';
import test from 'node:test';
import { LeadershipRoster, type LeadershipRosterCandidate } from './leadershipRoster';

function leader(
  id: string,
  faction: string,
  moraleRecoveryPerSecond: number,
  moraleShockResistance = 0,
  suppressionResistance = 0,
): LeadershipRosterCandidate {
  return {
    id,
    faction,
    hp: 100,
    unitDef: {
      leadershipAura: {
        moraleRecoveryPerSecond,
        moraleShockResistance,
        suppressionResistance,
      },
    },
  };
}

test('leadership roster keeps the strongest commander per faction with stable ID tie-breaking', () => {
  const roster = new LeadershipRoster<LeadershipRosterCandidate>();
  const blueWeak = leader('blue-weak', 'blue', 1);
  const blueStrong = leader('blue-strong', 'blue', 3);
  const redTieZ = leader('red-z', 'red', 2);
  const redTieA = leader('red-a', 'red', 2);

  assert.deepEqual(roster.rebuild([blueWeak, redTieZ, redTieA, blueStrong]), [
    blueStrong,
    redTieA,
  ]);
});

test('leadership roster reuses its output array across rebuilds', () => {
  const roster = new LeadershipRoster<LeadershipRosterCandidate>();
  const output = roster.units;
  const firstBlue = leader('blue-1', 'blue', 2);
  const firstRed = leader('red-1', 'red', 2);
  const nextBlue = leader('blue-2', 'blue', 3);
  const nextRed = leader('red-2', 'red', 1);

  assert.equal(roster.rebuild([firstBlue, firstRed]), output);
  assert.equal(roster.rebuild([nextBlue, nextRed]), output);
  assert.deepEqual(output, [nextBlue, nextRed]);
  assert.equal(roster.cachedFactionCount, 2);
});

test('dead, garrisoned and non-commander units are excluded and stale faction entries are released', () => {
  const roster = new LeadershipRoster<LeadershipRosterCandidate>();
  const dead = leader('dead', 'blue', 4);
  dead.hp = 0;
  const sheltered = leader('sheltered', 'red', 4);
  sheltered.garrisonedInBuildingId = 'castle-1';
  const ordinary = {
    id: 'ordinary',
    faction: 'green',
    hp: 100,
    unitDef: {},
  } as LeadershipRosterCandidate;

  assert.deepEqual(roster.rebuild([dead, sheltered, ordinary]), []);
  assert.equal(roster.cachedFactionCount, 0);

  const active = leader('active', 'blue', 2);
  roster.rebuild([active]);
  assert.equal(roster.cachedFactionCount, 1);
  assert.deepEqual(roster.rebuild([]), []);
  assert.equal(roster.cachedFactionCount, 0);
});

test('clear releases cached commanders and resets the reusable roster', () => {
  const roster = new LeadershipRoster<LeadershipRosterCandidate>();
  roster.rebuild([leader('blue', 'blue', 2)]);
  roster.clear();
  assert.deepEqual(roster.units, []);
  assert.equal(roster.cachedFactionCount, 0);
  assert.deepEqual(roster.rebuild([leader('red', 'red', 1)]).map(unit => unit.faction), ['red']);
});
