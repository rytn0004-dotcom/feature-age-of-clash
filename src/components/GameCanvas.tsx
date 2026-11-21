import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { RtsEngine } from '../game/engine';
import { sound } from '../game/audio';

import { DEFAULT_BUILDINGS } from '../game/mods';
import { isPlacementLocationValid } from '../game/collision';
import { getBuildingMaxGarrison, getContestedShrineSummary } from '../game/rules';

interface GameCanvasProps {
  onEngineReady: (engine: RtsEngine) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ onEngineReady }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const floatingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RtsEngine | null>(null);

  // Marquee selection box state
  const isMouseDownRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; shiftKey: boolean } | null>(null);
  const lastClickedUnitRef = useRef<{ id: string; defId: string; time: number } | null>(null);
  const lastHoverCheckRef = useRef(0);
  const [marqueeBox, setMarqueeBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [wallPlacementInfo, setWallPlacementInfo] = useState<
    ReturnType<RtsEngine['getWallPlacementPreviewInfo']> | null
  >(null);
  const [hoverHint, setHoverHint] = useState<{
    x: number;
    y: number;
    cursorClass: string;
    cursorCss?: string;
    badgeText: string;
    tone: 'gather' | 'build' | 'attack' | 'rally' | 'select';
    iconKind?: 'wood' | 'hunt' | 'berry' | 'shore_fish' | 'deep_fish' | 'farm' | 'gold' | 'stone' | 'build' | 'attack' | 'rally' | 'select' | 'garrison' | 'contested';
  } | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const engine = new RtsEngine(mountRef.current);
    engineRef.current = engine;
    (window as any).__rtsEngine = engine;
    onEngineReady(engine);

    return () => {
      delete (window as any).__rtsEngine;
      engine.destroy();
    };
  }, [onEngineReady]);

  // 2D Overlay renderer for 3D floating combat / XP / resource / tech texts
  useEffect(() => {
    const canvas = floatingCanvasRef.current;
    const mount = mountRef.current;
    if (!canvas || !mount) return;

    const syncSize = () => {
      const rect = mount.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
          canvas.width = Math.round(rect.width);
          canvas.height = Math.round(rect.height);
        }
      }
    };
    syncSize();

    const ro = new ResizeObserver(syncSize);
    ro.observe(mount);

    const scratchVec = new THREE.Vector3();
    let rafId = 0;

    const renderFloatingTexts = () => {
      const ctx = canvas.getContext('2d');
      const engine = engineRef.current;
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (engine && engine.gameState === 'playing' && engine.floatingTexts.length > 0) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '700 13px system-ui, -apple-system, sans-serif';

          for (let i = 0; i < engine.floatingTexts.length; i++) {
            const ft = engine.floatingTexts[i];
            scratchVec.set(ft.x, ft.y, ft.z);
            scratchVec.project(engine.camera);
            if (scratchVec.z < -1 || scratchVec.z > 1) continue;

            const sx = ((scratchVec.x + 1) * canvas.width) / 2;
            const sy = ((-scratchVec.y + 1) * canvas.height) / 2;
            if (sx < -80 || sx > canvas.width + 80 || sy < -40 || sy > canvas.height + 40) continue;

            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, ft.opacity));
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
            ctx.strokeText(ft.text, sx, sy);
            ctx.fillStyle = ft.color || '#f8fafc';
            ctx.fillText(ft.text, sx, sy);
            ctx.restore();
          }
        }
      }
      rafId = requestAnimationFrame(renderFloatingTexts);
    };

    rafId = requestAnimationFrame(renderFloatingTexts);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  const finishSelection = (clientX: number, clientY: number) => {
    const engine = engineRef.current;
    if (!engine || !isMouseDownRef.current || !dragStartRef.current) return;
    isMouseDownRef.current = false;

    const start = dragStartRef.current;
    dragStartRef.current = null;
    const end = { x: clientX, y: clientY };
    const dragDistance = Math.hypot(end.x - start.x, end.y - start.y);

    setMarqueeBox(null);

    // Single Click Selection (Precise 3D Raycasting with zero offset)
    if (dragDistance < 6) {
      const hit = engine.raycastInteractive(clientX, clientY);

      // 1. Check if clicked a unit
      if (hit.hitType === 'unit' && hit.unit) {
        if (engine.isHumanControlled(hit.unit.faction)) {
          const now = performance.now();
          const isDoubleClick =
            !start.shiftKey &&
            lastClickedUnitRef.current &&
            lastClickedUnitRef.current.defId === hit.unit.unitDefId &&
            now - lastClickedUnitRef.current.time < 340;
          lastClickedUnitRef.current = { id: hit.unit.id, defId: hit.unit.unitDefId, time: now };

          if (isDoubleClick) {
            engine.selectUnitsOfSameType(hit.unit.unitDefId);
            return;
          }
          if (start.shiftKey) {
            const exists = engine.selectedUnitIds.includes(hit.unit.id);
            engine.selectedUnitIds = exists
              ? engine.selectedUnitIds.filter((id) => id !== hit.unit!.id)
              : [...engine.selectedUnitIds, hit.unit.id];
          } else {
            engine.selectedUnitIds = [hit.unit.id];
          }
          engine.selectedBuildingId = null;
          engine.selectedNodeId = null;
          engine.selectedContestedPointId = null;
          engine.inspectedEntity = null;
          sound.playSelect();
        } else {
          engine.selectedUnitIds = [];
          engine.selectedBuildingId = null;
          engine.selectedNodeId = null;
          engine.selectedContestedPointId = null;
          engine.inspectedEntity = { type: 'unit', id: hit.unit.id, faction: hit.unit.faction };
          sound.playSelect();
        }
        engine.onSelectionChange?.();
        return;
      }

      // 2. Check if clicked a building
      if (hit.hitType === 'building' && hit.building) {
        if (engine.isHumanControlled(hit.building.faction)) {
          engine.selectedBuildingId = hit.building.id;
          engine.selectedUnitIds = [];
          engine.selectedNodeId = null;
          engine.selectedContestedPointId = null;
          engine.inspectedEntity = null;
          sound.playSelect();
        } else {
          engine.selectedBuildingId = null;
          engine.selectedUnitIds = [];
          engine.selectedNodeId = null;
          engine.selectedContestedPointId = null;
          engine.inspectedEntity = { type: 'building', id: hit.building.id, faction: hit.building.faction };
          sound.playSelect();
        }
        engine.onSelectionChange?.();
        return;
      }

      // 3. Check if clicked a resource node
      if (hit.hitType === 'resource' && hit.resource) {
        engine.selectedNodeId = hit.resource.id;
        engine.selectedUnitIds = [];
        engine.selectedBuildingId = null;
        engine.selectedContestedPointId = null;
        engine.inspectedEntity = null;
        sound.playSelect();
        engine.onSelectionChange?.();
        return;
      }

      // 4. Check if clicked a contested shrine point
      if (hit.hitType === 'contested' && hit.contested) {
        engine.selectContestedPoint(hit.contested.id);
        return;
      }

      // Deselect all
      engine.selectedUnitIds = [];
      engine.selectedBuildingId = null;
      engine.selectedNodeId = null;
      engine.selectedContestedPointId = null;
      engine.inspectedEntity = null;
      engine.onSelectionChange?.();
      return;
    }

    // Box Marquee Selection
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const rect = mountRef.current?.getBoundingClientRect();
    if (!rect) return;

    const selected: string[] = [];

    // Project human player units to screen coordinates (exclude sheltered garrisoned units)
    engine.units.forEach((u) => {
      if (!engine.isHumanControlled(u.faction) || u.garrisonedInBuildingId) return;
      const v = new THREE.Vector3(u.x, 1, u.z);
      v.project(engine.camera);

      if (v.z < -1 || v.z > 1) return;

      const screenX = ((v.x + 1) * rect.width) / 2 + rect.left;
      const screenY = ((-v.y + 1) * rect.height) / 2 + rect.top;

      if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
        selected.push(u.id);
      }
    });

    if (selected.length > 0) {
      if (start.shiftKey) {
        const merged = new Set([...engine.selectedUnitIds, ...selected]);
        engine.selectedUnitIds = Array.from(merged);
      } else {
        engine.selectedUnitIds = selected;
      }
      engine.selectedBuildingId = null;
      engine.selectedNodeId = null;
      engine.selectedContestedPointId = null;
      engine.inspectedEntity = null;
      sound.playSelect();
    } else if (!start.shiftKey) {
      engine.selectedUnitIds = [];
      engine.selectedBuildingId = null;
      engine.selectedNodeId = null;
      engine.selectedContestedPointId = null;
      engine.inspectedEntity = null;
    }
    engine.onSelectionChange?.();
  };

  // Global pointer listeners fail-safe so dragging across HUD never loses marquee
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (isMouseDownRef.current && dragStartRef.current) {
        const startX = dragStartRef.current.x;
        const startY = dragStartRef.current.y;
        const curX = e.clientX;
        const curY = e.clientY;
        setMarqueeBox({
          left: Math.min(startX, curX),
          top: Math.min(startY, curY),
          width: Math.abs(curX - startX),
          height: Math.abs(curY - startY),
        });
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (isMouseDownRef.current) {
        finishSelection(e.clientX, e.clientY);
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, []);

  // Pointer Down (Left or Right)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const engine = engineRef.current;
    if (!engine || engine.gameState !== 'playing') return;

    // Right click (Button 2) -> Order Issue or Set Rally Point (disabled in Spectator Mode)
    if (e.button === 2) {
      e.preventDefault();
      if (engine.isSpectatorMode) return;
      if (engine.placementBuildingType) {
        engine.cancelPlacement();
        setWallPlacementInfo(null);
        return;
      }
      if (engine.pendingCommandMode === 'attack_move') {
        engine.pendingCommandMode = 'normal';
        engine.onSelectionChange?.();
        return;
      }

      const hit = engine.raycastInteractive(e.clientX, e.clientY);
      const worldPoint = hit.point || engine.screenToWorld(e.clientX, e.clientY);
      if (!worldPoint) return;

      // 1. If a friendly building is selected, right click sets its Rally Point (auto-gathering resources or joining construction!)
      if (engine.selectedBuildingId) {
        const b = engine.buildings.find((bldg) => bldg.id === engine.selectedBuildingId);
        if (b && engine.isHumanControlled(b.faction)) {
          if (hit.hitType === 'resource' && hit.resource) {
            engine.setBuildingRallyPoint(b.id, hit.resource.x, hit.resource.z, {
              targetResourceNodeId: hit.resource.id,
              resourceType: hit.resource.resourceType,
              resourceSubtype: hit.resource.subtype,
            });
            return;
          }
          if (hit.hitType === 'building' && hit.building && !engine.isHostileToPlayer(hit.building)) {
            if (hit.building.buildingType === 'farm' && hit.building.isConstructed) {
              const farmNode = engine.getOrCreateFarmFoodNode(hit.building);
              if (farmNode) {
                engine.setBuildingRallyPoint(b.id, hit.building.x, hit.building.z, {
                  targetResourceNodeId: farmNode.id,
                  resourceType: 'food',
                  resourceSubtype: 'farm',
                });
                return;
              }
            }
            if (!hit.building.isConstructed) {
              engine.setBuildingRallyPoint(b.id, hit.building.x, hit.building.z, {
                targetBuildingId: hit.building.id,
              });
              return;
            }
          }
          engine.setBuildingRallyPoint(engine.selectedBuildingId, worldPoint.x, worldPoint.z);
          return;
        }
      }

      const hasWorkersSelected = engine.selectedUnitIds.some((uid) => {
        const u = engine.units.find((unit) => unit.id === uid);
        return !!u && u.hp > 0 && u.unitDef.category === 'worker' && engine.isHumanControlled(u.faction);
      });

      // 2. Attack order if targeted hostile unit
      if (hit.hitType === 'unit' && hit.unit && engine.isHostileToPlayer(hit.unit)) {
        engine.issueAttackOrder(hit.unit.id, e.shiftKey);
        return;
      }

      // 3. Attack order if targeted hostile building
      if (hit.hitType === 'building' && hit.building && engine.isHostileToPlayer(hit.building)) {
        engine.issueAttackOrder(hit.building.id, e.shiftKey);
        return;
      }

      // 4. Resume / join construction if workers right-click an incomplete friendly building
      if (
        hasWorkersSelected &&
        hit.hitType === 'building' &&
        hit.building &&
        (!hit.building.isConstructed || hit.building.wallBreached) &&
        !engine.isHostileToPlayer(hit.building)
      ) {
        engine.issueBuildOrder(hit.building.id);
        return;
      }

      // 5. Fallback gather if workers right-click a completed friendly Farm directly
      if (
        hasWorkersSelected &&
        hit.hitType === 'building' &&
        hit.building &&
        hit.building.buildingType === 'farm' &&
        hit.building.isConstructed &&
        !engine.isHostileToPlayer(hit.building)
      ) {
        const farmNode = engine.getOrCreateFarmFoodNode(hit.building);
        if (farmNode) {
          engine.issueGatherOrder(farmNode.id, e.shiftKey);
          return;
        }
      }

      // 5.5 Garrison order if non-siege friendly units right-click a completed garrisonable building
      if (
        hit.hitType === 'building' &&
        hit.building &&
        hit.building.isConstructed &&
        !engine.isHostileToPlayer(hit.building) &&
        getBuildingMaxGarrison(hit.building) > 0
      ) {
        const hasGarrisonableSelected = engine.selectedUnitIds.some((uid) => {
          const u = engine.units.find((unit) => unit.id === uid);
          return !!u && u.hp > 0 && u.unitDef.category !== 'siege' && engine.isHumanControlled(u.faction);
        });
        if (hasGarrisonableSelected) {
          engine.issueGarrisonOrder(hit.building.id);
          return;
        }
      }

      // 6. Gather order if targeted resource node
      if (hit.hitType === 'resource' && hit.resource) {
        if (hasWorkersSelected) {
          engine.issueGatherOrder(hit.resource.id, e.shiftKey);
          return;
        }
      }

      // 7. Default: Move order to clicked terrain location
      engine.issueMoveOrder(worldPoint.x, worldPoint.z, e.shiftKey);
      return;
    }

    // Left click (Button 0)
    if (e.button === 0) {
      // If in placement mode, confirm building placement
      if (engine.placementBuildingType) {
        const worldPoint = engine.screenToWorld(e.clientX, e.clientY);
        if (worldPoint) {
          if (engine.placementBuildingType === 'wall') {
            const result = engine.handleWallPlacementClick(worldPoint.x, worldPoint.z, e.shiftKey);
            setWallPlacementInfo(engine.getWallPlacementPreviewInfo());
            if (result === 'committed') setWallPlacementInfo(null);
          } else {
            engine.confirmPlacement(worldPoint.x, worldPoint.z);
          }
        }
        return;
      }

      // If in Attack-Move targeting mode, execute Attack-Move / Attack on target
      if (engine.pendingCommandMode === 'attack_move') {
        const hit = engine.raycastInteractive(e.clientX, e.clientY);
        if (hit.hitType === 'unit' && hit.unit && engine.isHostileToPlayer(hit.unit)) {
          engine.issueAttackOrder(hit.unit.id, e.shiftKey);
          return;
        }
        if (hit.hitType === 'building' && hit.building && engine.isHostileToPlayer(hit.building)) {
          engine.issueAttackOrder(hit.building.id, e.shiftKey);
          return;
        }
        const worldPoint = hit.point || engine.screenToWorld(e.clientX, e.clientY);
        if (worldPoint) {
          engine.issueAttackMoveOrder(worldPoint.x, worldPoint.z);
        } else {
          engine.pendingCommandMode = 'normal';
          engine.onSelectionChange?.();
        }
        return;
      }

      setHoverHint(null);
      // Start drag marquee selection with pointer capture
      isMouseDownRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY, shiftKey: e.shiftKey };
      setMarqueeBox({ left: e.clientX, top: e.clientY, width: 0, height: 0 });

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const engine = engineRef.current;
    if (!engine) return;

    // Wall mode uses a live polyline preview; other buildings keep the single-footprint ghost.
    if (engine.placementBuildingType === 'wall') {
      if (hoverHint) setHoverHint(null);
      const worldPoint = engine.screenToWorld(e.clientX, e.clientY);
      if (worldPoint) {
        engine.updateWallPlacementPreview(worldPoint.x, worldPoint.z);
        setWallPlacementInfo(engine.getWallPlacementPreviewInfo());
      }
      return;
    }

    // Update ordinary building placement ghost position and visual collision color.
    if (engine.placementBuildingType) {
      if (hoverHint) setHoverHint(null);
      const worldPoint = engine.screenToWorld(e.clientX, e.clientY);
      const ghost = (engine as any).placementGhostMesh as THREE.Group | null;
      if (ghost && worldPoint) {
        ghost.position.set(worldPoint.x, 0, worldPoint.z);
        const bDef = DEFAULT_BUILDINGS[engine.placementBuildingType];
        const obs = engine.getTerrainNavObstacles();
        const isValid = isPlacementLocationValid(
          worldPoint.x,
          worldPoint.z,
          bDef.size,
          engine.buildings,
          engine.resourceNodes,
          !!bDef.isWall,
          obs?.rects,
          obs?.discs,
          obs?.bridges,
          engine.placementBuildingType
        );

        ghost.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (m && m.color) {
              m.color.setHex(isValid ? 0x22c55e : 0xef4444);
            }
          }
        });
      }
      return;
    }

    // Update drag marquee box
    if (isMouseDownRef.current && dragStartRef.current) {
      const startX = dragStartRef.current.x;
      const startY = dragStartRef.current.y;
      const curX = e.clientX;
      const curY = e.clientY;

      setMarqueeBox({
        left: Math.min(startX, curX),
        top: Math.min(startY, curY),
        width: Math.abs(curX - startX),
        height: Math.abs(curY - startY),
      });
      return;
    }

    // Contextual cursor & hover badge detection (throttled ~65ms)
    if (engine.gameState !== 'playing') {
      if (hoverHint) setHoverHint(null);
      return;
    }

    if (engine.pendingCommandMode === 'attack_move') {
      setHoverHint({
        x: e.clientX,
        y: e.clientY,
        cursorClass: 'cursor-crosshair',
        badgeText: '⚔️ 左鍵攻擊推進此區 (右鍵取消)',
        tone: 'attack',
      });
      return;
    }

    const now = performance.now();
    if (now - lastHoverCheckRef.current < 65) {
      if (hoverHint) {
        setHoverHint((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
      }
      return;
    }
    lastHoverCheckRef.current = now;

    const hit = engine.raycastInteractive(e.clientX, e.clientY);
    const hasSelectedUnits = engine.selectedUnitIds.length > 0;
    const hasWorkersSelected = engine.selectedUnitIds.some((uid) => {
      const u = engine.units.find((unit) => unit.id === uid);
      return !!u && u.hp > 0 && u.unitDef.category === 'worker' && engine.isHumanControlled(u.faction);
    });
    const hasNavalBoatSelected = engine.selectedUnitIds.some((uid) => {
      const u = engine.units.find((unit) => unit.id === uid);
      return (
        !!u &&
        u.hp > 0 &&
        (!!u.unitDef.isNaval || u.unitDefId === 'fishing_boat') &&
        engine.isHumanControlled(u.faction)
      );
    });
    const hasLandWorkersSelected = engine.selectedUnitIds.some((uid) => {
      const u = engine.units.find((unit) => unit.id === uid);
      return (
        !!u &&
        u.hp > 0 &&
        u.unitDef.category === 'worker' &&
        !u.unitDef.isNaval &&
        u.unitDefId !== 'fishing_boat' &&
        engine.isHumanControlled(u.faction)
      );
    });

    const selBldg =
      engine.selectedBuildingId && !hasSelectedUnits
        ? engine.buildings.find(
            (b) => b.id === engine.selectedBuildingId && engine.isHumanControlled(b.faction) && b.buildingDef.trainableUnits.length > 0
          )
        : undefined;
    const hasTcRally = selBldg?.buildingType === 'town_center' || selBldg?.buildingType === 'dock';

    const makeCursor = (svgBody: string) =>
      `url("data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${svgBody}</svg>`
      )}") 6 6, pointer`;

    const resourceCursors: Record<string, string> = {
      wood: makeCursor(
        `<path d='M8 26 L21 13' stroke='%2392400e' stroke-width='3.6' stroke-linecap='round'/><path d='M16 7 C23 6 27 11 25 18 L18 14 Z' fill='%23e2e8f0' stroke='%230f172a' stroke-width='1.5'/><path d='M23 9 C25.5 11.5 26 14.5 24.5 17.5' stroke='%23ffffff' stroke-width='1.4' fill='none'/>`
      ),
      hunt: makeCursor(
        `<path d='M6 17 C6 10 14 7 22 9 C27 11 28 19 23 23 C17 27 7 24 6 17 Z' fill='%23dc2626' stroke='%237f1d1d' stroke-width='1.8'/><path d='M9 17 C9 12 15 10 21 11.5 C24.5 12.5 25 18 21.5 21 C16.5 23.5 10 21.5 9 17 Z' fill='%23ef4444'/><circle cx='15.5' cy='15.5' r='3' fill='%23fef2f2' stroke='%23fca5a5' stroke-width='1'/><path d='M19 14 L23 16' stroke='%23fecaca' stroke-width='1.5' stroke-linecap='round'/>`
      ),
      berry: makeCursor(
        `<path d='M16 5 C19 4 22 6 20 9 C18 10 15 8 16 5 Z' fill='%2322c55e' stroke='%2314532d' stroke-width='1.2'/><path d='M13 6 C10 5 8 8 11 10 C13 10.5 14.5 8 13 6 Z' fill='%234ade80' stroke='%2314532d' stroke-width='1.2'/><circle cx='12' cy='16' r='5.2' fill='%239333ea' stroke='%233b0764' stroke-width='1.3'/><circle cx='20' cy='16' r='5.2' fill='%23c026d3' stroke='%234a044e' stroke-width='1.3'/><circle cx='16' cy='22' r='5.5' fill='%23a21caf' stroke='%233b0764' stroke-width='1.3'/><circle cx='10.3' cy='14.2' r='1.5' fill='%23fdf4ff'/><circle cx='18.3' cy='14.2' r='1.5' fill='%23fdf4ff'/><circle cx='14.3' cy='20.2' r='1.6' fill='%23fdf4ff'/>`
      ),
    };

    if (hit.hitType === 'unit' && hit.unit) {
      const uName = hit.unit.unitDef.name.split(' ')[0];
      if (engine.isSpectatorMode) {
        const pName = engine.getParticipant(hit.unit.faction)?.name || '';
        setHoverHint({
          x: e.clientX,
          y: e.clientY,
          cursorClass: 'cursor-pointer',
          badgeText: `👁️ ${pName ? `${pName} · ` : ''}${uName}`,
          tone: 'select',
          iconKind: 'select',
        });
        return;
      }
      if (hasSelectedUnits && engine.isHostileToPlayer(hit.unit)) {
        setHoverHint({
          x: e.clientX,
          y: e.clientY,
          cursorClass: 'cursor-crosshair',
          badgeText: `右鍵攻擊: ${uName}`,
          tone: 'attack',
          iconKind: 'attack',
        });
        return;
      }
      setHoverHint({
        x: e.clientX,
        y: e.clientY,
        cursorClass: 'cursor-pointer',
        badgeText: engine.isHumanControlled(hit.unit.faction) ? `選取: ${uName}` : `檢視: ${uName}`,
        tone: 'select',
        iconKind: 'select',
      });
      return;
    }

    if (hit.hitType === 'building' && hit.building) {
      const b = hit.building;
      const bName = b.buildingDef.name.split(' ')[0];
      if (engine.isSpectatorMode) {
        const pName = engine.getParticipant(b.faction)?.name || '';
        setHoverHint({
          x: e.clientX,
          y: e.clientY,
          cursorClass: 'cursor-pointer',
          badgeText: `👁️ ${pName ? `${pName} · ` : ''}${bName}`,
          tone: 'select',
          iconKind: 'select',
        });
        return;
      }
      if (hasSelectedUnits && engine.isHostileToPlayer(b)) {
        setHoverHint({
          x: e.clientX,
          y: e.clientY,
          cursorClass: 'cursor-crosshair',
          badgeText: `右鍵攻城: ${bName}`,
          tone: 'attack',
          iconKind: 'attack',
        });
        return;
      }
      if ((hasWorkersSelected || hasTcRally) && !b.isConstructed && !engine.isHostileToPlayer(b)) {
        setHoverHint({
          x: e.clientX,
          y: e.clientY,
          cursorClass: 'cursor-cell',
          badgeText: hasTcRally
            ? `右鍵設為集結協建 (${Math.round(b.buildProgress * 100)}%)`
            : `右鍵協助建造 (${Math.round(b.buildProgress * 100)}%)`,
          tone: 'build',
          iconKind: 'build',
        });
        return;
      }
      if ((hasWorkersSelected || hasTcRally) && b.buildingType === 'farm' && b.isConstructed && !engine.isHostileToPlayer(b)) {
        setHoverHint({
          x: e.clientX,
          y: e.clientY,
          cursorClass: 'cursor-cell',
          badgeText: hasTcRally ? '右鍵設為集結點：農田耕作' : '右鍵農田耕作',
          tone: hasTcRally ? 'rally' : 'gather',
          iconKind: 'farm',
        });
        return;
      }
      if (hasSelectedUnits && b.isConstructed && !engine.isHostileToPlayer(b)) {
        const gMax = getBuildingMaxGarrison(b);
        const hasGarrisonableSelected = engine.selectedUnitIds.some((uid) => {
          const u = engine.units.find((unit) => unit.id === uid);
          return !!u && u.hp > 0 && u.unitDef.category !== 'siege' && engine.isHumanControlled(u.faction);
        });
        if (gMax > 0 && hasGarrisonableSelected) {
          const gCur = b.garrisonedUnitIds?.length || 0;
          setHoverHint({
            x: e.clientX,
            y: e.clientY,
            cursorClass: 'cursor-cell',
            badgeText: gCur >= gMax ? `🛡️ 駐防已滿 (${gCur}/${gMax})` : `🛡️ 右鍵進駐防守 (${gCur}/${gMax})`,
            tone: 'build',
            iconKind: 'garrison',
          });
          return;
        }
      }
      setHoverHint({
        x: e.clientX,
        y: e.clientY,
        cursorClass: 'cursor-pointer',
        badgeText: engine.isHumanControlled(b.faction) ? `選取: ${bName}` : `偵察: ${bName}`,
        tone: 'select',
        iconKind: 'select',
      });
      return;
    }

    if (hit.hitType === 'resource' && hit.resource) {
      const r = hit.resource;
      const sub = (r.subtype || r.resourceType) as 'wood' | 'hunt' | 'berry' | 'shore_fish' | 'deep_fish' | 'farm' | 'gold' | 'stone';
      const actionMap: Record<string, { action: string; label: string }> = {
        wood: { action: '伐木', label: '森林原木' },
        gold: { action: '開採金礦', label: '黃金礦脈' },
        stone: { action: '開採石料', label: '花崗石礦' },
        deep_fish: { action: '捕撈深海魚', label: '深海魚群' },
        shore_fish: { action: '捕撈沿岸魚', label: '沿岸魚群' },
        berry: { action: '採集漿果', label: '野生漿果' },
        hunt: { action: '狩獵山羌', label: '野生山羌' },
        farm: { action: '農田耕作', label: '豐饒農田' },
        food: { action: '採集糧食', label: '糧食資源' },
      };
      const meta = actionMap[sub] || { action: '採集資源', label: '資源點' };

      if (hasWorkersSelected) {
        if (sub === 'deep_fish') {
          if (hasNavalBoatSelected) {
            setHoverHint({
              x: e.clientX,
              y: e.clientY,
              cursorClass: 'cursor-cell',
              cursorCss: resourceCursors[sub],
              badgeText: '⛵ 右鍵捕撈深海魚',
              tone: 'gather',
              iconKind: sub,
            });
          } else {
            setHoverHint({
              x: e.clientX,
              y: e.clientY,
              cursorClass: 'cursor-not-allowed',
              badgeText: '⚠️ 深海魚需碼頭【漁船】捕撈',
              tone: 'select',
              iconKind: sub,
            });
          }
        } else if (hasNavalBoatSelected && !hasLandWorkersSelected && sub !== 'shore_fish') {
          setHoverHint({
            x: e.clientX,
            y: e.clientY,
            cursorClass: 'cursor-not-allowed',
            badgeText: '⚠️ 漁船僅能捕撈魚群',
            tone: 'select',
            iconKind: sub,
          });
        } else {
          setHoverHint({
            x: e.clientX,
            y: e.clientY,
            cursorClass: 'cursor-cell',
            cursorCss: resourceCursors[sub],
            badgeText: `右鍵${meta.action}`,
            tone: 'gather',
            iconKind: sub,
          });
        }
      } else if (hasTcRally) {
        setHoverHint({
          x: e.clientX,
          y: e.clientY,
          cursorClass: 'cursor-cell',
          cursorCss: resourceCursors[sub],
          badgeText: `右鍵設為集結點：${meta.action}`,
          tone: 'rally',
          iconKind: sub,
        });
      } else {
        setHoverHint({
          x: e.clientX,
          y: e.clientY,
          cursorClass: 'cursor-pointer',
          badgeText: `${meta.label} (${Math.round(r.amount)})`,
          tone: 'select',
          iconKind: sub,
        });
      }
      return;
    }

    if (hit.hitType === 'contested' && hit.contested) {
      const cp = hit.contested;
      const summary = getContestedShrineSummary(cp, engine.participants);
      setHoverHint({
        x: e.clientX,
        y: e.clientY,
        cursorClass: 'cursor-pointer',
        badgeText: `檢視據點: ${cp.label} (${summary.statusLabel})`,
        tone: summary.statusKind.startsWith('contested') ? 'attack' : 'select',
        iconKind: 'contested',
      });
      return;
    }

    if (selBldg) {
      setHoverHint({
        x: e.clientX,
        y: e.clientY,
        cursorClass: 'cursor-crosshair',
        badgeText: hasTcRally ? '右鍵設定集結點 (點資源可自動採集)' : '右鍵設定集結點',
        tone: 'rally',
        iconKind: 'rally',
      });
      return;
    }

    setHoverHint(null);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    finishSelection(e.clientX, e.clientY);
  };

  const toneStyles: Record<NonNullable<typeof hoverHint>['tone'], string> = {
    gather: 'bg-amber-950/94 border-amber-400/90 text-amber-100',
    build: 'bg-sky-950/94 border-sky-400/90 text-sky-100',
    attack: 'bg-red-950/94 border-red-400/90 text-red-100',
    rally: 'bg-emerald-950/94 border-emerald-400/90 text-emerald-100',
    select: 'bg-slate-900/92 border-slate-500/80 text-slate-100',
  };

  const renderHoverIcon = (kind?: NonNullable<typeof hoverHint>['iconKind']) => {
    switch (kind) {
      case 'wood':
        // Bespoke Steel & Oak Axe Icon
        return (
          <svg data-hover-icon="wood-axe" className="w-5 h-5 shrink-0 drop-shadow" viewBox="0 0 24 24" fill="none">
            <path d="M5 20 L16 9" stroke="#b45309" strokeWidth="3" strokeLinecap="round" />
            <path d="M5 20 L15.5 9.5" stroke="#d97706" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M12.5 4.5 C18.5 3.8 21.8 7.6 19.6 13.6 L14 10.6 Z" fill="#cbd5e1" stroke="#334155" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M18.4 6.2 C20.2 8.2 20.5 10.6 19.2 12.8" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        );
      case 'hunt':
        // Bespoke Vibrant Red Bone-In Steak Icon
        return (
          <svg data-hover-icon="meat-steak" className="w-5 h-5 shrink-0 drop-shadow" viewBox="0 0 24 24" fill="none">
            <path
              d="M3.5 13.5 C3.5 7.5 10.5 5 17 6.8 C21.2 8.2 21.8 14.5 17.8 17.8 C12.8 21.2 4 19.2 3.5 13.5 Z"
              fill="#dc2626"
              stroke="#7f1d1d"
              strokeWidth="1.3"
            />
            <path
              d="M6 13.3 C6 9 11.2 7.2 16 8.6 C19 9.5 19.4 13.8 16.5 16.1 C12.8 18.5 6.4 17 6 13.3 Z"
              fill="#ef4444"
            />
            <circle cx="11.5" cy="12" r="2.2" fill="#fef2f2" stroke="#fca5a5" strokeWidth="0.9" />
            <path d="M14.2 10.8 L17.4 12.2" stroke="#fecaca" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M8.5 14.5 L11.5 15.6" stroke="#fecaca" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        );
      case 'berry':
        // Bespoke Plump Glossy Berries Icon
        return (
          <svg data-hover-icon="plump-berries" className="w-5 h-5 shrink-0 drop-shadow" viewBox="0 0 24 24" fill="none">
            <path d="M12.5 3.5 C15.2 2.8 17.8 4.4 16 6.8 C14.4 7.6 12 6 12.5 3.5 Z" fill="#22c55e" stroke="#14532d" strokeWidth="1.1" />
            <path d="M10.5 4.2 C8 3.6 6.2 5.8 8.4 7.4 C9.8 7.8 11.2 6 10.5 4.2 Z" fill="#4ade80" stroke="#14532d" strokeWidth="1.1" />
            <circle cx="8.5" cy="12.8" r="4.3" fill="#9333ea" stroke="#4c1d95" strokeWidth="1.1" />
            <circle cx="15.5" cy="12.8" r="4.3" fill="#c026d3" stroke="#701a75" strokeWidth="1.1" />
            <circle cx="12" cy="17.2" r="4.6" fill="#a21caf" stroke="#581c87" strokeWidth="1.1" />
            <circle cx="7.1" cy="11.3" r="1.2" fill="#fdf4ff" />
            <circle cx="14.1" cy="11.3" r="1.2" fill="#fdf4ff" />
            <circle cx="10.5" cy="15.6" r="1.3" fill="#fdf4ff" />
          </svg>
        );
      case 'deep_fish':
        return <span className="text-sm leading-none">🐠</span>;
      case 'shore_fish':
        return <span className="text-sm leading-none">🐟</span>;
      case 'gold':
        return <span className="text-sm leading-none">🪙</span>;
      case 'stone':
        return <span className="text-sm leading-none">🪨</span>;
      case 'farm':
        return <span className="text-sm leading-none">🌾</span>;
      case 'build':
        return <span className="text-sm leading-none">🔨</span>;
      case 'garrison':
        return <span className="text-sm leading-none">🛡️</span>;
      case 'attack':
        return <span className="text-sm leading-none">⚔️</span>;
      case 'rally':
        return <span className="text-sm leading-none">📍</span>;
      case 'contested':
        return <span className="text-sm leading-none">⛩️</span>;
      default:
        return <span className="text-sm leading-none">👆</span>;
    }
  };

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none ${hoverHint?.cursorClass || 'cursor-default'}`}
      style={hoverHint?.cursorCss ? { cursor: hoverHint.cursorCss } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHoverHint(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={mountRef} className="w-full h-full" />

      {/* 3D Floating Combat / XP / Tech Overlay Canvas */}
      <canvas
        ref={floatingCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {engineRef.current?.placementBuildingType === 'wall' && (
        <div
          data-wall-placement-guide="true"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none rounded-xl border border-cyan-300/40 bg-slate-950/90 px-4 py-3 text-center text-xs text-slate-100 shadow-2xl backdrop-blur-md"
        >
          <div className="mb-1 text-sm font-black text-cyan-200">🧱 城牆連續規劃</div>
          <div>左鍵設定起點　·　Shift + 左鍵固定轉折點　·　左鍵設定終點並完成</div>
          <div className="mt-1 text-slate-300">右鍵／Esc 取消規劃</div>
          {wallPlacementInfo && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/10 pt-2">
              <span>牆段 {wallPlacementInfo.segmentCount}</span>
              <span>長度 {wallPlacementInfo.distance.toFixed(1)}</span>
              <span className={wallPlacementInfo.isValid ? 'text-emerald-300' : 'text-rose-300'}>
                {wallPlacementInfo.isValid
                  ? '路線可建造'
                  : wallPlacementInfo.pointCount === 0
                    ? '等待起點'
                    : wallPlacementInfo.segmentCount === 0
                      ? '移動滑鼠拉出牆線'
                      : wallPlacementInfo.invalidCount > 0
                        ? `無效位置 ${wallPlacementInfo.invalidCount}`
                        : wallPlacementInfo.segmentCount > 120
                          ? '超過單次牆段上限'
                          : '資源不足'}
              </span>
              <span>🪵 {wallPlacementInfo.cost.wood}</span>
              <span>🪨 {wallPlacementInfo.cost.stone}</span>
            </div>
          )}
        </div>
      )}

      {/* Contextual Hover Tooltip Badge with Custom Resource Action SVG */}
      {hoverHint && !marqueeBox && !engineRef.current?.placementBuildingType && (
        <div
          data-hover-badge="true"
          data-hover-icon-kind={hoverHint.iconKind || ''}
          className={`fixed z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold shadow-xl pointer-events-none whitespace-nowrap ${toneStyles[hoverHint.tone]}`}
          style={{
            left: `${Math.min(window.innerWidth - 220, hoverHint.x + 16)}px`,
            top: `${Math.min(window.innerHeight - 44, hoverHint.y + 16)}px`,
          }}
        >
          {renderHoverIcon(hoverHint.iconKind)}
          <span>{hoverHint.badgeText}</span>
        </div>
      )}

      {/* Marquee Selection Visual Box */}
      {marqueeBox && marqueeBox.width > 2 && marqueeBox.height > 2 && (
        <div
          className="absolute border border-amber-400 bg-amber-400/15 pointer-events-none z-30"
          style={{
            left: `${marqueeBox.left}px`,
            top: `${marqueeBox.top}px`,
            width: `${marqueeBox.width}px`,
            height: `${marqueeBox.height}px`,
          }}
        />
      )}
    </div>
  );
};
