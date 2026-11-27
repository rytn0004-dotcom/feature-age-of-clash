import type { ResourceNode } from '../types/game';
import { sanitizeWildlifeVelocity, sanitizeWildlifeYaw } from './wildlifeFacing';

export type WildlifeSimulationState = Pick<
  ResourceNode,
  'animalAlive' | 'animalHp' | 'animalMaxHp' | 'animalVx' | 'animalVz' | 'animalYaw'
>;

/**
 * Initialize health and movement independently.
 * A spawned animal may already have animalAlive=true before its first simulation
 * tick, so movement initialization must not be hidden behind an "alive undefined" gate.
 */
export function initializeWildlifeSimulationState(
  node: WildlifeSimulationState,
  wildlifeIndex: number,
  defaultMaxHp: number,
): void {
  const safeMaxHp = Math.max(1, Number.isFinite(defaultMaxHp) ? defaultMaxHp : 1);
  node.animalMaxHp ??= safeMaxHp;
  if (node.animalHp === undefined) {
    node.animalHp = node.animalAlive === false ? 0 : node.animalMaxHp;
  }
  if (node.animalAlive === undefined) {
    node.animalAlive = node.animalHp > 0;
  }

  node.animalVx = sanitizeWildlifeVelocity(node.animalVx);
  node.animalVz = sanitizeWildlifeVelocity(node.animalVz);
  const safeIndex = Math.max(0, Number.isFinite(wildlifeIndex) ? Math.floor(wildlifeIndex) : 0);
  const initialYaw = (safeIndex * 1.9) % (Math.PI * 2);
  node.animalYaw = sanitizeWildlifeYaw(node.animalYaw, initialYaw);
}
