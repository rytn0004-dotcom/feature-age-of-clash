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
}

/** Classifies one faction's living units without rescanning the roster for each role. */
export function classifyAiFactionUnits<Unit extends AiRosterUnitLike>(
  roster: readonly Unit[],
  isMilitaryArmyUnit: (unitDefId: string, category: string) => boolean,
): AiFactionUnitRoster<Unit> {
  const units: Unit[] = [];
  const navalBoats: Unit[] = [];
  const workers: Unit[] = [];
  const activeWorkers: Unit[] = [];
  const army: Unit[] = [];

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

    if (
      isMilitaryArmyUnit(unit.unitDefId, unit.unitDef.category) &&
      !unit.garrisonedInBuildingId
    ) {
      army.push(unit);
    }
  }

  return { units, navalBoats, workers, activeWorkers, army };
}

export interface AiFactionBuildingRoster<Building extends AiRosterBuildingLike> {
  buildings: Building[];
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
