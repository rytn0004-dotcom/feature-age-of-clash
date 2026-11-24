import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CIVILIZATION_LIST,
  isBuildingBuildableForCiv,
} from './civilizations';

const ageLandmarkChoices = [
  { age: 1, available: ['landmark_aachen', 'landmark_barracks'], unavailable: ['landmark_guildhall', 'landmark_citadel', 'landmark_observatory', 'landmark_arsenal'] },
  { age: 2, available: ['landmark_guildhall', 'landmark_citadel'], unavailable: ['landmark_aachen', 'landmark_barracks', 'landmark_observatory', 'landmark_arsenal'] },
  { age: 3, available: ['landmark_observatory', 'landmark_arsenal'], unavailable: ['landmark_aachen', 'landmark_barracks', 'landmark_guildhall', 'landmark_citadel'] },
] as const;

test('next-age landmark choices are buildable for every civilization', () => {
  for (const civilization of CIVILIZATION_LIST) {
    for (const stage of ageLandmarkChoices) {
      for (const landmark of stage.available) {
        assert.equal(
          isBuildingBuildableForCiv(landmark, civilization.id, stage.age),
          true,
          `${civilization.id} should be able to place ${landmark} from Age ${stage.age}`,
        );
      }

      for (const landmark of stage.unavailable) {
        assert.equal(
          isBuildingBuildableForCiv(landmark, civilization.id, stage.age),
          false,
          `${civilization.id} must not place ${landmark} from Age ${stage.age}`,
        );
      }
    }
  }
});

test('landmarks cannot be used to skip an age or advance beyond Age IV', () => {
  for (const civilization of CIVILIZATION_LIST) {
    for (const landmark of [
      'landmark_aachen',
      'landmark_barracks',
      'landmark_guildhall',
      'landmark_citadel',
      'landmark_observatory',
      'landmark_arsenal',
    ] as const) {
      assert.equal(isBuildingBuildableForCiv(landmark, civilization.id, 4), false);
    }
  }
});
