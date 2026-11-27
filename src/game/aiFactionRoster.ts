export interface AiRosterUnitLike {
  hp: number;
  unitDefId: string;
  unitDef: {
    category: string;
    isNaval?: boolean;
  };
  garrisonedInBuildingId?: string | null;
}

export interface AiRosterBuildingLike {
  hp: number;
  buildingType: string;
  isConstructed?: boolean;
}

export interface AiFactionUnitRoster<Unit extends AiRosterUnitLike> {
  units: Unit[];
  navalBoats: Unit[];
  workers: Unit[];
  activeWorkers: Unit[];
  army: Unit[];
  nonSiegeArmy: Unit[];
  siegeArmy: Unit[];
  meleeArmyCount: number;
  hasBatteringRam: boolean;
  meleeCount: number;
  rangedSupportCount: number;
  cavalryCount: number;
  siegeCount: number;
  specialCount: number;
  militaryCount: number;
  mongolMountedArcherCount: number;
}

/** Classifies one faction's living units without rescanning the roster for each role. */
export function classifyAiFactionUnits<Unit extends AiRosterUnitLike>(
  roster: readonly Unit[],
  isMilitaryArmyUnit: (unitDefId: string, category: string) => boolean,
  isMongolRangedSupport: (unit: Unit) => boolean = (unit) => unit.unitDef.category === 'ranged',
): AiFactionUnitRoster<Unit> {
  const units: Unit[] = [];
  const navalBoats: Unit[] = [];
  const workers: Unit[] = [];
  const activeWorkers: Unit[] = [];
  const army: Unit[] = [];
  const nonSiegeArmy: Unit[] = [];
  const siegeArmy: Unit[] = [];
  let meleeArmyCount = 0;
  let hasBatteringRam = false;
  let meleeCount = 0;
  let rangedSupportCount = 0;
  let cavalryCount = 0;
  let siegeCount = 0;
  let specialCount = 0;
  let militaryCount = 0;
  let mongolMountedArcherCount = 0;

  for (const unit of roster) {
    if (unit.hp <= 0) continue;
    units.push(unit);

    if (unit.unitDef.category === 'worker') {
      if (unit.unitDef.isNaval || unit.unitDefId === 'fishing_boat') {
        navalBoats.push(unit);
      } else {
        workers.push(unit);
        if (!unit.garrisonedInBuildingId) activeWorkers.push(unit);
      }
    }

    const isMilitaryUnit = isMilitaryArmyUnit(unit.unitDefId, unit.unitDef.category);
    if (isMilitaryUnit) militaryCount++;
    if (unit.unitDef.category === 'melee') meleeCount++;
    if (unit.unitDef.category === 'cavalry') cavalryCount++;
    if (unit.unitDefId === 'battering_ram') hasBatteringRam = true;
    if (unit.unitDef.category === 'siege') siegeCount++;
    if (unit.unitDefId === 'mongol_mangudai') mongolMountedArcherCount++;
    if (isMongolRangedSupport(unit)) rangedSupportCount++;

    if (isMilitaryUnit && !unit.garrisonedInBuildingId) {
      army.push(unit);
      if (unit.unitDef.category === 'special') specialCount++;
      if (unit.unitDef.category === 'melee') meleeArmyCount++;
      if (unit.unitDef.category === 'siege') siegeArmy.push(unit);
      else nonSiegeArmy.push(unit);
    }
  }

  return {
    units,
    navalBoats,
    workers,
    activeWorkers,
    army,
    nonSiegeArmy,
    siegeArmy,
    meleeArmyCount,
    hasBatteringRam,
    meleeCount,
    rangedSupportCount,
    cavalryCount,
    siegeCount,
    specialCount,
    militaryCount,
    mongolMountedArcherCount,
  };
}

export interface AiFactionBuildingRoster<Building extends AiRosterBuildingLike> {
  buildings: Building[];
  farmCount: number;
  towerCount: number;
  castleCount: number;
  lumberCampCount: number;
  miningCampCount: number;
  townCenter: Building | undefined;
  barracks: Building[];
  archeryRanges: Building[];
  stables: Building[];
  siegeWorkshops: Building[];
  docks: Building[];
  ovooBuildings: Building[];
  uniqueBuilding: Building | undefined;
}

/** Classifies production and unique buildings in the source roster's stable order. */
export function classifyAiFactionBuildings<Building extends AiRosterBuildingLike>(
  roster: readonly Building[],
  uniqueBuildingType: string,
): AiFactionBuildingRoster<Building> {
  const buildings: Building[] = [];
  const barracks: Building[] = [];
  const archeryRanges: Building[] = [];
  const stables: Building[] = [];
  const siegeWorkshops: Building[] = [];
  const docks: Building[] = [];
  const ovooBuildings: Building[] = [];
  let farmCount = 0;
  let towerCount = 0;
  let castleCount = 0;
  let lumberCampCount = 0;
  let miningCampCount = 0;
  let townCenter: Building | undefined;
  let uniqueBuilding: Building | undefined;

  for (const building of roster) {
    if (building.hp <= 0) continue;
    buildings.push(building);

    if (!townCenter && building.buildingType === 'town_center') townCenter = building;
    if (!uniqueBuilding && building.buildingType === uniqueBuildingType) {
      uniqueBuilding = building;
    }

    switch (building.buildingType) {
      case 'farm':
        farmCount++;
        break;
      case 'tower':
        towerCount++;
        break;
      case 'castle':
        castleCount++;
        break;
      case 'lumber_camp':
        lumberCampCount++;
        break;
      case 'mining_camp':
        miningCampCount++;
        break;
      case 'barracks':
        barracks.push(building);
        break;
      case 'archery_range':
        archeryRanges.push(building);
        break;
      case 'stable':
        stables.push(building);
        break;
      case 'siege_workshop':
        siegeWorkshops.push(building);
        break;
      case 'dock':
        docks.push(building);
        break;
      case 'ovoo_relay':
        if (building.isConstructed) ovooBuildings.push(building);
        break;
    }
  }

  return {
    buildings,
    farmCount,
    towerCount,
    castleCount,
    lumberCampCount,
    miningCampCount,
    townCenter,
    barracks,
    archeryRanges,
    stables,
    siegeWorkshops,
    docks,
    ovooBuildings,
    uniqueBuilding,
  };
}
