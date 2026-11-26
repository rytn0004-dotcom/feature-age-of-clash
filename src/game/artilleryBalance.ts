/** Impact tuning for the Imperial Bombard Cannon. */
export const BOMBARD_CANNON_SPLASH_RADIUS = 3.8;
export const BOMBARD_CANNON_SPLASH_CENTER_DAMAGE = 24;
export const BOMBARD_CANNON_SPLASH_EDGE_DAMAGE = 8;

export function getBombardCannonSplashDamage(distance: number): number {
  if (
    !Number.isFinite(distance) ||
    distance < 0 ||
    distance > BOMBARD_CANNON_SPLASH_RADIUS
  ) return 0;

  const normalized = distance / BOMBARD_CANNON_SPLASH_RADIUS;
  return Math.max(
    BOMBARD_CANNON_SPLASH_EDGE_DAMAGE,
    Math.round(
      BOMBARD_CANNON_SPLASH_CENTER_DAMAGE +
      (BOMBARD_CANNON_SPLASH_EDGE_DAMAGE - BOMBARD_CANNON_SPLASH_CENTER_DAMAGE) * normalized,
    ),
  );
}
