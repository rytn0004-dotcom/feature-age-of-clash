export interface AmbientTreeWind {
  phase?: number;
  amplitude?: number;
  frequency?: number;
}

interface RotationTarget {
  rotation: {
    x: number;
    y: number;
    z: number;
  };
}

export interface AmbientTreeWindNode {
  userData: {
    treeWind?: AmbientTreeWind;
    treeCanopy?: RotationTarget;
    treeAssetLod?: RotationTarget;
  };
}

/**
 * Advances only indexed tree meshes. Resource animals, minerals, farms, and
 * other non-tree nodes are intentionally excluded by the caller's Set.
 */
export function updateAmbientTreeWind(
  nodes: Iterable<AmbientTreeWindNode>,
  simulationTime: number,
): void {
  if (!Number.isFinite(simulationTime)) return;

  for (const node of nodes) {
    const wind = node.userData.treeWind;
    if (!wind) continue;

    const phase = Number.isFinite(wind.phase) ? wind.phase! : 0;
    const amplitude = Number.isFinite(wind.amplitude) ? wind.amplitude! : 0.035;
    const frequency = Number.isFinite(wind.frequency) ? wind.frequency! : 1.6;
    const swayZ = Math.sin(simulationTime * frequency + phase) * amplitude;
    const swayX = Math.cos(simulationTime * frequency * 0.76 + phase * 0.71) * amplitude * 0.58;

    const canopy = node.userData.treeCanopy;
    if (canopy) {
      canopy.rotation.z = swayZ;
      canopy.rotation.x = swayX;
    }

    const distanceLodTree = node.userData.treeAssetLod;
    if (distanceLodTree) {
      distanceLodTree.rotation.z = swayZ;
      distanceLodTree.rotation.x = swayX;
    }
  }
}
