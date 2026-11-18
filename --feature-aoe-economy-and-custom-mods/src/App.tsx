import React, { useState, useEffect, useCallback } from 'react';
import { RtsEngine } from './game/engine';
import { GameCanvas } from './components/GameCanvas';
import { TitleScreen } from './components/TitleScreen';
import { HUD } from './components/HUD';
import { ModEditorModal } from './components/ModEditorModal';
import { PauseModal } from './components/PauseModal';
import { GameOverModal } from './components/GameOverModal';
import { sound } from './game/audio';
import { EconomyMode, MapPresetId, MatchParticipant, ResourceRichness } from './types/game';
import { createDefaultParticipants } from './game/rules';

export default function App() {
  const [engine, setEngine] = useState<RtsEngine | null>(null);
  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused' | 'gameover'>('title');
  const [participants, setParticipants] = useState<MatchParticipant[]>(() => createDefaultParticipants());
  const [mapPreset, setMapPreset] = useState<MapPresetId>('river_valley');
  const [resourceRichness, setResourceRichness] = useState<ResourceRichness>('standard');
  const [economyMode, setEconomyMode] = useState<EconomyMode>('classic');
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

      // Check for ?autostart=1 or ?map= in URL
      const params = new URLSearchParams(window.location.search);
      const urlMap = params.get('map') as MapPresetId | null;
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

      engine.setupWorld(list, mapPreset, resourceRichness, economyMode);
      engine.gameState = 'playing';
      engine.gameOverResult = null;
      setGameState('playing');
      document.body.dataset.state = 'playing';
      sound.playSelect();
      forceUpdate();
    },
    [engine, participants, mapPreset, resourceRichness, economyMode, forceUpdate]
  );

  const handleMapPresetChange = useCallback(
    (nextPreset: MapPresetId) => {
      setMapPreset(nextPreset);
      if (engine && gameState === 'title') {
        engine.setupWorld(participants, nextPreset, resourceRichness, economyMode);
      }
    },
    [engine, gameState, participants, resourceRichness, economyMode]
  );

  const handleResourceRichnessChange = useCallback(
    (nextRichness: ResourceRichness) => {
      setResourceRichness(nextRichness);
      if (engine && gameState === 'title') {
        engine.setupWorld(participants, mapPreset, nextRichness, economyMode);
      }
    },
    [engine, gameState, participants, mapPreset, economyMode]
  );

  const handleEconomyModeChange = useCallback(
    (nextMode: EconomyMode) => {
      setEconomyMode(nextMode);
      if (engine && gameState === 'title') {
        engine.setupWorld(participants, mapPreset, resourceRichness, nextMode);
      }
    },
    [engine, gameState, participants, mapPreset, resourceRichness]
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
    const speeds = [1.0, 1.5, 2.0];
    const nextIdx = (speeds.indexOf(gameSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    engine.gameSpeed = nextSpeed;
    setGameSpeed(nextSpeed);
  };

  const handleRestart = () => {
    if (!engine) return;
    engine.setupWorld(participants, mapPreset, resourceRichness, economyMode);
    engine.gameState = 'playing';
    engine.gameOverResult = null;
    setGameState('playing');
    document.body.dataset.state = 'playing';
    forceUpdate();
  };

  const handleReturnTitle = () => {
    if (!engine) return;
    engine.setupWorld(participants, mapPreset, resourceRichness, economyMode);
    engine.gameState = 'title';
    engine.gameOverResult = null;
    setGameState('title');
    document.body.dataset.state = 'title';
    forceUpdate();
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 1. Isolated 3D Canvas Viewport */}
      <GameCanvas onEngineReady={handleEngineReady} />

      {/* 2. Title Screen State */}
      {gameState === 'title' && (
        <TitleScreen
          participants={participants}
          onParticipantsChange={setParticipants}
          mapPreset={mapPreset}
          onMapPresetChange={handleMapPresetChange}
          resourceRichness={resourceRichness}
          onResourceRichnessChange={handleResourceRichnessChange}
          economyMode={economyMode}
          onEconomyModeChange={handleEconomyModeChange}
          onStart={handleStartGame}
          onOpenMods={() => setIsModEditorOpen(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* 3. In-Game Low-Occlusion HUD */}
      {gameState === 'playing' && engine && (
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
        />
      )}

      {/* 4. Pause Modal */}
      {gameState === 'paused' && engine && (
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
      )}

      {/* 5. Game Over (Victory / Defeat / All-AI Spectator Result) Modal */}
      {gameState === 'gameover' && engine && engine.gameOverResult && (
        <GameOverModal
          result={engine.gameOverResult}
          stats={engine.stats}
          isSpectator={engine.isSpectatorMode}
          winnerSummary={engine.gameOverWinner}
          onRestart={handleRestart}
          onReturnTitle={handleReturnTitle}
        />
      )}

      {/* 6. Mod Switchboard & AI Tactics Scripting Modal */}
      {isModEditorOpen && engine && (
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
