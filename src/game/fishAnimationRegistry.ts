/** Resource-node subtypes that own animated 3D fish LODs. */
export function isFishAnimationSubtype(subtype: string | undefined): boolean {
  return subtype === 'shore_fish' || subtype === 'deep_fish';
}
