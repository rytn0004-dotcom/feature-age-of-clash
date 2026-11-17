import React, { useRef, useEffect, useState } from 'react';
import {
  Pause,
  Volume2,
  VolumeX,
  FastForward,
  Sliders,
  Shield,
  Swords,
  Crosshair,
  Zap,
  Sparkles,
  Hammer,
  Users,
  Eye,
  EyeOff,
  Crown,
  Landmark,
  X,
  Minimize2,
  Maximize2,
  Keyboard,
} from 'lucide-react';
import { RtsEngine } from '../game/engine';
import { DEFAULT_BUILDINGS } from '../game/mods';
import { BuildingType, LandmarkType } from '../types/game';
import {
  canAfford,
  getBuildingCombatStats,
  getBuildingMaxGarrison,
  getEffectiveBuildingArmor,
} from '../game/rules';
import {
  canUnitGainXp,
  findTechDef,
  getAllTechsForBuilding,
  getBuildableTypesForCiv,
  getCivilizationConfig,
  getLevelTitle,
  getXpThresholdForLevel,
  XP_ELIGIBLE_UNIT_ID,
} from '../game/civilizations';
import {
  AGE_ADVANCE_HOTKEY,
  BUILDING_HOTKEYS,
  HOTKEY_REFERENCE_GROUPS,
  TECH_SLOT_HOTKEYS,
  TRAINING_SLOT_HOTKEYS,
  UNGARRISON_HOTKEY,
} from '../game/hotkeys';

