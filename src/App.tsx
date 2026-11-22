import React, { useState, useEffect, useCallback } from 'react';
import type { RtsEngine } from './game/engine';
import { TitleScreen } from './components/TitleScreen';
import { sound } from './game/audio';
import { MapPresetId, MatchParticipant, ResourceRichness } from './types/game';
import { createDefaultParticipants, getNextGameSpeed } from './game/rules';

const GameCanvas = React.lazy(() => import('./components/GameCanvas').then((module) => ({ default: module.GameCanvas })));
const HUD = React.lazy(() => import('./components/HUD').then((module) => ({ default: module.HUD })));
const ModEditorModal = React.lazy(() => import('./components/ModEditorModal').then((module) => ({ default: module.ModEditorModal })));
const PauseModal = React.lazy(() => import('./components/PauseModal').then((module) => ({ default: module.PauseModal })));
const GameOverModal = React.lazy(() => import('./components/GameOverModal').then((module) => ({ default: module.GameOverModal })));

export default function App() {
  const [engine, setEngine] = useState<RtsEngine | null>(null);
  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused' | 'gameover'>('title');
  const [participants, setParticipants] = useState<MatchParticipant[]>(() => createDefaultParticipants());
  const [mapPreset, setMapPreset] = useState<MapPresetId>('river_valley');
  const [resourceRichness, setResourceRichness] = useState<ResourceRichness>('standard');
  const [isModEditorOpen, setIsModEditorOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [gameSpeed, setGameSpeed] = useState(1.0);
  const [, setTick] = useState(0);

  // Reference for engine callbacks
  const forceUpdate = useCallback(() => setTick((t) => (t + 1) % 10000), []);

  const handleEngineReady = useCallback(
    (eng: RtsEngine) => {
      setEngine(eng);
      (window as any).__rtsEngine = eng;

      eng.onStateChange = () => {
        setGameState(eng.gameState);
        forceUpdate();
      };

      eng.onResourcesChange = () => {
        forceUpdate();
      };

      eng.onSelectionChange = () => {
        forceUpdate();
      };

      // Developer-only deterministic large-battle scenario: ?battleStress=100|200|400&seed=12345
      const params = new URLSearchParams(window.location.search);
      const urlMap = params.get('map') as MapPresetId | null;
      const stressValue = params.get('battleStress');
      const stressCount = stressValue === '100' ? 100 : stressValue === '200' ? 200 : stressValue === '400' ? 400 : null;
      if (import.meta.env.DEV && stressCount !== null) {
        const stressMap = urlMap === 'river_valley' || urlMap === 'highland_basin' || urlMap === 'twin_lakes'
          ? urlMap
          : 'highland_basin';
        const requestedSeed = Number(params.get('seed') ?? '20261122');
        const stressSeed = Number.isFinite(requestedSeed) ? requestedSeed : 20261122;
        setMapPreset(stressMap);
        setResourceRichness('abundant');
        eng.setupBattleStressTest(stressCount, stressSeed, stressMap);
        setGameState('playing');
        document.body.dataset.state = 'playing';
        forceUpdate();
        return;
      }

      // Check for ?autostart=1 or ?map= in URL
      if (urlMap === 'river_valley' || urlMap === 'highland_basin' || urlMap === 'twin_lakes') {
        setMapPreset(urlMap);
        eng.setupWorld(undefined, urlMap);
      }
      if (params.get('autostart') === '1') {
        eng.gameState = 'playing';
        setGameState('playing');
        document.body.dataset.state = 'playing';
      } else {
        document.body.dataset.state = 'title';
      }
    },
    [forceUpdate]
  );

  const handleStartGame = useCallback(
    (configuredParticipants?: MatchParticipant[]) => {
      if (!engine) return;
      const list = configuredParticipants || participants;
      const distinctTeams = new Set(list.map((p) => p.team));
      if (distinctTeams.size < 2) return;

      engine.setupWorld(list, mapPreset, resourceRichness);
      engine.gameState = 'playing';
      engine.gameOverResult = null;
      setGameState('playing');
      document.body.dataset.state = 'playing';
      sound.playSelect();
      forceUpdate();
    },
    [engine, participants, mapPreset, resourceRichness, forceUpdate]
  );

  const handleMapPresetChange = useCallback(
    (nextPreset: MapPresetId) => {
      setMapPreset(nextPreset);
      if (engine && gameState === 'title') {
        engine.setupWorld(participants, nextPreset, resourceRichness);
      }
    },
    [engine, gameState, participants, resourceRichness]
  );

  const handleResourceRichnessChange = useCallback(
    (nextRichness: ResourceRichness) => {
      setResourceRichness(nextRichness);
      if (engine && gameState === 'title') {
        engine.setupWorld(participants, mapPreset, nextRichness);
      }
    },
    [engine, gameState, participants, mapPreset]
  );

  // Global Key Handlers for Title Screen (Enter/Space to start)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'title') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'SELECT' || tag === 'INPUT' || tag === 'BUTTON') return;
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartGame();
        }
      } else if (gameState === 'playing') {
        if (e.code === 'Tab') {
          e.preventDefault();
          if (engine) {
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
            engine.contestedPoints.forEach((cp) => {
              const m = (engine as any).contestedMeshes.get(cp.id);
              if (m) {
                const sBadge = m.getObjectByName('shrineBadge');
                if (sBadge) sBadge.visible = engine.showOverheadBadges;
              }
            });
            forceUpdate();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, engine, forceUpdate, handleStartGame]);

  const handleToggleMute = () => {
    sound.muted = !sound.muted;
    setIsMuted(sound.muted);
  };

  const handleToggleSpeed = () => {
    if (!engine) return;
    const nextSpeed = getNextGameSpeed(gameSpeed);
    engine.gameSpeed = nextSpeed;
    setGameSpeed(nextSpeed);
  };

  const handleSelectSpeed = (speed: number) => {
    if (!engine) return;
    engine.gameSpeed = speed;
    setGameSpeed(speed);
  };

  const handleRestart = () => {
    if (!engine) return;
    engine.setupWorld(participants, mapPreset, resourceRichness);
    engine.gameState = 'playing';
    engine.gameOverResult = null;
    setGameState('playing');
    document.body.dataset.state = 'playing';
    forceUpdate();
  };

  const handleReturnTitle = () => {
    if (!engine) return;
    engine.setupWorld(participants, mapPreset, resourceRichness);
    engine.gameState = 'title';
    engine.gameOverResult = null;
    setGameState('title');
    document.body.dataset.state = 'title';
    forceUpdate();
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 1. Isolated 3D Canvas Viewport */}
      <React.Suspense fallback={<div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black" aria-label="載入 3D 戰場" />}>
        <GameCanvas onEngineReady={handleEngineReady} />
      </React.Suspense>

      {/* 2. Title Screen State */}
      {gameState === 'title' && (
        <TitleScreen
          participants={participants}
          onParticipantsChange={setParticipants}
          mapPreset={mapPreset}
          onMapPresetChange={handleMapPresetChange}
          resourceRichness={resourceRichness}
          onResourceRichnessChange={handleResourceRichnessChange}
          onStart={handleStartGame}
          onOpenMods={() => setIsModEditorOpen(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          isEngineReady={!!engine}
        />
      )}

      {/* 3. In-Game Low-Occlusion HUD */}
      {gameState === 'playing' && engine && (
        <React.Suspense fallback={<div className="absolute top-16 left-3 z-30 rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 pointer-events-none">戰場介面載入中…</div>}>
        <HUD
          engine={engine}
          onPause={() => {
            engine.gameState = 'paused';
            setGameState('paused');
            document.body.dataset.state = 'paused';
            forceUpdate();
          }}
          onOpenMods={() => setIsModEditorOpen(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          gameSpeed={gameSpeed}
          onToggleSpeed={handleToggleSpeed}
          onSelectSpeed={handleSelectSpeed}
        />
        </React.Suspense>
      )}

      {/* 4. Pause Modal */}
      {gameState === 'paused' && engine && (
        <React.Suspense fallback={null}>
        <PauseModal
          onResume={() => {
            engine.gameState = 'playing';
            setGameState('playing');
            document.body.dataset.state = 'playing';
            forceUpdate();
          }}
          onRestart={handleRestart}
          onOpenMods={() => setIsModEditorOpen(true)}
          onReturnTitle={handleReturnTitle}
        />
        </React.Suspense>
      )}

      {/* 5. Game Over (Victory / Defeat / All-AI Spectator Result) Modal */}
      {gameState === 'gameover' && engine && engine.gameOverResult && (
        <React.Suspense fallback={null}>
        <GameOverModal
          result={engine.gameOverResult}
          stats={engine.stats}
          isSpectator={engine.isSpectatorMode}
          winnerSummary={engine.gameOverWinner}
          onRestart={handleRestart}
          onReturnTitle={handleReturnTitle}
        />
        </React.Suspense>
      )}

      {/* 6. Mod Switchboard & AI Tactics Scripting Modal */}
      {isModEditorOpen && engine && (
        <React.Suspense fallback={<div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 text-sm font-bold text-amber-200">載入模組編輯器…</div>}>
        <ModEditorModal
          engine={engine}
          onClose={() => setIsModEditorOpen(false)}
          onApply={() => {
            forceUpdate();
          }}
        />
      )}
    </div>
  );
}
