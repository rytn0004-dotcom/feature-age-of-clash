import type { UnitCategory } from '../types/game';

export type DirectionalAttackZone = 'front' | 'flank' | 'rear';

export interface DirectionalAttackResult {
  zone: DirectionalAttackZone;
  multiplier: number;
}

export interface DirectionalAttackInput {
  attackerX: number;
  attackerZ: number;
  defenderX: number;
  defenderZ: number;
  /** Unit facing vector, where (0, 1) faces positive Z. */
  defenderFacingX: number;
  defenderFacingZ: number;
  attackerCategory: UnitCategory;
  defenderCategory: UnitCategory;
}

const FRONT_RESULT: DirectionalAttackResult = { zone: 'front', multiplier: 1 };

/**
 * Rewards coordinated melee pressure from the side and rear without changing
 * frontal balance. Cavalry gets a larger payoff so a screen-and-flank plan
 * becomes a meaningful counter to ranged and siege lines.
 */
export function getDirectionalAttackModifier(
  input: DirectionalAttackInput,
): DirectionalAttackResult {
  const values = [
    input.attackerX,
    input.attackerZ,
    input.defenderX,
    input.defenderZ,
    input.defenderFacingX,
    input.defenderFacingZ,
  ];
  if (!values.every(Number.isFinite)) return FRONT_RESULT;
  if (input.attackerCategory !== 'melee' && input.attackerCategory !== 'cavalry') {
    return FRONT_RESULT;
  }

  const dx = input.attackerX - input.defenderX;
  const dz = input.attackerZ - input.defenderZ;
  const distance = Math.hypot(dx, dz);
  const facingLength = Math.hypot(input.defenderFacingX, input.defenderFacingZ);
  if (distance < 0.001 || facingLength < 0.001) return FRONT_RESULT;

  const facingDot =
    (dx / distance) * (input.defenderFacingX / facingLength) +
    (dz / distance) * (input.defenderFacingZ / facingLength);

  if (facingDot >= 0.35) return FRONT_RESULT;

  const isRearAttack = facingDot <= -0.45;
  const isCavalry = input.attackerCategory === 'cavalry';
  const vulnerableBackline =
    input.defenderCategory === 'ranged' || input.defenderCategory === 'siege';

  if (isRearAttack) {
    return {
      zone: 'rear',
      multiplier: (isCavalry ? 1.32 : 1.24) + (vulnerableBackline ? 0.04 : 0),
    };
  }

  return {
    zone: 'flank',
    multiplier: isCavalry ? 1.18 : 1.12,
  };
}