interface HUDProps {
  engine: RtsEngine;
  onPause: () => void;
  onOpenMods: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  gameSpeed: number;
  onToggleSpeed: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  engine,
  onPause,
  onOpenMods,
  isMuted,
  onToggleMute,
  gameSpeed,
  onToggleSpeed,
}) => {
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Long-lived offscreen buffers — avoid realloc on selection changes */
  const minimapStaticRef = useRef<HTMLCanvasElement | null>(null);
  const minimapDynRef = useRef<HTMLCanvasElement | null>(null);
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showHotkeysModal, setShowHotkeysModal] = useState(false);
  const [isHudCompact, setIsHudCompact] = useState(false);

  useEffect(() => {
    engine.onRequestOpenAgeModal = () => setShowAgeModal(true);
    return () => {
      engine.onRequestOpenAgeModal = undefined;
    };
  }, [engine]);

  useEffect(() => {
    if (!showHotkeysModal && !showAgeModal) return;
    const onModalKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowHotkeysModal(false);
        setShowAgeModal(false);
      }
    };
    window.addEventListener('keydown', onModalKeyDown, true);
    return () => window.removeEventListener('keydown', onModalKeyDown, true);
  }, [showHotkeysModal, showAgeModal]);

  const NEXT_AGE_INFO: Record<
    number,
    { name: string; cost: { food: number; gold: number }; landmarks: LandmarkType[] }
  > = {
    1: {
      name: '時代 II · 封建時代',
      cost: { food: 400, gold: 200 },
      landmarks: ['landmark_aachen', 'landmark_barracks'],
    },
    2: {
      name: '時代 III · 城堡時代',
      cost: { food: 1200, gold: 600 },
      landmarks: ['landmark_guildhall', 'landmark_citadel'],
    },
    3: {
      name: '時代 IV · 帝王時代',
      cost: { food: 2400, gold: 1200 },
      landmarks: ['landmark_observatory', 'landmark_arsenal'],
    },
  };

  // Format game time (MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Selected entities
  const selectedUnits = engine.selectedUnitIds
    .map((id) => engine.units.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);

  const selectedBuilding = engine.selectedBuildingId
    ? engine.buildings.find((b) => b.id === engine.selectedBuildingId)
    : null;

  const selectedNode = engine.selectedNodeId
    ? engine.resourceNodes.find((n) => n.id === engine.selectedNodeId)
    : null;

  const isSpectator = engine.isSpectatorMode;
  const observedFactionId = engine.getObservedFactionId();
  const observedParticipant = engine.getParticipant(observedFactionId);
  const observedAge = engine.ageByFaction[observedFactionId] || (isSpectator ? 1 : engine.playerAge);
  const observedRes = engine.getResourcesForFaction(observedFactionId);

  const playerUnits = engine.units.filter((u) => engine.isHumanControlled(u.faction));
  const observedUnits = engine.units.filter((u) => u.faction === observedFactionId && u.hp > 0);
  const observedPop = observedUnits.length;
  const observedMaxPop = engine.buildings
    .filter((b) => b.faction === observedFactionId && b.isConstructed)
    .reduce((acc, b) => acc + (b.buildingDef.populationProvided || 0), 10);

  const isMinimapDraggingRef = useRef(false);
  const lastGroupClickRef = useRef<{ num: number; time: number }>({ num: 0, time: 0 });

  const minimapClientToWorld = (clientX: number, clientY: number) => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const clickY = Math.max(0, Math.min(rect.height, clientY - rect.top));

    const worldX = (clickX / rect.width) * 200 - 100;
    const worldZ = (clickY / rect.height) * 200 - 100;
    return { worldX, worldZ };
  };

  const updateCameraFromMinimap = (clientX: number, clientY: number) => {
    const coords = minimapClientToWorld(clientX, clientY);
    if (!coords) return;

    (engine as any).cameraDesiredTarget = null;
    engine.cameraTarget.x = Math.max(-92, Math.min(92, coords.worldX));
    engine.cameraTarget.z = Math.max(-92, Math.min(92, coords.worldZ));
    (engine as any).updateCameraPosition?.();
  };

  const handleMinimapPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (e.button === 2) {
      e.preventDefault();
      if (isSpectator) return;
      const coords = minimapClientToWorld(e.clientX, e.clientY);
      if (coords) {
        engine.issueMinimapOrder(coords.worldX, coords.worldZ);
      }
      return;
    }
    if (e.button === 0) {
      isMinimapDraggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      updateCameraFromMinimap(e.clientX, e.clientY);
    }
  };

  const handleMinimapPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMinimapDraggingRef.current) {
      updateCameraFromMinimap(e.clientX, e.clientY);
    }
  };

  const handleMinimapPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isMinimapDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Render Minimap — static terrain cache + throttled entity layer
  useEffect(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mapSize = 200;
    const worldHalf = 100;
    const toMinimap = (x: number, z: number): [number, number] => [
      ((x + worldHalf) / mapSize) * canvas.width,
      ((z + worldHalf) / mapSize) * canvas.height,
    ];

    // Reuse long-lived offscreen buffers (resize only when display canvas size changes)
    if (!minimapStaticRef.current) minimapStaticRef.current = document.createElement('canvas');
    if (!minimapDynRef.current) minimapDynRef.current = document.createElement('canvas');
    const staticCanvas = minimapStaticRef.current;
    const dynCanvas = minimapDynRef.current;
    if (staticCanvas.width !== canvas.width || staticCanvas.height !== canvas.height) {
      staticCanvas.width = canvas.width;
      staticCanvas.height = canvas.height;
    }
    if (dynCanvas.width !== canvas.width || dynCanvas.height !== canvas.height) {
      dynCanvas.width = canvas.width;
      dynCanvas.height = canvas.height;
    }
    const staticCtx = staticCanvas.getContext('2d');
    if (!staticCtx) return;

    let cachedLayoutRef: typeof engine.mapLayout | null = null;
    let cachedPreset = '';
    let staticDirty = true;

    const rebuildStaticLayer = () => {
      const w = staticCanvas.width;
      const h = staticCanvas.height;
      staticCtx.clearRect(0, 0, w, h);

      const presetTint =
        engine.mapPreset === 'highland_basin'
          ? '#3b4a1e'
          : engine.mapPreset === 'twin_lakes'
          ? '#1e3f24'
          : '#1c3412';
      staticCtx.fillStyle = presetTint;
      staticCtx.fillRect(0, 0, w, h);

      // Grid once (cached)
      staticCtx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      staticCtx.lineWidth = 1;
      for (let i = 0; i < w; i += 40) {
        staticCtx.beginPath();
        staticCtx.moveTo(i, 0);
        staticCtx.lineTo(i, h);
        staticCtx.stroke();
        staticCtx.beginPath();
        staticCtx.moveTo(0, i);
        staticCtx.lineTo(w, i);
        staticCtx.stroke();
      }

      const layout = engine.mapLayout;
      if (!layout) return;

      staticCtx.strokeStyle = '#0284c7';
      staticCtx.lineCap = 'round';
      layout.waterRects.forEach((wr) => {
        const [rx1, ry1] = toMinimap(wr.x1, wr.z1);
        const [rx2, ry2] = toMinimap(wr.x2, wr.z2);
        const widthUnits = wr.halfWidth ? wr.halfWidth * 2 : wr.kind === 'water' ? 19.6 : 5.2;
        staticCtx.lineWidth = Math.max(4, (widthUnits / mapSize) * w);
        staticCtx.beginPath();
        staticCtx.moveTo(rx1, ry1);
        staticCtx.lineTo(rx2, ry2);
        staticCtx.stroke();
      });
      staticCtx.lineCap = 'butt';

      staticCtx.fillStyle = '#0284c7';
      layout.waterDiscs.forEach((wd) => {
        const [wx, wy] = toMinimap(wd.x, wd.z);
        const wr = (wd.radius / mapSize) * w;
        staticCtx.beginPath();
        staticCtx.arc(wx, wy, wr, 0, Math.PI * 2);
        staticCtx.fill();
      });

      layout.bridges.forEach((br) => {
        const [bx, by] = toMinimap(br.x, br.z);
        const bw = Math.max(4, ((br.halfWidth * 2) / mapSize) * w);
        const bl = Math.max(4, ((br.halfLength * 2) / mapSize) * w);
        staticCtx.save();
        staticCtx.translate(bx, by);
        staticCtx.rotate(br.angle);
        staticCtx.fillStyle = '#d6b482';
        staticCtx.fillRect(-bw / 2, -bl / 2, bw, bl);
        staticCtx.restore();
      });

      staticCtx.fillStyle = '#57534e';
      layout.cliffDiscs.forEach((cd) => {
        const [cx, cy] = toMinimap(cd.x, cd.z);
        const cr = (cd.radius / mapSize) * w;
        staticCtx.beginPath();
        staticCtx.arc(cx, cy, cr, 0, Math.PI * 2);
        staticCtx.fill();
      });
    };

    // Dynamic entity buffer (units/buildings/resources/objectives) — throttled
    const dynCtx = dynCanvas.getContext('2d');
    if (!dynCtx) return;

    let lastDynDraw = 0;
    const DYN_INTERVAL_MS = 66; // ~15 fps for entities

    const drawDynamicLayer = () => {
      const w = dynCanvas.width;
      const h = dynCanvas.height;
      dynCtx.clearRect(0, 0, w, h);

      // Resources (skip empty)
      engine.resourceNodes.forEach((node) => {
        if (node.amount <= 0) return;
        const [mx, my] = toMinimap(node.x, node.z);
        if (node.resourceType === 'wood') {
          dynCtx.fillStyle = '#15803d';
          dynCtx.beginPath();
          dynCtx.arc(mx, my, 2.7, 0, Math.PI * 2);
          dynCtx.fill();
        } else if (node.resourceType === 'gold') {
          dynCtx.fillStyle = '#fbbf24';
          dynCtx.beginPath();
          dynCtx.moveTo(mx, my - 4.2);
          dynCtx.lineTo(mx + 4.2, my);
          dynCtx.lineTo(mx, my + 4.2);
          dynCtx.lineTo(mx - 4.2, my);
          dynCtx.closePath();
          dynCtx.fill();
        } else if (node.resourceType === 'stone') {
          dynCtx.fillStyle = '#cbd5e1';
          dynCtx.fillRect(mx - 2.8, my - 2.8, 5.6, 5.6);
        } else if (node.subtype === 'berry') {
          dynCtx.fillStyle = '#fb7185';
          dynCtx.beginPath();
          dynCtx.arc(mx, my, 2.6, 0, Math.PI * 2);
          dynCtx.fill();
        } else if (node.subtype === 'hunt') {
          dynCtx.fillStyle = '#fdba74';
          dynCtx.beginPath();
          dynCtx.arc(mx, my, 2.5, 0, Math.PI * 2);
          dynCtx.fill();
        } else if (node.subtype === 'shore_fish') {
          dynCtx.fillStyle = '#38bdf8';
          dynCtx.beginPath();
          dynCtx.arc(mx, my, 2.5, 0, Math.PI * 2);
          dynCtx.fill();
        } else if (node.subtype === 'deep_fish') {
          dynCtx.fillStyle = '#0284c7';
          dynCtx.beginPath();
          dynCtx.arc(mx, my, 2.9, 0, Math.PI * 2);
          dynCtx.fill();
        } else {
          // farm / generic food
          dynCtx.fillStyle = '#a3e635';
          dynCtx.beginPath();
          dynCtx.arc(mx, my, 2.4, 0, Math.PI * 2);
          dynCtx.fill();
        }
      });

      // Contested points
      if (engine.contestedPoints) {
        engine.contestedPoints.forEach((cp) => {
          const [mx, my] = toMinimap(cp.x, cp.z);
          const owner = cp.ownerFaction;
          let fill = '#e2e8f0';
          let stroke = '#fbbf24';
          if (owner !== 'neutral') {
            const p = engine.getParticipant(owner);
            fill = p?.colorCss || '#38bdf8';
            stroke = cp.siegeSupplyActive ? '#fdba74' : '#ffffff';
          }
          const rr = Math.max(5, (cp.radius / mapSize) * w * 0.55);
          dynCtx.strokeStyle = owner === 'neutral' ? 'rgba(251,191,36,0.45)' : stroke;
          dynCtx.lineWidth = cp.siegeSupplyActive ? 2.4 : 1.2;
          dynCtx.beginPath();
          dynCtx.arc(mx, my, rr, 0, Math.PI * 2);
          dynCtx.stroke();
          if (cp.siegeSupplyActive) {
            dynCtx.strokeStyle = 'rgba(251,191,36,0.35)';
            dynCtx.lineWidth = 1;
            dynCtx.beginPath();
            dynCtx.arc(mx, my, rr + 2.5, 0, Math.PI * 2);
            dynCtx.stroke();
          }
          dynCtx.fillStyle = fill;
          dynCtx.strokeStyle = '#0f172a';
          dynCtx.lineWidth = 1.2;
          dynCtx.beginPath();
          dynCtx.moveTo(mx, my - 5);
          dynCtx.lineTo(mx + 5, my);
          dynCtx.lineTo(mx, my + 5);
          dynCtx.lineTo(mx - 5, my);
          dynCtx.closePath();
          dynCtx.fill();
          dynCtx.stroke();
          if (cp.captureProgress > 0.05 && cp.captureProgress < 1) {
            dynCtx.strokeStyle = '#fbbf24';
            dynCtx.lineWidth = 2;
            dynCtx.beginPath();
            dynCtx.arc(mx, my, 7, -Math.PI / 2, -Math.PI / 2 + cp.captureProgress * Math.PI * 2);
            dynCtx.stroke();
          }
        });
      }

      // Buildings
      engine.buildings.forEach((bldg) => {
        if (bldg.hp <= 0) return;
        const [mx, my] = toMinimap(bldg.x, bldg.z);
        const participant = engine.getParticipant(bldg.faction);
        const isFriendly = !engine.isHostileToPlayer(bldg);
        const isTC = bldg.buildingType === 'town_center';
        const size = isTC ? 10 : bldg.buildingType === 'dock' ? 8 : 7;
        dynCtx.fillStyle = participant?.colorCss || (isFriendly ? '#2563eb' : '#dc2626');
        dynCtx.strokeStyle = isFriendly ? '#ffffff' : '#0f172a';
        dynCtx.lineWidth = isTC ? 2 : 1;
        dynCtx.fillRect(mx - size / 2, my - size / 2, size, size);
        dynCtx.strokeRect(mx - size / 2, my - size / 2, size, size);
      });

      // Units
      engine.units.forEach((unit) => {
        if (unit.garrisonedInBuildingId) return;
        const [mx, my] = toMinimap(unit.x, unit.z);
        const participant = engine.getParticipant(unit.faction);
        const isFriendly = !engine.isHostileToPlayer(unit);
        const isSelected = engine.selectedUnitIds.includes(unit.id);
        const isBoat =
          !!unit.unitDef.isNaval ||
          unit.unitDefId === 'fishing_boat' ||
          unit.unitDefId === 'transport_boat';
        const cargo = unit.transportCargoIds?.length || 0;

        if (isSelected) {
          dynCtx.strokeStyle = '#fbbf24';
          dynCtx.lineWidth = 2;
          dynCtx.beginPath();
          dynCtx.arc(mx, my, isBoat ? 8 : 6, 0, Math.PI * 2);
          dynCtx.stroke();
        }

        dynCtx.fillStyle = participant?.colorCss || (isFriendly ? '#38bdf8' : '#ef4444');
        dynCtx.strokeStyle = isFriendly ? '#ffffff' : '#0f172a';
        dynCtx.lineWidth = 1;
        if (isBoat) {
          dynCtx.beginPath();
          dynCtx.ellipse(mx, my, 5.2, 3.2, 0, 0, Math.PI * 2);
          dynCtx.fill();
          dynCtx.stroke();
          if (unit.unitDefId === 'transport_boat' && cargo > 0) {
            dynCtx.fillStyle = '#fbbf24';
            dynCtx.font = 'bold 8px sans-serif';
            dynCtx.textAlign = 'center';
            dynCtx.fillText(String(cargo), mx, my + 2.5);
          }
        } else {
          dynCtx.beginPath();
          dynCtx.arc(mx, my, 3.8, 0, Math.PI * 2);
          dynCtx.fill();
          dynCtx.stroke();
        }
      });
    };

    let animId = 0;
    const drawMinimap = (now: number) => {
      // Rebuild static only when map layout / preset changes
      if (
        staticDirty ||
        engine.mapLayout !== cachedLayoutRef ||
        engine.mapPreset !== cachedPreset
      ) {
        cachedLayoutRef = engine.mapLayout;
        cachedPreset = engine.mapPreset || '';
        rebuildStaticLayer();
        staticDirty = false;
        lastDynDraw = 0; // force entity refresh
      }

      if (now - lastDynDraw >= DYN_INTERVAL_MS) {
        lastDynDraw = now;
        drawDynamicLayer();
      }

      // Composite: static + dynamic (cheap blit)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(staticCanvas, 0, 0);
      ctx.drawImage(dynCanvas, 0, 0);

      // Every frame: rally, alerts, camera (need smooth feedback)
      if (selectedBuilding?.rallyPoint) {
        const [bx, by] = toMinimap(selectedBuilding.x, selectedBuilding.z);
        const [rx, ry] = toMinimap(
          selectedBuilding.rallyPoint.x,
          selectedBuilding.rallyPoint.z
        );
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(rx, ry);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (engine.lastAttackAlert?.active) {
        const elapsed = (performance.now() - engine.lastAttackAlert.time) / 1000;
        if (elapsed < 5.0) {
          const [ax, ay] = toMinimap(engine.lastAttackAlert.x, engine.lastAttackAlert.z);
          const pulse = (elapsed * 2.5) % 1;
          const radius = 5 + pulse * 18;
          ctx.strokeStyle = `rgba(239, 68, 68, ${1 - pulse})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(ax, ay, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(ax, ay, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (engine.lastMinimapPing) {
        const elapsed = (performance.now() - engine.lastMinimapPing.time) / 1000;
        if (elapsed < 1.8) {
          const [px, py] = toMinimap(engine.lastMinimapPing.x, engine.lastMinimapPing.z);
          const isAtk = engine.lastMinimapPing.type === 'attack';
          const progress = elapsed / 1.8;
          ctx.strokeStyle = isAtk
            ? `rgba(239, 68, 68, ${1 - progress})`
            : `rgba(74, 222, 128, ${1 - progress})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 3 + progress * 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = isAtk ? '#ef4444' : '#4ade80';
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Camera viewport (smooth every frame)
      const [camX, camY] = toMinimap(engine.cameraTarget.x, engine.cameraTarget.z);
      const zScale = engine.cameraZoom || 1;
      const boxW = ((32 * zScale) / mapSize) * canvas.width;
      const boxH = ((24 * zScale) / mapSize) * canvas.height;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(camX - boxW / 2, camY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(camX - boxW / 2, camY - boxH / 2, boxW, boxH);

      animId = requestAnimationFrame(drawMinimap);
    };

    animId = requestAnimationFrame(drawMinimap);
    return () => {
      cancelAnimationFrame(animId);
      // Keep offscreen buffers in refs across selection changes; release only when HUD unmounts.
    };
  }, [engine, selectedBuilding]);

  // Release minimap offscreen backing stores when HUD leaves the tree
  useEffect(() => {
    return () => {
      if (minimapStaticRef.current) {
        minimapStaticRef.current.width = 0;
        minimapStaticRef.current.height = 0;
      }
      if (minimapDynRef.current) {
        minimapDynRef.current.width = 0;
        minimapDynRef.current.height = 0;
      }
    };
  }, []);

  const isWorkerSelected = selectedUnits.some((u) => u.unitDef.category === 'worker');
  const humanCivId = engine.getCivilizationForFaction(observedFactionId);
  const humanCiv = getCivilizationConfig(humanCivId);
  const researchedTechs = engine.getResearchedTechs(observedFactionId);
  const buildableTypes = getBuildableTypesForCiv(humanCivId);
  const compactBuildTypes: BuildingType[] = [
    humanCiv.uniqueBuildingType,
    'barracks',
    'wall',
    'tower',
    'farm',
  ];

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between select-none z-10">
      {/* ================= TOP PERIMETER STATUS CLUSTER ================= */}
      <header className="flex justify-between items-center gap-2 p-1.5 md:px-3 bg-gradient-to-b from-slate-950/85 to-transparent pointer-events-none">
        {/* Resource Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 pointer-events-auto whitespace-nowrap">
          {isSpectator && observedParticipant && (
            <div
              data-spectator-watching="true"
              className="flex items-center gap-1.5 px-2 py-1 bg-cyan-950/85 border border-cyan-500/45 rounded-lg shadow shrink-0 whitespace-nowrap"
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/60 shrink-0"
                style={{ backgroundColor: observedParticipant.colorCss }}
              />
              <span className="text-[11px] font-black text-cyan-200">
                觀戰：{observedParticipant.name}
              </span>
            </div>
          )}

          {/* Food */}
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-900/92 border border-amber-500/30 rounded-lg shadow shrink-0 whitespace-nowrap">
            <span className="text-xs">🌾</span>
            <span className="text-[11px] font-bold text-slate-300">糧食</span>
            <span className="text-xs font-extrabold text-amber-400 tabular-nums">
              {Math.floor(observedRes.food)}
            </span>
          </div>

          {/* Wood */}
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-900/92 border border-emerald-500/30 rounded-lg shadow shrink-0 whitespace-nowrap">
            <span className="text-xs">🪵</span>
            <span className="text-[11px] font-bold text-slate-300">木材</span>
            <span className="text-xs font-extrabold text-emerald-400 tabular-nums">
              {Math.floor(observedRes.wood)}
            </span>
          </div>

          {/* Gold */}
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-900/92 border border-yellow-500/30 rounded-lg shadow shrink-0 whitespace-nowrap">
            <span className="text-xs">🪙</span>
            <span className="text-[11px] font-bold text-slate-300">黃金</span>
            <span className="text-xs font-extrabold text-yellow-300 tabular-nums">
              {Math.floor(observedRes.gold)}
            </span>
          </div>

          {/* Stone */}
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-900/92 border border-slate-500/30 rounded-lg shadow shrink-0 whitespace-nowrap">
            <span className="text-xs">🪨</span>
            <span className="text-[11px] font-bold text-slate-300">石料</span>
            <span className="text-xs font-extrabold text-slate-300 tabular-nums">
              {Math.floor(observedRes.stone)}
            </span>
          </div>

          {/* Population */}
          <div className="flex items-center gap-1 px-2 py-1 bg-slate-900/92 border border-blue-500/30 rounded-lg shadow shrink-0 whitespace-nowrap">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-bold text-slate-300">人口</span>
            <span className="text-xs font-extrabold text-blue-300 tabular-nums">
              {observedPop}/{observedMaxPop}
            </span>
          </div>

          {/* Age Advancement Indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/95 border border-amber-500/50 rounded-lg shadow shrink-0 whitespace-nowrap">
            <span className="text-xs">🏛️</span>
            <span className="text-[11px] font-black text-amber-300">
              {observedAge === 1 && '時代 I · 黑暗'}
              {observedAge === 2 && '時代 II · 封建'}
              {observedAge === 3 && '時代 III · 城堡'}
              {observedAge === 4 && '時代 IV · 帝王'}
            </span>
            {!isSpectator && observedAge < 4 && (
              <button
                onClick={() => setShowAgeModal(true)}
                className="px-1.5 py-0.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[10px] rounded shadow cursor-pointer"
                title="建造時代地標晉升至下一時代 (Advance Age)"
              >
                升級 ➔
              </button>
            )}
          </div>

          {/* Civilization & Tech Summary Badge */}
          <div
            data-civ-badge="true"
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/92 border border-cyan-500/40 rounded-lg shadow shrink-0 whitespace-nowrap"
            title={humanCiv.progressionSummary}
          >
            <span className="text-xs">{humanCiv.icon}</span>
            <span className="text-[11px] font-extrabold text-white">
              {humanCiv.shortName} · <span className="text-cyan-300">科技 {researchedTechs.length}/4</span>
            </span>
          </div>

          {/* Idle Villagers Fast Access */}
          {!isSpectator && (() => {
            const idleWorkers = playerUnits.filter(
              (u) => u.unitDef.category === 'worker' && u.state === 'idle' && !u.garrisonedInBuildingId
            );
            return (
              <button
                data-cmd-idle-worker="true"
                onClick={() => engine.cycleIdleWorker()}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  idleWorkers.length > 0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30 animate-pulse'
                    : 'bg-slate-900/60 text-slate-500 border-slate-800'
                }`}
                title="點擊或按 [I] 循環定位閒置村民"
              >
                <span>💤</span>
                <span className="hidden sm:inline">閒置 [I]</span>
                <span className="tabular-nums font-black">{idleWorkers.length}</span>
              </button>
            );
          })()}
        </div>

        {/* Top-Right Utility Cluster */}
        <div className="flex items-center gap-1.5 pointer-events-auto shrink-0 whitespace-nowrap">
          {/* Game Speed */}
          <button
            onClick={onToggleSpeed}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-colors shrink-0 whitespace-nowrap"
            title="調整遊戲速度"
          >
            <FastForward className="w-3.5 h-3.5 text-amber-400" />
            <span>{gameSpeed}x</span>
          </button>

          {/* Mod Switchboard & AI Editor */}
          <button
            onClick={onOpenMods}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600/90 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg shadow cursor-pointer transition-colors shrink-0 whitespace-nowrap"
            title="開啟模組開關與戰術指令集"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">模組 & AI</span>
          </button>

          {/* Overhead Badges Toggle */}
          <button
            onClick={() => {
              engine.showOverheadBadges = !engine.showOverheadBadges;
              engine.units.forEach((u) => {
                const m = (engine as any).unitMeshes.get(u.id);
                if (m) {
                  const b = m.getObjectByName('unitBadge');
                  if (b) b.visible = engine.showOverheadBadges;
                }
              });
              engine.resourceNodes.forEach((n) => {
                const m = (engine as any).nodeMeshes.get(n.id);
                if (m) {
                  const b = m.getObjectByName('badgeSprite');
                  if (b) b.visible = engine.showOverheadBadges;
                }
              });
              engine.buildings.forEach((b) => {
                const m = (engine as any).buildingMeshes.get(b.id);
                if (m) {
                  const bBadge = m.getObjectByName('bldgBadge');
                  if (bBadge) bBadge.visible = engine.showOverheadBadges;
                }
              });
              (engine as any).onStateChange?.();
            }}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
              engine.showOverheadBadges
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="切換頭頂名稱與血量標籤 (Show/Hide Overhead Badges)"
          >
            {engine.showOverheadBadges ? <Eye className="w-3.5 h-3.5 text-amber-400" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">標籤</span>
          </button>

          {/* Mute */}
          <button
            onClick={onToggleMute}
            className="p-1.5 bg-slate-900/85 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg cursor-pointer transition-colors shrink-0"
            aria-label={isMuted ? '解除靜音' : '靜音'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Pause */}
          <button
            onClick={onPause}
            className="p-1.5 bg-slate-900/85 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg cursor-pointer transition-colors shrink-0"
            aria-label="暫停遊戲 (Esc)"
          >
            <Pause className="w-4 h-4" />
          </button>

          {/* Timer */}
          <div className="px-2.5 py-1.5 bg-slate-950/90 text-amber-400 font-mono text-xs font-bold border border-slate-800 rounded-lg shrink-0 whitespace-nowrap">
            {formatTime(engine.stats.gameDuration)}
          </div>
        </div>
      </header>

      {/* ================= DYNAMIC ALERT BANNERS ================= */}
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none">
        {/* 1. UNIFIED TACTICAL EVENT BROADCAST (Enemy spotted / Under attack / Resource depleted) */}
        {!isSpectator && (() => {
          const now = performance.now();
          const tb =
            engine.lastTacticalBroadcast && now - engine.lastTacticalBroadcast.time < 6500
              ? engine.lastTacticalBroadcast
              : engine.lastAttackAlert && engine.lastAttackAlert.active && now - engine.lastAttackAlert.time < 5000
              ? {
                  kind: 'under_attack' as const,
                  message: '⚠️ 警報：基地或部隊正在遭受敵軍攻擊！',
                  x: engine.lastAttackAlert.x,
                  z: engine.lastAttackAlert.z,
                  time: engine.lastAttackAlert.time,
                }
              : null;
          if (!tb) return null;
          const bannerStyle =
            tb.kind === 'under_attack'
              ? 'bg-red-600/95 border-red-300 text-white'
              : tb.kind === 'enemy_spotted'
              ? 'bg-amber-600/95 border-amber-200 text-slate-950'
              : 'bg-sky-700/95 border-sky-300 text-white';
          const btnStyle =
            tb.kind === 'under_attack'
              ? 'bg-white text-red-700 hover:bg-red-50'
              : tb.kind === 'enemy_spotted'
              ? 'bg-slate-950 text-amber-200 hover:bg-slate-900'
              : 'bg-white text-sky-800 hover:bg-sky-50';
          return (
            <div
              data-tactical-broadcast={tb.kind}
              className={`px-5 py-2 border font-bold text-sm rounded-full shadow-2xl flex items-center gap-3 pointer-events-auto whitespace-nowrap ${bannerStyle}`}
            >
              <span>{tb.message}</span>
              <button
                data-broadcast-focus="true"
                onClick={() => engine.setCameraFocus(tb.x, tb.z)}
                className={`px-3 py-0.5 rounded-full text-xs font-black cursor-pointer shadow ${btnStyle}`}
              >
                前往查看 ➔
              </button>
            </div>
          );
        })()}

        {/* 2. Building Placement Banner hint */}
        {engine.placementBuildingType && (
          <div className="px-6 py-2 bg-amber-500 text-slate-950 font-bold text-sm rounded-full shadow-2xl flex items-center gap-3 animate-bounce pointer-events-auto whitespace-nowrap">
            <span>🛠️ 左鍵點擊地面完成建造，右鍵或 Esc 取消</span>
            <button
              onClick={() => engine.cancelPlacement()}
              className="px-2 py-0.5 bg-slate-950 text-white rounded text-xs hover:bg-slate-800 cursor-pointer"
            >
              取消
            </button>
          </div>
        )}

        {/* 3. Attack-Move Mode Banner hint */}
        {engine.pendingCommandMode === 'attack_move' && !engine.placementBuildingType && (
          <div className="px-5 py-1.5 bg-red-900/95 border border-red-400 text-white font-bold text-xs rounded-full shadow-xl flex items-center gap-3 pointer-events-auto whitespace-nowrap">
            <span>⚔️ 攻擊推進模式：左鍵點擊目標或區域發動攻擊推進（右鍵或 Esc 取消）</span>
            <button
              onClick={() => {
                engine.pendingCommandMode = 'normal';
                engine.onSelectionChange?.();
              }}
              className="px-2 py-0.5 bg-slate-950 text-red-200 rounded text-[11px] hover:bg-slate-800 cursor-pointer"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* ================= BOTTOM UNIFIED COMMAND DOCK ================= */}
      <footer className="p-2 md:p-3 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent pointer-events-none">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-end gap-2.5 pointer-events-none">
          {/* 1. Minimap with Legend and Mouse Dragging */}
          <div className="flex flex-col gap-1 shrink-0 pointer-events-auto">
            {/* Minimap Legend */}
            <div className="flex items-center justify-between px-1.5 py-0.5 bg-slate-900/95 border border-slate-800 rounded text-[9px] text-slate-300 font-bold shadow">
              {isSpectator ? (
                <span className="text-cyan-300">🤖 全AI混戰</span>
              ) : (
                <>
                  <span className="text-blue-400">🟦 我軍</span>
                  <span className="text-red-400">🟥 敵軍</span>
                </>
              )}
              <span className="text-amber-400">🪙 金</span>
              <span className="text-emerald-400">🪵 木</span>
              <span className="text-slate-300">🪨 石</span>
            </div>

            <div className="relative w-32 h-32 md:w-36 md:h-36 bg-slate-900 border border-amber-600/70 rounded-lg overflow-hidden shadow-2xl shrink-0 touch-none">
              
              {/* Contested objectives status */}
              {engine.contestedPoints && engine.contestedPoints.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-1 px-1.5 py-1 rounded bg-slate-950/85 border border-slate-700 text-[9px] text-slate-300 space-y-0.5 pointer-events-none">
                  {engine.contestedPoints.map((cp) => {
                    const owned = cp.ownerFaction === engine.humanPlayerId;
                    const enemy =
                      cp.ownerFaction !== 'neutral' &&
                      cp.ownerFaction !== engine.humanPlayerId;
                    const tag = owned
                      ? cp.siegeSupplyActive
                        ? '補給中'
                        : '己方'
                      : enemy
                      ? '敵方'
                      : cp.captureProgress > 0.1
                      ? `爭奪 ${Math.round(cp.captureProgress * 100)}%`
                      : '中立';
                    const col = owned
                      ? 'text-sky-300'
                      : enemy
                      ? 'text-rose-300'
                      : 'text-amber-200';
                    return (
                      <div key={cp.id} className="flex justify-between gap-2">
                        <span className="truncate">◆ {cp.label}</span>
                        <span className={col}>{tag}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <canvas
                ref={minimapCanvasRef}
                width={180}
                height={180}
                onPointerDown={handleMinimapPointerDown}
                onPointerMove={handleMinimapPointerMove}
                onPointerUp={handleMinimapPointerUp}
                onPointerCancel={handleMinimapPointerUp}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full h-full cursor-crosshair"
                title={
                  isSpectator
                    ? '戰術雷達小地圖：左鍵點擊/拖曳捲動觀戰視角'
                    : '戰術雷達小地圖：左鍵點擊/拖曳捲動視角 · 右鍵直接下達移動或攻擊指令'
                }
              />
              <div className="absolute top-0.5 left-1.5 text-[9px] font-bold text-amber-400/90 uppercase tracking-widest pointer-events-none drop-shadow">
                RADAR
              </div>
              {!isSpectator && (
                <div className="absolute bottom-0.5 right-1 text-[8px] font-semibold text-slate-200/80 pointer-events-none drop-shadow">
                  右鍵指揮
                </div>
              )}
            </div>
          </div>

          {/* 2. Middle Selection, Control Groups (or Spectator Switcher) & Command Center */}
          <div className="flex-1 w-full flex flex-col gap-1.5 pointer-events-none">
            {isSpectator ? (
              <div
                data-spectator-bar="true"
                className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1.5 bg-slate-950/92 border border-cyan-500/40 rounded-lg pointer-events-auto shadow"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-black text-cyan-300 flex items-center gap-1 mr-0.5">
                    <span>👁️ 全 AI 觀戰</span>
                  </span>
                  {engine.participants.map((p) => {
                    const pCiv = getCivilizationConfig(p.civilization);
                    const pUnits = engine.units.filter((u) => u.faction === p.id && u.hp > 0);
                    const pBuildings = engine.buildings.filter((b) => b.faction === p.id && b.hp > 0);
                    const pWorkers = pUnits.filter((u) => u.unitDef.category === 'worker').length;
                    const pArmy = pUnits.length - pWorkers;
                    const isAlive = pUnits.length > 0 || pBuildings.length > 0;
                    const isWatched = p.id === observedFactionId;
                    const pAge = engine.ageByFaction[p.id] || 1;
                    return (
                      <button
                        key={p.id}
                        data-spectator-faction={p.id}
                        onClick={() => engine.setObservedFaction(p.id, true)}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition-all ${
                          isWatched
                            ? 'bg-cyan-500/20 text-white border-cyan-400 shadow'
                            : isAlive
                            ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                            : 'bg-slate-950/70 text-slate-500 border-slate-800 opacity-60'
                        }`}
                        title={`點擊追蹤 ${p.name} (${pCiv.shortName} · 第 ${p.team} 隊 · 時代 ${pAge})`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/50"
                          style={{ backgroundColor: p.colorCss }}
                        />
                        <span>{pCiv.icon}</span>
                        <span className="truncate max-w-[85px]">{p.name}</span>
                        <span className="text-[9px] px-1 rounded bg-slate-950/90 text-slate-300 font-mono">
                          隊{p.team}
                        </span>
                        {isAlive ? (
                          <span className="text-[9px] font-mono text-amber-300">
                            👷{pWorkers} ⚔️{pArmy}
                          </span>
                        ) : (
                          <span className="text-[9px] text-red-400">已淘汰</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setIsHudCompact(!isHudCompact)}
                  className="px-2 py-0.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700/70 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                  title={isHudCompact ? '展開完整觀戰面板' : '縮小面板以擴大戰場視野'}
                >
                  {isHudCompact ? <Maximize2 className="w-3 h-3 text-amber-400" /> : <Minimize2 className="w-3 h-3" />}
                  <span>{isHudCompact ? '展開' : '極簡'}</span>
                </button>
              </div>
            ) : (
            /* Control Groups Bar (編選隊列 1-9) */
            <div className="flex flex-wrap items-center justify-between gap-1 px-2 py-1 bg-slate-950/90 border border-slate-800 rounded-lg pointer-events-auto shadow">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] font-bold text-amber-400 mr-1">編隊</span>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
                  const members = engine.controlGroups[num] || [];
                  const count = members.length;
                  const isActiveGroup =
                    count > 0 &&
                    selectedUnits.length > 0 &&
                    members.every((id) => engine.selectedUnitIds.includes(id));

                  return (
                    <div key={num} className="flex items-center">
                      <button
                        data-control-group={num}
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) {
                            engine.assignControlGroup(num, false);
                            return;
                          }
                          if (e.shiftKey) {
                            engine.assignControlGroup(num, true);
                            return;
                          }
                          if (count === 0 && selectedUnits.length > 0) {
                            engine.assignControlGroup(num, false);
                            return;
                          }
                          const now = performance.now();
                          const isDouble =
                            lastGroupClickRef.current.num === num &&
                            now - lastGroupClickRef.current.time < 360;
                          lastGroupClickRef.current = { num, time: now };
                          engine.selectControlGroup(num, isDouble);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (selectedUnits.length > 0) {
                            engine.assignControlGroup(num, false);
                          }
                        }}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition-colors ${
                          isActiveGroup
                            ? 'bg-amber-500 text-slate-950 border-amber-300'
                            : count > 0
                            ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/40'
                            : selectedUnits.length > 0
                            ? 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-700 border-dashed'
                            : 'bg-slate-900/60 text-slate-600 border-slate-800'
                        }`}
                        title={
                          count > 0
                            ? `隊列 ${num} (${count} 單位)：左鍵選取 (連按定位) · Shift+點擊編入 · 右鍵重設`
                            : selectedUnits.length > 0
                            ? `點擊將目前選取單位編為第 ${num} 隊列 (Ctrl+${num})`
                            : `第 ${num} 隊列 (空)`
                        }
                      >
                        <span className="font-mono">{num}</span>
                        {count > 0 && <span className="text-[9px] font-mono opacity-90">({count})</span>}
                      </button>
                      {selectedUnits.length > 0 && count > 0 && (
                        <button
                          data-control-group-add={num}
                          onClick={() => engine.assignControlGroup(num, true)}
                          className="ml-0.5 px-1 py-0.5 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded text-[9px] font-black cursor-pointer"
                          title={`將選取單位編入第 ${num} 隊列 (Shift+${num})`}
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  data-quick-tc="true"
                  onClick={() => engine.cycleBuildingByKind('town_center')}
                  className="px-1.5 py-0.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-[10px] font-bold cursor-pointer shrink-0"
                  title="快速選取並聚焦城鎮中心 [H]"
                >
                  🏛️ 主堡[H]
                </button>
                <button
                  data-quick-military-bldg="true"
                  onClick={() => engine.cycleBuildingByKind('military')}
                  className="px-1.5 py-0.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-[10px] font-bold cursor-pointer shrink-0"
                  title="循環選取兵營/軍事建築 [B]"
                >
                  ⚔️ 軍營[B]
                </button>
                <button
                  data-quick-all-army="true"
                  onClick={() => engine.selectAllMilitary()}
                  className="px-1.5 py-0.5 bg-red-950/80 hover:bg-red-900/80 text-red-200 rounded border border-red-500/40 text-[10px] font-bold cursor-pointer shrink-0"
                  title="一鍵全選所有作戰部隊 [Space]"
                >
                  🛡️ 全軍[Space]
                </button>
                <button
                  data-open-hotkeys="true"
                  onClick={() => setShowHotkeysModal(true)}
                  className="px-1.5 py-0.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 rounded border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  title="查看完整編隊與操作快捷鍵"
                >
                  <Keyboard className="w-3 h-3" />
                  <span className="hidden sm:inline">快捷鍵</span>
                </button>
                <button
                  onClick={() => setIsHudCompact(!isHudCompact)}
                  className="px-2 py-0.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700/70 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                  title={isHudCompact ? '展開完整操作面板' : '縮小面板以擴大戰場視野'}
                >
                  {isHudCompact ? <Maximize2 className="w-3 h-3 text-amber-400" /> : <Minimize2 className="w-3 h-3" />}
                  <span>{isHudCompact ? '展開' : '極簡'}</span>
                </button>
              </div>
            </div>
            )}

          <div className="relative w-full bg-slate-900/95 border border-slate-800 rounded-lg p-2.5 shadow-xl flex flex-col justify-between pointer-events-auto min-h-[92px] transition-all">

            {isHudCompact ? (
              <div className="flex items-center justify-between gap-3 h-full pr-14 py-1">
                {selectedUnits.length > 0 && (
                  <div className="flex items-center gap-3 w-full">
                    <span className="font-bold text-white text-xs truncate max-w-[130px]">
                      {selectedUnits.length === 1 ? selectedUnits[0].unitDef.name : `${selectedUnits[0].unitDef.name} (${selectedUnits.length})`}
                    </span>
                    {canUnitGainXp(selectedUnits[0].unitDefId, engine.getCivilizationForFaction(selectedUnits[0].faction)) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold shrink-0">
                        Lv.{selectedUnits[0].level || 1}
                      </span>
                    )}
                    <div className="w-20 sm:w-28 h-2 bg-slate-800 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, (selectedUnits[0].hp / selectedUnits[0].maxHp) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-300 font-mono shrink-0">{Math.round(selectedUnits[0].hp)}/{selectedUnits[0].maxHp}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 truncate font-semibold border border-slate-700 max-w-[180px]">
                      {selectedUnits[0].currentActionText || (selectedUnits[0].state === 'idle' ? '💤 待命' : '行動中')}
                    </span>
                    {isWorkerSelected && (
                      <div className="flex gap-1 ml-auto shrink-0">
                        {compactBuildTypes.map((bType) => {
                          const bDef = DEFAULT_BUILDINGS[bType];
                          const canBuild = canAfford(engine.playerResources, bDef.cost);
                          return (
                            <button
                              key={bType}
                              onClick={() => engine.startPlacement(bType)}
                              disabled={!canBuild}
                              className={`px-2 py-0.5 disabled:opacity-40 text-[10px] font-bold rounded border cursor-pointer ${
                                bDef.civExclusive
                                  ? 'bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border-cyan-500/60'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                              }`}
                            >
                              +{bDef.name.split(' ')[0]}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {!selectedUnits.length && selectedBuilding && (
                  <div className="flex items-center gap-3 w-full">
                    <span className="font-bold text-white text-xs">{selectedBuilding.buildingDef.name}</span>
                    <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-blue-500" style={{ width: `${Math.max(0, (selectedBuilding.hp / selectedBuilding.maxHp) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-300 font-mono shrink-0">{selectedBuilding.hp}/{selectedBuilding.maxHp}</span>
                    {selectedBuilding.rallyPoint && (
                      <span className="text-[10px] text-amber-400">📍 集結點已設</span>
                    )}
                    {selectedBuilding.isConstructed && selectedBuilding.buildingDef.trainableUnits.length > 0 && (
                      <div className="flex gap-1 ml-auto shrink-0">
                        {selectedBuilding.buildingDef.trainableUnits.map((uId) => {
                          const uDef = engine.findUnitDef(uId);
                          if (!uDef) return null;
                          return (
                            <button
                              key={uId}
                              onClick={() => engine.trainUnit(selectedBuilding.id, uId)}
                              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-amber-300 rounded border border-slate-700 cursor-pointer"
                            >
                              招募{uDef.name.slice(0, 2)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {!selectedUnits.length && !selectedBuilding && selectedNode && (
                  <div className="flex items-center gap-3 w-full">
                    <span className="text-xs font-bold text-white">
                      {selectedNode.subtype === 'berry'
                        ? '🫐 野生漿果'
                        : selectedNode.subtype === 'hunt'
                        ? '🦌 野生鹿群'
                        : selectedNode.resourceType === 'gold'
                        ? '🪙 金礦'
                        : selectedNode.resourceType === 'wood'
                        ? '🪵 森林'
                        : selectedNode.resourceType === 'stone'
                        ? '🪨 石料'
                        : '🌾 農田'}
                    </span>
                    <div className="w-28 h-2 bg-slate-800 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-amber-400" style={{ width: `${(selectedNode.amount / selectedNode.maxAmount) * 100}%` }} />
                    </div>
                    <span className="text-xs text-amber-300 font-mono font-bold">{Math.round(selectedNode.amount)}/{selectedNode.maxAmount}</span>
                  </div>
                )}
                {!selectedUnits.length && !selectedBuilding && !selectedNode && (
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>🔍 極簡模式：點擊戰場單位或建築即可顯示控制項</span>
                  </div>
                )}
              </div>
            ) : (
              <>
            {/* If a Single or Multiple Units are selected */}
            {selectedUnits.length > 0 && (() => {
              const primary = selectedUnits[0];
              const primaryCiv = engine.getCivilizationForFaction(primary.faction);
              const xpEligible = canUnitGainXp(primary.unitDefId, primaryCiv);
              const lvl = primary.level || 1;
              const xp = primary.xp || 0;
              const curFloor = getXpThresholdForLevel(lvl);
              const nextCap = getXpThresholdForLevel(Math.min(5, lvl + 1));
              const xpPct = lvl >= 5 ? 100 : Math.min(100, Math.max(0, ((xp - curFloor) / Math.max(1, nextCap - curFloor)) * 100));
              const hasAuraBuff = !!(primary.buffSpeedUntil && primary.buffSpeedUntil > (engine as any).simTime);

              return (
              <div className="flex flex-col md:flex-row gap-3 h-full">
                {/* Unit Details */}
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: primary.unitDef.visual.color }} />
                      <span className="font-bold text-white text-sm">
                        {selectedUnits.length === 1
                          ? primary.unitDef.name
                          : `${primary.unitDef.name} 等 ${selectedUnits.length} 名部隊`}
                      </span>
                      {xpEligible && (
                        <span
                          data-xp-level-badge="true"
                          className="text-[11px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded font-bold"
                        >
                          Lv.{lvl} {getLevelTitle(lvl)}
                        </span>
                      )}
                      {hasAuraBuff && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded font-bold">
                          ⚡ 光環強化中
                        </span>
                      )}
                    </div>

                    {primary.kills > 0 && (
                      <span className="text-xs text-amber-400 font-bold shrink-0">
                        ⚔️ 擊殺: {primary.kills}
                      </span>
                    )}
                  </div>

                  {/* Real-time Action Status Badge */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400 font-medium">狀態:</span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold shadow-sm ${
                        primary.lastDamagedTime && performance.now() - primary.lastDamagedTime < 2500
                          ? 'bg-red-500/30 text-red-300 border border-red-500/60 animate-pulse'
                          : primary.state === 'attacking'
                          ? 'bg-red-950/70 text-red-300 border border-red-700/60'
                          : primary.state === 'gathering'
                          ? 'bg-amber-950/70 text-amber-300 border border-amber-700/60'
                          : primary.state === 'returning_resource'
                          ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/60'
                          : primary.state === 'garrisoning'
                          ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-600/60'
                          : primary.state === 'building'
                          ? 'bg-blue-950/70 text-blue-300 border border-blue-700/60'
                          : primary.state === 'moving'
                          ? 'bg-sky-950/70 text-sky-300 border border-sky-700/60'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {primary.lastDamagedTime && performance.now() - primary.lastDamagedTime < 2500
                        ? '⚠️ 正在遭受敵軍攻擊！'
                        : primary.currentActionText || (primary.state === 'idle' ? '💤 待命中 (閒置)' : '行動中')}
                    </span>

                    {primary.carryingResource && primary.carryingResource.amount > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 font-mono font-bold">
                        📦 {Math.round(primary.carryingResource.amount)}/{primary.unitDef.stats.carryCapacity}{' '}
                        {primary.carryingResource.type === 'gold'
                          ? '黃金'
                          : primary.carryingResource.type === 'wood'
                          ? '木材'
                          : primary.carryingResource.type === 'stone'
                          ? '石料'
                          : '糧食'}
                      </span>
                    )}
                  </div>

                  {/* HP & Exclusive Saiyan XP Progress Bars */}
                  <div className={`grid grid-cols-1 ${xpEligible ? 'sm:grid-cols-2' : ''} gap-2`}>
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>生命值</span>
                        <span className="font-mono font-bold">
                          {Math.round(primary.hp)} / {primary.maxHp}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.max(0, (primary.hp / primary.maxHp) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {xpEligible && (
                      <div className="space-y-0.5" data-xp-bar="true">
                        <div className="flex justify-between text-[11px] text-amber-300/90">
                          <span>歷練覺醒 (XP)</span>
                          <span className="font-mono font-bold">
                            {lvl >= 5 ? 'MAX 自在極意' : `${Math.round(xp)} / ${nextCap}`}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 transition-all"
                            style={{ width: `${xpPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Combat Stats Grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs pt-0.5">
                    <div className="flex items-center gap-1 text-slate-300">
                      <Swords className="w-3.5 h-3.5 text-red-400" />
                      <span>攻: {primary.unitDef.stats.attack}</span>
                    </div>
                    <div
                      className="flex items-center gap-1 text-orange-300"
                      title={
                        primary.unitDef.stats.ignoresBuildingArmor
                          ? '真實攻城傷害：無視建築城牆護甲'
                          : '對建築造成火把/拆毀傷害（受建築城甲減免）'
                      }
                    >
                      <span>🔥</span>
                      <span>
                        攻城: {primary.unitDef.stats.buildingAttack ?? Math.max(2, Math.round(primary.unitDef.stats.attack * 0.45))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      <span>
                        防: {primary.unitDef.stats.defense}
                        {primary.unitDef.stats.rangedDefense ? ` (+${primary.unitDef.stats.rangedDefense}矢)` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300">
                      <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                      <span>距: {primary.unitDef.stats.range}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300">
                      <Zap className="w-3.5 h-3.5 text-purple-400" />
                      <span>速: {primary.unitDef.stats.speed}</span>
                    </div>
                  </div>
                </div>

                {/* Worker Construction Actions or Military Abilities */}
                <div className="border-t md:border-t-0 md:border-l border-slate-800 md:pl-3 flex flex-col justify-center">
                  {isWorkerSelected ? (
                    <div>
                      <div className="text-xs font-bold text-amber-400 mb-1 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1">
                          <Hammer className="w-3.5 h-3.5" /> {humanCiv.shortName}建造選單
                        </span>
                        <button
                          onClick={() => engine.stopSelectedUnits()}
                          className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[10px] font-bold cursor-pointer"
                        >
                          [X] 停止
                        </button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
                        {buildableTypes.map((bType) => {
                          const bDef = DEFAULT_BUILDINGS[bType];
                          const ageLocked = !!(bDef.requiredAge && observedAge < bDef.requiredAge);
                          const canBuild = canAfford(engine.playerResources, bDef.cost);
                          const isCivUnique = !!bDef.civExclusive;
                          const hotkey = BUILDING_HOTKEYS[bType];
                          return (
                            <button
                              key={bType}
                              data-build-type={bType}
                              onClick={() => engine.startPlacement(bType)}
                              disabled={!canBuild || ageLocked}
                              className={`relative flex flex-col items-center py-1 px-1 rounded border text-[10px] font-semibold transition-all ${
                                ageLocked
                                  ? 'opacity-45 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
                                  : !canBuild
                                  ? 'opacity-40 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
                                  : isCivUnique
                                  ? 'bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-200 border-cyan-400/70 shadow cursor-pointer'
                                  : bType === 'castle'
                                  ? 'bg-amber-950/60 hover:bg-amber-900/70 text-amber-200 border-amber-500/70 shadow cursor-pointer'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700/60 cursor-pointer'
                              }`}
                              title={`${bDef.name}${hotkey ? ` [${hotkey}]` : ''} - ${bDef.description}`}
                            >
                              <span className="truncate max-w-full flex items-center gap-0.5 font-bold">
                                {hotkey && !ageLocked && (
                                  <span className="text-[9px] font-mono px-1 rounded bg-slate-950/80 text-amber-300 border border-slate-700">
                                    {hotkey}
                                  </span>
                                )}
                                {isCivUnique && '✦'}
                                {bType === 'castle' && '🏰'}
                                {bType === 'dock' && '⚓'}
                                {bDef.name.split(' ')[0]}
                              </span>
                              <span className="text-[9px] text-amber-400 font-mono">
                                {ageLocked
                                  ? `🔒時代${bDef.requiredAge}`
                                  : `${bDef.cost.wood ? `${bDef.cost.wood}W` : ''}${bDef.cost.gold ? ` ${bDef.cost.gold}G` : ''}${bDef.cost.stone ? ` ${bDef.cost.stone}S` : ''}`}
                              </span>
                            </button>
                          );
                        })}
                        {/* Final Cell: Landmark Advancement */}
                        {engine.playerAge < 4 ? (
                          <button
                            onClick={() => setShowAgeModal(true)}
                            className="flex flex-col items-center justify-center py-1 px-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded border border-amber-300 text-[10px] font-black shadow transition-all cursor-pointer"
                            title={`建造時代地標 (晉升時代) [${AGE_ADVANCE_HOTKEY}]`}
                          >
                            <span className="flex items-center gap-0.5">
                              <span className="text-[9px] font-mono px-1 rounded bg-slate-950 text-amber-300">
                                {AGE_ADVANCE_HOTKEY}
                              </span>
                              🏛️地標
                            </span>
                            <span className="text-[9px] text-slate-900 font-mono font-extrabold">晉升時代</span>
                          </button>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-1 px-1 bg-slate-900/40 border border-slate-800 text-slate-500 rounded text-[10px]">
                            <span>🏛️ 最高</span>
                            <span className="text-[9px]">帝王時代</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 min-w-[230px]">
                      <div className="text-xs font-bold text-slate-400">作戰指令與主動奧義 (Tactics)</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          data-cmd-attack-move="true"
                          onClick={() => {
                            engine.pendingCommandMode =
                              engine.pendingCommandMode === 'attack_move' ? 'normal' : 'attack_move';
                            engine.onSelectionChange?.();
                          }}
                          className={`px-2.5 py-1.5 rounded text-xs font-bold border cursor-pointer transition-colors ${
                            engine.pendingCommandMode === 'attack_move'
                              ? 'bg-red-600 text-white border-red-300 shadow'
                              : 'bg-slate-800 hover:bg-slate-700 text-red-300 border-red-500/40'
                          }`}
                          title="指定目標區域警戒行軍並自動交戰 (快捷鍵 F)"
                        >
                          [F] 攻擊推進
                        </button>
                        <button
                          data-cmd-stop="true"
                          onClick={() => engine.stopSelectedUnits()}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold border border-slate-700 cursor-pointer"
                          title="立即停止當前指令 (快捷鍵 X)"
                        >
                          [X] 停止
                        </button>
                        {primary.unitDef.specialAbility && (() => {
                          const ab = primary.unitDef.specialAbility!;
                          const cd = primary.abilityCooldown;
                          const ready = cd <= 0;
                          return (
                            <button
                              data-cmd-ability="true"
                              disabled={!ready}
                              onClick={() => engine.activateSelectedUnitsAbility()}
                              className={`px-2.5 py-1.5 rounded text-xs font-bold shadow flex items-center gap-1 transition-all ${
                                ready
                                  ? 'bg-purple-700 hover:bg-purple-600 text-white border border-purple-400 cursor-pointer'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                              }`}
                              title={ab.description}
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>
                                [Q] {ab.name} {ready ? '' : `(${cd.toFixed(1)}s)`}
                              </span>
                            </button>
                          );
                        })()}
                      </div>


                      {primary.unitDefId === 'transport_boat' && (
                        <div className="text-[10px] text-sky-300">
                          載員 {(primary.transportCargoIds?.length || 0)}/{primary.unitDef.stats.carryCapacity || 5}
                          {(primary.transportCargoIds?.length || 0) > 0 ? ' · 可卸載' : ' · 點選陸軍再點此船登船'}
                        </div>
                      )}

                      {primary.unitDefId === 'transport_boat' && (primary.transportCargoIds?.length || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            engine.unloadTransport(primary);
                            engine.onSelectionChange?.();
                          }}
                          className="mt-1 w-full text-[11px] py-1 rounded bg-sky-700 hover:bg-sky-600 text-white border border-sky-400/40"
                        >
                          卸載登陸 (U)
                        </button>
                      )}

                      {/* Assault / objective status */}
                      {(() => {
                        const ch = primary.siegeChannelTime || 0;
                        const digPct = Math.min(100, Math.round((ch / 12) * 100));
                        const hasSupply = engine.contestedPoints?.some(
                          (p) => p.ownerFaction === primary.faction && p.siegeSupplyActive
                        );
                        const ownedShrines = engine.contestedPoints?.filter(
                          (p) => p.ownerFaction === engine.humanPlayerId
                        ).length || 0;
                        if (digPct < 8 && !hasSupply && ownedShrines === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1.5 text-[10px]">
                            {digPct >= 8 && primary.unitDef.category !== 'siege' && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-200 border border-amber-700/40">
                                掘進 {digPct}%
                              </span>
                            )}
                            {hasSupply && (
                              <span className="px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-200 border border-orange-700/40">
                                攻城補給
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {primary.unitDef.specialAbility && (
                        <div className="text-[10px] text-purple-300/90 leading-tight">
                          ✦ {primary.unitDef.specialAbility.description}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })()}

            {/* If a Building is selected */}
            {!selectedUnits.length && selectedBuilding && (() => {
              const bCiv = selectedBuilding.civilization || humanCivId;
              const bldgTechs = getAllTechsForBuilding(selectedBuilding.buildingType, bCiv);
              const bldgResearched = engine.getResearchedTechs(selectedBuilding.faction);
              const activeTech = selectedBuilding.activeTechId ? findTechDef(selectedBuilding.activeTechId) : null;
              const bFactionAge = engine.ageByFaction[selectedBuilding.faction] || observedAge;
              const bArmor = getEffectiveBuildingArmor(selectedBuilding, bFactionAge, bldgResearched);
              const bCombatStats = getBuildingCombatStats(
                selectedBuilding,
                engine.units,
                bFactionAge,
                bldgResearched
              );
              const gMax = getBuildingMaxGarrison(selectedBuilding);
              const gCount = selectedBuilding.garrisonedUnitIds?.length || 0;
              const garrisonUnits = (selectedBuilding.garrisonedUnitIds || [])
                .map((uid) => engine.units.find((u) => u.id === uid && u.hp > 0))
                .filter((u): u is NonNullable<typeof u> => !!u);

              return (
              <div className="flex flex-col md:flex-row gap-3 h-full">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1 gap-2">
                    <span className="font-bold text-white text-sm">
                      {selectedBuilding.buildingDef.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        data-building-armor="true"
                        className="text-[11px] px-2 py-0.5 bg-slate-800 text-sky-300 border border-slate-700 font-mono rounded font-bold"
                        title="建築城牆護甲：減免一般士兵的拆屋傷害，需靠攻城器械破防"
                      >
                        🧱 城甲: {bArmor}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-slate-800 text-amber-400 font-mono rounded">
                        {selectedBuilding.isConstructed
                          ? '運作中'
                          : `建造中 ${Math.round(selectedBuilding.buildProgress * 100)}%`}
                      </span>
                    </div>
                  </div>

                  {/* Building Combat & Defense Stats Inspection */}
                  <div
                    data-building-stats-grid="true"
                    className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 px-2 py-1 rounded bg-slate-950/75 border border-slate-800 text-[10px]"
                  >
                    <div className="flex flex-col">
                      <span className="text-slate-400">⚔️ 攻擊力</span>
                      <span className="font-mono font-bold text-amber-300">{bCombatStats.attackDisplay}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-400">🎯 攻擊方式</span>
                      <span className="font-bold text-slate-200 leading-tight" title={bCombatStats.attackMethod}>
                        {bCombatStats.attackMethod}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-400">🔥 攻擊類型</span>
                      <span className="font-bold text-orange-300 leading-tight" title={bCombatStats.attackType}>
                        {bCombatStats.attackType}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-400">📏 攻擊範圍</span>
                      <span className="font-mono font-bold text-cyan-300">
                        {bCombatStats.range > 0 ? `${bCombatStats.range} 格` : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-400">🛡️ 防禦／城甲</span>
                      <span className="font-mono font-bold text-sky-300">
                        城甲 {bCombatStats.buildingArmor}
                      </span>
                    </div>
                  </div>

                  {/* Rally Point Marker Indicator */}
                  {selectedBuilding.buildingDef.trainableUnits.length > 0 && (
                    <div
                      data-rally-info="true"
                      className={`flex items-center justify-between px-2 py-1 rounded-lg text-[11px] border ${
                        selectedBuilding.rallyPoint?.targetResourceNodeId
                          ? 'bg-emerald-950/60 border-emerald-500/45'
                          : selectedBuilding.rallyPoint?.targetBuildingId
                          ? 'bg-sky-950/60 border-sky-500/45'
                          : 'bg-slate-950/70 border-amber-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{selectedBuilding.rallyPoint?.targetResourceNodeId ? '⛏️' : '📍'}</span>
                        <span className="text-slate-300 font-bold">集結點:</span>
                        <span
                          className={`font-mono font-black ${
                            selectedBuilding.rallyPoint?.targetResourceNodeId
                              ? 'text-emerald-300'
                              : selectedBuilding.rallyPoint?.targetBuildingId
                              ? 'text-sky-300'
                              : 'text-amber-300'
                          }`}
                        >
                          {selectedBuilding.rallyPoint
                            ? selectedBuilding.rallyPoint.label
                              ? `${selectedBuilding.rallyPoint.label} (${Math.round(selectedBuilding.rallyPoint.x)}, ${Math.round(selectedBuilding.rallyPoint.z)})`
                              : `(${Math.round(selectedBuilding.rallyPoint.x)}, ${Math.round(selectedBuilding.rallyPoint.z)})`
                            : '預設門口'}
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400 font-medium">
                        {selectedBuilding.buildingType === 'town_center'
                          ? '右鍵點資源/農田可自動採集'
                          : '右鍵點擊地面重設'}
                      </span>
                    </div>
                  )}

                  {/* HP Bar */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[11px] text-slate-300">
                      <span>結構耐久度</span>
                      <span className="font-mono font-bold">
                        {Math.round(selectedBuilding.hp)} / {selectedBuilding.maxHp}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${Math.max(0, (selectedBuilding.hp / selectedBuilding.maxHp) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Garrison Shelter Panel */}
                  {selectedBuilding.isConstructed && gMax > 0 && (
                    <div
                      data-garrison-panel="true"
                      className="flex flex-col gap-1.5 px-2 py-1.5 rounded-lg bg-sky-950/45 border border-sky-500/40 text-[11px]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sky-200">
                            🛡️ 駐防庇護: <strong className="font-mono text-white">{gCount}/{gMax}</strong>
                          </span>
                          <span className="text-[10px] text-sky-300/90">
                            {selectedBuilding.buildingDef.canGarrisonAttack
                              ? gCount > 0
                                ? '🏹 矢箭齊發強化中（放出優先朝集結點）'
                                : '駐軍可開火防禦'
                              : '💚 避戰療傷中（放出優先朝集結點）'}
                          </span>
                        </div>
                        {!isSpectator && (
                          <div className="flex items-center gap-1.5">
                            <button
                              data-cmd-ungarrison="true"
                              disabled={gCount === 0}
                              onClick={() => engine.ungarrisonAll(selectedBuilding.id)}
                              className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-black rounded text-[10px] cursor-pointer"
                              title={`撤出此建築內所有駐防單位並優先從集結點方向離場 [${UNGARRISON_HOTKEY}]`}
                            >
                              🚪 全部撤出 [{UNGARRISON_HOTKEY}]
                            </button>
                            {selectedBuilding.buildingType === 'town_center' && (
                              <button
                                data-cmd-town-bell="true"
                                onClick={() => engine.ringTownBell(selectedBuilding.id)}
                                className="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white font-black rounded text-[10px] cursor-pointer"
                                title="敲響城鎮鐘聲：召回附近村民避難，或再次敲響全員撤出復工"
                              >
                                🔔 鐘聲避難
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {garrisonUnits.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {garrisonUnits.map((u) => (
                            <button
                              key={u.id}
                              data-ungarrison-unit={u.id}
                              disabled={isSpectator}
                              onClick={() => engine.ungarrisonUnit(selectedBuilding.id, u.id)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/90 hover:bg-sky-900/80 disabled:hover:bg-slate-900/90 border border-sky-400/45 text-[10px] text-sky-100 cursor-pointer disabled:cursor-default"
                              title={isSpectator ? `${u.unitDef.name}` : `點擊單獨放出「${u.unitDef.name}」（優先從集結點出口出現）`}
                            >
                              <span className="font-bold">{u.unitDef.name.split(' ')[0]}</span>
                              <span className="text-[9px] font-mono text-emerald-300">{Math.round(u.hp)}HP</span>
                              {!isSpectator && <span className="text-amber-300 font-black ml-0.5">✕</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Active Tech Research Progress */}
                  {activeTech && (
                    <div className="text-[11px] text-cyan-300 space-y-0.5">
                      <div className="flex justify-between">
                        <span>{activeTech.icon} 研發中：{activeTech.name}</span>
                        <span className="font-mono font-bold">{Math.round((selectedBuilding.researchProgress || 0) * 100)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 transition-all"
                          style={{ width: `${Math.min(100, (selectedBuilding.researchProgress || 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Production Queue with Per-Unit Cancellation */}
                  {selectedBuilding.queue.length > 0 && (
                    <div data-production-queue="true" className="text-[11px] text-amber-300 space-y-1 bg-amber-950/25 border border-amber-500/30 rounded-lg px-2 py-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-bold">⚙️ 生產中單位隊列 ({selectedBuilding.queue.length})</span>
                        <span className="font-mono font-bold">{Math.round(selectedBuilding.queueProgress * 100)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 transition-all"
                          style={{ width: `${selectedBuilding.queueProgress * 100}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {selectedBuilding.queue.map((qUnitId, qIdx) => {
                          const qDef = engine.findUnitDef(qUnitId, selectedBuilding.faction);
                          const qLabel = qDef ? qDef.name.split(' ')[0] : qUnitId;
                          return (
                            <button
                              key={`${qUnitId}-${qIdx}`}
                              data-cancel-queue-idx={qIdx}
                              disabled={isSpectator}
                              onClick={() => engine.cancelTrainingAt(selectedBuilding.id, qIdx)}
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                                qIdx === 0
                                  ? 'bg-amber-500/20 hover:bg-red-950/80 border-amber-400/70 hover:border-red-400 text-amber-100'
                                  : 'bg-slate-900/90 hover:bg-red-950/80 border-slate-700 hover:border-red-400 text-slate-200'
                              } ${isSpectator ? 'cursor-default' : 'cursor-pointer'}`}
                              title={isSpectator ? qLabel : `點擊取消訓練「${qLabel}」並全額退還資源`}
                            >
                              <span className="font-bold">
                                {qIdx === 0 ? '▶ ' : `#${qIdx + 1} `}
                                {qLabel}
                              </span>
                              {qIdx === 0 && (
                                <span className="font-mono text-[9px] text-amber-300">
                                  {Math.round(selectedBuilding.queueProgress * 100)}%
                                </span>
                              )}
                              {!isSpectator && <span className="text-red-300 font-black ml-0.5">✕ 取消</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Pane: Unit Training & Civilization Tech Research */}
                {selectedBuilding.isConstructed &&
                  (selectedBuilding.buildingDef.trainableUnits.length > 0 ||
                    bldgTechs.length > 0 ||
                    selectedBuilding.buildingDef.civExclusive) && (
                  <div className="border-t md:border-t-0 md:border-l border-slate-800 md:pl-3 flex flex-col gap-2 max-w-md">
                    {selectedBuilding.buildingDef.trainableUnits.length > 0 && (
                      <div>
                        <div className="text-[11px] font-bold text-amber-400 mb-1">訓練文明部隊</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedBuilding.buildingDef.trainableUnits.map((uId, uIdx) => {
                            const uDef = engine.findUnitDef(uId, selectedBuilding.faction);
                            if (!uDef) return null;
                            const ageLocked = !!(uDef.requiredAge && observedAge < uDef.requiredAge);
                            const affordable = canAfford(engine.playerResources, uDef.stats.cost);
                            const isXpHero = uId === XP_ELIGIBLE_UNIT_ID && bCiv === 'anime';
                            const trainHotkey = TRAINING_SLOT_HOTKEYS[uIdx];
                            return (
                              <button
                                key={uId}
                                data-train-unit={uId}
                                disabled={!affordable || ageLocked}
                                onClick={() => engine.trainUnit(selectedBuilding.id, uId)}
                                className={`flex flex-col items-start px-2 py-1 rounded border text-xs font-semibold cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                                  ageLocked
                                    ? 'bg-slate-900/80 border-slate-800 text-slate-400'
                                    : isXpHero
                                    ? 'bg-amber-950/60 hover:bg-amber-900/70 border-amber-400/70 text-amber-100'
                                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700/80 text-slate-200'
                                }`}
                                title={`${uDef.name}${trainHotkey ? ` [快捷鍵 ${trainHotkey}]` : ''} - ${uDef.description}`}
                              >
                                <span className="font-bold text-white text-[11px] flex items-center gap-1">
                                  {trainHotkey && !ageLocked && (
                                    <span className="text-[9px] font-mono px-1 rounded bg-slate-950/85 text-amber-300 border border-slate-700">
                                      {trainHotkey}
                                    </span>
                                  )}
                                  <span>{uDef.name}</span>
                                  {ageLocked && (
                                    <span className="text-[9px] px-1 rounded bg-red-950 text-red-300 border border-red-500/40">
                                      🔒時代{uDef.requiredAge}
                                    </span>
                                  )}
                                  {isXpHero && !ageLocked && (
                                    <span className="text-[9px] px-1 rounded bg-amber-500/25 text-amber-300 border border-amber-400/50">
                                      ★歷練
                                    </span>
                                  )}
                                </span>
                                <span className="text-[10px] text-amber-400 font-mono">
                                  {uDef.stats.cost.food ? `${uDef.stats.cost.food}F ` : ''}
                                  {uDef.stats.cost.wood ? `${uDef.stats.cost.wood}W ` : ''}
                                  {uDef.stats.cost.gold ? `${uDef.stats.cost.gold}G` : ''}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {bldgTechs.length > 0 && (
                      <div>
                        <div className="text-[11px] font-bold text-cyan-300 mb-1">🔬 文明科技養成</div>
                        <div className="flex flex-wrap gap-1.5">
                          {bldgTechs.map((tech, tIdx) => {
                            const isDone = bldgResearched.includes(tech.id);
                            const isActive = selectedBuilding.activeTechId === tech.id;
                            const ageLocked = !!(tech.requiredAge && engine.playerAge < tech.requiredAge);
                            const affordable = canAfford(engine.playerResources, tech.cost);
                            const disabled = isDone || !!selectedBuilding.activeTechId || ageLocked || !affordable;
                            const techHotkey = TECH_SLOT_HOTKEYS[tIdx];

                            return (
                              <button
                                key={tech.id}
                                data-tech-id={tech.id}
                                disabled={disabled}
                                onClick={() => engine.startResearch(selectedBuilding.id, tech.id)}
                                className={`flex flex-col items-start px-2 py-1 rounded border text-left transition-colors ${
                                  isDone
                                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200 cursor-default'
                                    : isActive
                                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 cursor-wait'
                                    : disabled
                                    ? 'bg-slate-900/80 border-slate-800 text-slate-500 opacity-60 cursor-not-allowed'
                                    : 'bg-slate-800 hover:bg-slate-700 border-cyan-500/50 text-white cursor-pointer'
                                }`}
                                title={`${tech.name}${techHotkey ? ` [快捷鍵 ${techHotkey}]` : ''} - ${tech.description} (${tech.effectLabel})`}
                              >
                                <span className="text-[11px] font-bold flex items-center gap-1">
                                  {techHotkey && !isDone && (
                                    <span className="text-[9px] font-mono px-1 rounded bg-slate-950/85 text-cyan-300 border border-slate-700">
                                      {techHotkey}
                                    </span>
                                  )}
                                  <span>{tech.icon}</span>
                                  <span>{tech.name}</span>
                                  {isDone && <span className="text-[10px] text-emerald-400">✅</span>}
                                  {isActive && <span className="text-[10px] text-cyan-300">⏳</span>}
                                  {ageLocked && !isDone && <span className="text-[10px] text-red-400">🔒時代{tech.requiredAge}</span>}
                                </span>
                                <span className="text-[9px] text-cyan-300 font-semibold">{tech.effectLabel}</span>
                                {!isDone && (
                                  <span className="text-[9px] text-amber-400 font-mono">
                                    {tech.cost.food ? `${tech.cost.food}F ` : ''}
                                    {tech.cost.wood ? `${tech.cost.wood}W ` : ''}
                                    {tech.cost.gold ? `${tech.cost.gold}G ` : ''}
                                    {tech.cost.stone ? `${tech.cost.stone}S` : ''}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedBuilding.buildingDef.civExclusive && (
                      <div className="text-[10px] text-cyan-200/90 bg-cyan-950/40 border border-cyan-500/30 rounded px-2 py-1">
                        ✦ {selectedBuilding.buildingDef.description}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })()}

            {/* If a Resource Node is selected */}
            {!selectedUnits.length && !selectedBuilding && selectedNode && (
              <div className="flex flex-col md:flex-row items-center gap-4 h-full p-2">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 border-2 border-amber-500/60 flex items-center justify-center text-3xl shadow-lg shrink-0">
                  {selectedNode.subtype === 'deep_fish'
                    ? '🐠'
                    : selectedNode.subtype === 'shore_fish'
                    ? '🐟'
                    : selectedNode.subtype === 'berry'
                    ? '🫐'
                    : selectedNode.subtype === 'hunt'
                    ? '🦌'
                    : selectedNode.resourceType === 'gold'
                    ? '🪙'
                    : selectedNode.resourceType === 'wood'
                    ? '🪵'
                    : selectedNode.resourceType === 'stone'
                    ? '🪨'
                    : '🌾'}
                </div>
                <div className="flex-1 space-y-1.5 w-full">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                    <span className="font-bold text-white text-sm">
                      {selectedNode.subtype === 'deep_fish' && '深海魚群 (Deep-Sea Fish · ×1.55 最快)'}
                      {selectedNode.subtype === 'shore_fish' && '沿岸魚群 (Shore Fish · ×1.32)'}
                      {selectedNode.subtype === 'hunt' && '野生山羌 (Wild Muntjac · ×1.15)'}
                      {selectedNode.subtype === 'berry' && '野生漿果叢 (Forage Berry Bush · ×1.0)'}
                      {selectedNode.resourceType === 'gold' && '天然金礦脈 (Gold Ore Node)'}
                      {selectedNode.resourceType === 'wood' && '茂密森林原木 (Forest Timber)'}
                      {selectedNode.resourceType === 'stone' && '堅硬花崗石礦 (Stone Quarry)'}
                      {selectedNode.resourceType === 'food' &&
                        selectedNode.subtype !== 'deep_fish' &&
                        selectedNode.subtype !== 'shore_fish' &&
                        selectedNode.subtype !== 'berry' &&
                        selectedNode.subtype !== 'hunt' &&
                        '成熟麥田作物 (Harvest Farm · ×1.0)'}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 bg-amber-500/20 text-amber-300 font-mono rounded-full font-bold border border-amber-500/30">
                      剩餘 {Math.round((selectedNode.amount / selectedNode.maxAmount) * 100)}%
                    </span>
                  </div>

                  {/* Amount Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>可採集儲量</span>
                      <span className="font-mono font-bold text-amber-400">
                        {Math.round(selectedNode.amount)} / {selectedNode.maxAmount}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all"
                        style={{ width: `${Math.max(0, (selectedNode.amount / selectedNode.maxAmount) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Assign idle villagers quick button */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs text-slate-300 flex items-center gap-1.5">
                      <span>⛏️ 當前開採村民:</span>
                      <strong className="text-amber-400 font-bold">
                        {engine.units.filter((u) => u.targetResourceNodeId === selectedNode.id).length} 人
                      </strong>
                    </div>

                    {!isSpectator && (
                      <button
                        onClick={() => {
                          const idleWorker = engine.units.find(
                            (u) => engine.isHumanControlled(u.faction) && u.unitDef.category === 'worker' && u.state === 'idle'
                          );
                          if (idleWorker) {
                            engine.selectedUnitIds = [idleWorker.id];
                            engine.issueGatherOrder(selectedNode.id);
                          }
                        }}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold rounded shadow transition-colors cursor-pointer"
                      >
                        指派閒置村民開採
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* If an Enemy / AI Entity is inspected (strictly read-only intel) */}
            {!selectedUnits.length && !selectedBuilding && !selectedNode && engine.inspectedEntity && (() => {
              const { type, id } = engine.inspectedEntity;
              const enemyUnit = type === 'unit' ? engine.units.find((u) => u.id === id) : null;
              const enemyBldg = type === 'building' ? engine.buildings.find((b) => b.id === id) : null;

              if (enemyUnit) {
                const owner = engine.getParticipant(enemyUnit.faction);
                return (
                  <div
                    className={`flex flex-col md:flex-row items-center gap-4 h-full p-2 border rounded-lg ${
                      isSpectator ? 'border-cyan-500/40 bg-slate-900/60' : 'border-red-500/40 bg-red-950/20'
                    }`}
                  >
                    <div
                      className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl shadow-lg shrink-0 ${
                        isSpectator ? 'bg-slate-800 border-cyan-400' : 'bg-red-900/60 border-red-500'
                      }`}
                    >
                      ⚔️
                    </div>
                    <div className="flex-1 space-y-1 w-full">
                      <div
                        className={`flex items-center justify-between border-b pb-1 ${
                          isSpectator ? 'border-slate-800' : 'border-red-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {owner && (
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/50"
                              style={{ backgroundColor: owner.colorCss }}
                            />
                          )}
                          <span className={`font-bold text-sm ${isSpectator ? 'text-white' : 'text-red-400'}`}>
                            {isSpectator
                              ? `${owner?.name || enemyUnit.faction} · ${enemyUnit.unitDef.name}`
                              : `敵軍目標 · ${enemyUnit.unitDef.name}`}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 border rounded font-bold ${
                              isSpectator
                                ? 'bg-cyan-950/80 text-cyan-200 border-cyan-500/40'
                                : 'bg-red-950 text-red-300 border-red-800'
                            }`}
                          >
                            {owner ? `隊${owner.team} · AI掌控` : '電腦AI掌控'}
                          </span>
                        </div>
                        <span className={`text-xs font-mono font-bold ${isSpectator ? 'text-emerald-300' : 'text-red-300'}`}>
                          HP: {Math.round(enemyUnit.hp)} / {enemyUnit.maxHp}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${isSpectator ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.max(0, (enemyUnit.hp / enemyUnit.maxHp) * 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                        <div className="flex gap-3">
                          <span>攻: <b className="text-red-400">{enemyUnit.unitDef.stats.attack}</b></span>
                          <span>攻城: <b className="text-orange-300">{enemyUnit.unitDef.stats.buildingAttack ?? Math.max(2, Math.round(enemyUnit.unitDef.stats.attack * 0.45))}</b></span>
                          <span>防: <b className="text-blue-400">{enemyUnit.unitDef.stats.defense}</b></span>
                          <span>距: <b className="text-amber-400">{enemyUnit.unitDef.stats.range}</b></span>
                          <span>速: <b className="text-purple-400">{enemyUnit.unitDef.stats.speed}</b></span>
                        </div>
                        <span className={`text-[11px] font-bold ${isSpectator ? 'text-cyan-300' : 'text-red-400'}`}>
                          {isSpectator
                            ? `狀態：${enemyUnit.currentActionText || enemyUnit.state}${enemyUnit.kills > 0 ? ` · 擊殺 ${enemyUnit.kills}` : ''}`
                            : '⛔ 敵軍由電腦AI自動指揮 (選取我方部隊後右鍵可命令攻擊)'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              if (enemyBldg) {
                const owner = engine.getParticipant(enemyBldg.faction);
                const enemyAge = engine.ageByFaction[enemyBldg.faction] || 1;
                const enemyResearched = engine.getResearchedTechs(enemyBldg.faction);
                const ebStats = getBuildingCombatStats(enemyBldg, engine.units, enemyAge, enemyResearched);
                return (
                  <div
                    className={`flex flex-col md:flex-row items-center gap-4 h-full p-2 border rounded-lg ${
                      isSpectator ? 'border-cyan-500/40 bg-slate-900/60' : 'border-red-500/40 bg-red-950/20'
                    }`}
                  >
                    <div
                      className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl shadow-lg shrink-0 ${
                        isSpectator ? 'bg-slate-800 border-cyan-400' : 'bg-red-900/60 border-red-500'
                      }`}
                    >
                      🏰
                    </div>
                    <div className="flex-1 space-y-1.5 w-full">
                      <div
                        className={`flex items-center justify-between border-b pb-1 ${
                          isSpectator ? 'border-slate-800' : 'border-red-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {owner && (
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/50"
                              style={{ backgroundColor: owner.colorCss }}
                            />
                          )}
                          <span className={`font-bold text-sm ${isSpectator ? 'text-white' : 'text-red-400'}`}>
                            {isSpectator
                              ? `${owner?.name || enemyBldg.faction} · ${enemyBldg.buildingDef.name}`
                              : `敵方要塞 · ${enemyBldg.buildingDef.name}`}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 border rounded font-bold ${
                              isSpectator
                                ? 'bg-cyan-950/80 text-cyan-200 border-cyan-500/40'
                                : 'bg-red-950 text-red-300 border-red-800'
                            }`}
                          >
                            {owner ? `隊${owner.team} · AI建築` : '電腦AI要塞'}
                          </span>
                        </div>
                        <span className={`text-xs font-mono font-bold ${isSpectator ? 'text-sky-300' : 'text-red-300'}`}>
                          HP: {Math.round(enemyBldg.hp)} / {enemyBldg.maxHp}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${isSpectator ? 'bg-sky-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.max(0, (enemyBldg.hp / enemyBldg.maxHp) * 100)}%` }}
                        />
                      </div>
                      <div
                        data-building-stats-grid="true"
                        className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 px-2 py-1 rounded bg-slate-950/75 border border-slate-800 text-[10px]"
                      >
                        <div className="flex flex-col">
                          <span className="text-slate-400">⚔️ 攻擊力</span>
                          <span className="font-mono font-bold text-amber-300">{ebStats.attackDisplay}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">🎯 攻擊方式</span>
                          <span className="font-bold text-slate-200 leading-tight" title={ebStats.attackMethod}>
                            {ebStats.attackMethod}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">🔥 攻擊類型</span>
                          <span className="font-bold text-orange-300 leading-tight" title={ebStats.attackType}>
                            {ebStats.attackType}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">📏 攻擊範圍</span>
                          <span className="font-mono font-bold text-cyan-300">
                            {ebStats.range > 0 ? `${ebStats.range} 格` : '—'}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">🛡️ 防禦／城甲</span>
                          <span className="font-mono font-bold text-sky-300">
                            城甲 {ebStats.buildingArmor}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-300 pt-0.5">
                        <span>{enemyBldg.buildingDef.description}</span>
                        <span className={`text-[11px] font-bold shrink-0 ${isSpectator ? 'text-cyan-300' : 'text-red-400'}`}>
                          {isSpectator
                            ? enemyBldg.queue.length > 0
                              ? `訓練中 (${enemyBldg.queue.length})`
                              : enemyBldg.activeTechId
                              ? '🔬 研發科技中'
                              : enemyBldg.isConstructed
                              ? '運作中'
                              : `建造中 ${Math.round(enemyBldg.buildProgress * 100)}%`
                            : '⛔ 電腦AI掌控 (選取我軍部隊右鍵摧毀它)'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* When nothing is selected and no enemy is inspected */}
            {!selectedUnits.length && !selectedBuilding && !selectedNode && !engine.inspectedEntity && (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                {isSpectator
                  ? '👁️ 全 AI 觀戰模式：點擊上方勢力切換追蹤視角，或左鍵點擊戰場任一單位／建築檢視即時戰況。'
                  : '點擊或左鍵框選單位下達指令，點擊建築招募部隊，右鍵點擊資源採集。'}
              </div>
            )}
              </>
            )}
          </div>
          </div>
        </div>
      </footer>

      {/* ================= AOE4 AGE ADVANCEMENT LANDMARK MODAL ================= */}
      {showAgeModal && engine.playerAge < 4 && (() => {
        const nextInfo = NEXT_AGE_INFO[engine.playerAge];
        if (!nextInfo) return null;
        const affordable =
          engine.playerResources.food >= nextInfo.cost.food &&
          engine.playerResources.gold >= nextInfo.cost.gold;

        return (
          <div data-age-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pointer-events-auto">
            <div className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/60 rounded-2xl shadow-2xl p-6 text-white space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🏛️</span>
                  <div>
                    <h2 className="text-lg font-black text-amber-300 tracking-wide flex items-center gap-2">
                      <span>晉升時代 · 建造歷史地標 (Advance Age)</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      選擇建造其中一座文明地標以完成時代突破，解鎖更強大的科技、軍事單位與獨特文明加成。
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAgeModal(false)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Requirement Summary */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs">
                <span className="text-slate-300 font-bold">晉升目標：<b className="text-amber-400">{nextInfo.name}</b></span>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-medium">晉升所需物資:</span>
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded ${
                      engine.playerResources.food >= nextInfo.cost.food
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}
                  >
                    🌾 {nextInfo.cost.food} 糧食 ({Math.floor(engine.playerResources.food)}/{nextInfo.cost.food})
                  </span>
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded ${
                      engine.playerResources.gold >= nextInfo.cost.gold
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}
                  >
                    🪙 {nextInfo.cost.gold} 黃金 ({Math.floor(engine.playerResources.gold)}/{nextInfo.cost.gold})
                  </span>
                </div>
              </div>

              {/* Landmark Selection Cards (Dual AOE4 Choice) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {nextInfo.landmarks.map((lmId) => {
                  const lmDef = DEFAULT_BUILDINGS[lmId];
                  const hasBuilt = engine.playerLandmarks.includes(lmId);

                  return (
                    <div
                      key={lmId}
                      className="flex flex-col justify-between p-4 bg-slate-900/90 border border-amber-500/30 hover:border-amber-400 rounded-xl transition-all shadow-lg"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-black text-amber-300 text-sm">{lmDef.name}</h3>
                          <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-mono font-bold">
                            地標
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{lmDef.description}</p>
                        {lmDef.landmarkPerkDescription && (
                          <div className="p-2 bg-amber-950/40 border border-amber-500/30 rounded text-[11px] text-amber-200">
                            ⭐ <b>獨特地標特權:</b> {lmDef.landmarkPerkDescription}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">生命值: {lmDef.maxHp} HP</span>
                        <button
                          onClick={() => {
                            setShowAgeModal(false);
                            engine.startPlacement(lmId);
                          }}
                          disabled={!affordable || hasBuilt}
                          className={`px-4 py-1.5 rounded-lg text-xs font-black shadow transition-all cursor-pointer ${
                            hasBuilt
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : affordable
                              ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 hover:scale-105'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {hasBuilt ? '已修建' : affordable ? '修築此地標晉升 ➔' : '資源不足'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
      {/* ================= HOTKEY REFERENCE MODAL ================= */}
      {showHotkeysModal && (
        <div
          data-hotkeys-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto"
          onClick={() => setShowHotkeysModal(false)}
        >
          <div
            className="w-full max-w-2xl bg-slate-950 border border-amber-500/50 rounded-2xl shadow-2xl p-5 text-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-black text-amber-300">戰術快捷編隊與指揮鍵位一覽</h2>
              </div>
              <button
                onClick={() => setShowHotkeysModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                aria-label="關閉快捷鍵說明"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {HOTKEY_REFERENCE_GROUPS.map((group) => (
                <div
                  key={group.title}
                  className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2"
                >
                  <div className="text-xs font-extrabold text-amber-300 border-b border-slate-800 pb-1">
                    {group.title}
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <div key={item.keys} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 font-mono text-amber-200 font-bold shrink-0">
                          {item.keys}
                        </span>
                        <span className="text-slate-300 text-right">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
