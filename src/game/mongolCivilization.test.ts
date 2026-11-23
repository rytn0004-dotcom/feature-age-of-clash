import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BUILDINGS, INITIAL_MODS, MONGOL_UNITS } from './mods';
import {
  CIVILIZATION_LIST,
  CIVILIZATION_TECHS,
  getAvailableTechsForBuilding,
  getBuildableTypesForCiv,
  getCivilizationConfig,
  getTrainableUnitsForBuilding,
  isTechLockedByExclusion,
} from './civilizations';
import { getLandmarkName } from './landmarkIdentity';

test('Mongol civilization: is the fourth selectable civilization with its own progression identity', () => {
  assert.equal(CIVILIZATION_LIST.length, 4);
  const mongol = getCivilizationConfig('mongol');
  assert.equal(mongol.id, 'mongol');
  assert.equal(mongol.workerUnitId, 'mongol_herder');
  assert.equal(mongol.starterMeleeUnitId, 'mongol_foot_guard');
  assert.equal(mongol.uniqueBuildingType, 'ovoo_relay');
  assert.ok((mongol.passiveBonuses.moveSpeedMultiplier ?? 1) > 1);
});

test('Mongol civilization: includes six units with correct age gates and model types', () => {
  const ids = MONGOL_UNITS.map((unit) => unit.id);
  assert.deepEqual(ids, [
    'mongol_herder',
    'mongol_foot_guard',
    'mongol_lancer',
    'mongol_mangudai',
    'mongol_keshik',
    'mongol_shaman',
  ]);
  assert.equal(MONGOL_UNITS.find((unit) => unit.id === 'mongol_foot_guard')?.requiredAge, 1);
  for (const id of ['mongol_lancer', 'mongol_mangudai', 'mongol_keshik', 'mongol_shaman']) {
    assert.equal(MONGOL_UNITS.find((unit) => unit.id === id)?.requiredAge, 2);
  }
  assert.equal(MONGOL_UNITS.find((unit) => unit.id === 'mongol_mangudai')?.visual.modelType, 'horse_archer');
  assert.equal(MONGOL_UNITS.find((unit) => unit.id === 'mongol_keshik')?.visual.modelType, 'keshik');
  assert.equal(MONGOL_UNITS.find((unit) => unit.id === 'mongol_shaman')?.visual.modelType, 'shaman');
});

test('Mongol civilization: training and build menus include current main buildings without losing age gates', () => {
  const mongol = getCivilizationConfig('mongol');
  assert.ok(getBuildableTypesForCiv('mongol', 1).includes('ovoo_relay'));
  assert.ok(getBuildableTypesForCiv('mongol', 2).includes('stable'));
  assert.ok(getBuildableTypesForCiv('mongol', 3).includes('siege_workshop'));
  assert.deepEqual(getTrainableUnitsForBuilding('town_center', 'mongol'), ['mongol_herder']);
  assert.deepEqual(getTrainableUnitsForBuilding('barracks', 'mongol'), ['mongol_foot_guard']);
  assert.deepEqual(getTrainableUnitsForBuilding('stable', 'mongol'), ['mongol_lancer', 'mongol_keshik', 'scout_rider']);
  assert.equal(mongol.buildableBuildings.includes('siege_workshop'), true);
});

test('Mongol civilization: Ovoo definition is exclusive and available as a military support building', () => {
  const ovoo = DEFAULT_BUILDINGS.ovoo_relay;
  assert.equal(ovoo.id, 'ovoo_relay');
  assert.equal(ovoo.civExclusive, 'mongol');
  assert.equal(ovoo.requiredAge, 1);
  assert.ok((ovoo.attack ?? 0) > 0);
  assert.ok((ovoo.range ?? 0) > 0);
  assert.equal(getBuildableTypesForCiv('medieval', 4).includes('ovoo_relay'), false);
});

test('Mongol civilization: has eight unique technologies and two mutually-exclusive doctrines', () => {
  const techs = CIVILIZATION_TECHS.filter((tech) => tech.civId === 'mongol');
  assert.equal(techs.length, 8);
  assert.deepEqual(techs.map((tech) => tech.id), [
    'mon_nomadic_wheels',
    'mon_composite_bow',
    'mon_yam_post',
    'mon_doctrine_horde',
    'mon_doctrine_khanate',
    'mon_keshik_lamellar',
    'mon_sky_blessing',
    'mon_sulde_banner',
  ]);
  const doctrines = techs.filter((tech) => tech.exclusiveGroup === 'doctrine_mon_steppe');
  assert.equal(doctrines.length, 2);
  assert.equal(isTechLockedByExclusion(doctrines[1], [doctrines[0].id])?.id, doctrines[0].id);
  assert.equal(getAvailableTechsForBuilding('ovoo_relay', 'mongol', [], 2).some((tech) => tech.id === 'mon_yam_post'), true);
});

test('Mongol civilization: enabled in the startup mod registry', () => {
  const mongolMod = INITIAL_MODS.find((mod) => mod.id === 'mod_mongol');
  assert.ok(mongolMod);
  assert.equal(mongolMod.enabled, true);
  assert.equal(mongolMod.unitDefinitions?.length, 6);
});

test('Mongol civilization: all six age landmarks have dedicated names', () => {
  assert.equal(getLandmarkName('mongol', 'landmark_aachen'), '長生天敖包聖壇');
  assert.equal(getLandmarkName('mongol', 'landmark_barracks'), '怯薛萬騎大營');
  assert.equal(getLandmarkName('mongol', 'landmark_guildhall'), '絲路萬帳貿易大市');
  assert.equal(getLandmarkName('mongol', 'landmark_citadel'), '大汗鐵騎牙帳城');
  assert.equal(getLandmarkName('mongol', 'landmark_observatory'), '蒼狼天穹觀星台');
  assert.equal(getLandmarkName('mongol', 'landmark_arsenal'), '汗國重炮軍械營');
});
