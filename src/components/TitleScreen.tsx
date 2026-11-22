import React from 'react';
import { Play, Volume2, VolumeX, Sliders, Plus, Trash2, User, Bot, Shield, Map as MapIcon, Gem, Sparkles } from 'lucide-react';
import { CivilizationId, MapPresetId, MatchParticipant, ResourceRichness } from '../types/game';
import { DEFAULT_PARTICIPANT_PALETTE, getTeamVisualColor } from '../game/rules';
import { MAP_PRESETS } from '../game/mapGenerator';
import { CIVILIZATION_LIST, getCivilizationConfig } from '../game/civilizations';
import { DEFAULT_BUILDINGS } from '../game/mods';

interface TitleScreenProps {
  participants: MatchParticipant[];
  onParticipantsChange: (next: MatchParticipant[]) => void;
  mapPreset: MapPresetId;
  onMapPresetChange: (preset: MapPresetId) => void;
  resourceRichness: ResourceRichness;
  onResourceRichnessChange: (richness: ResourceRichness) => void;
  onStart: (participants: MatchParticipant[]) => void;
  onOpenMods: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isEngineReady: boolean;
}


const MapPreview: React.FC<{ mapId: MapPresetId; groundTint: string }> = ({ mapId, groundTint }) => (
  <div className="relative h-[76px] overflow-hidden rounded-lg border border-white/10 bg-slate-950/70">
    <svg viewBox="0 0 320 112" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`terrain-${mapId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={groundTint} />
          <stop offset="100%" stopColor="#172b20" />
        </linearGradient>
        <pattern id={`grid-${mapId}`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d1fae5" strokeOpacity=".08" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="320" height="112" fill={`url(#terrain-${mapId})`} />
      <rect width="320" height="112" fill={`url(#grid-${mapId})`} />
      {mapId === 'river_valley' && (
        <>
          <path d="M-18 100 C48 62 82 67 132 42 S246 4 338 8" fill="none" stroke="#0c4a6e" strokeWidth="31" />
          <path d="M-18 100 C48 62 82 67 132 42 S246 4 338 8" fill="none" stroke="#0284c7" strokeWidth="22" />
          <path d="M-18 96 C48 58 82 63 132 38 S246 0 338 4" fill="none" stroke="#7dd3fc" strokeOpacity=".48" strokeWidth="2" />
          <g transform="translate(156 37) rotate(-24)">
            <rect x="-20" y="-7" width="40" height="14" rx="2" fill="#b9a17a" stroke="#f5e6c8" strokeWidth="2" />
            <path d="M-16 -8 V8 M-7 -8 V8 M2 -8 V8 M11 -8 V8" stroke="#6b5540" strokeWidth="2" />
          </g>
          <path d="M18 18 Q54 4 85 18 M220 88 Q254 66 298 84" fill="none" stroke="#a3e635" strokeOpacity=".42" strokeWidth="5" />
        </>
      )}
      {mapId === 'highland_basin' && (
        <>
          <g fill="#64734a" stroke="#a3b47b" strokeOpacity=".62" strokeWidth="2">
            <path d="M18 14 L44 4 66 18 58 44 29 48 10 33Z" />
            <path d="M232 10 L267 4 293 24 280 49 247 43 221 28Z" />
            <path d="M116 73 L144 55 168 70 161 103 124 105 105 91Z" />
            <path d="M37 78 L60 62 82 77 78 101 48 106 28 94Z" />
          </g>
          <g fill="none" stroke="#d9e4ad" strokeOpacity=".28" strokeWidth="1.5">
            <path d="M4 52 Q68 18 126 47 T316 48" />
            <path d="M0 64 Q70 30 130 59 T320 59" />
            <path d="M0 78 Q70 44 130 73 T320 73" />
            <path d="M0 92 Q70 58 130 87 T320 87" />
          </g>
          <path d="M76 108 Q100 78 131 62 T208 18" fill="none" stroke="#d6c39a" strokeWidth="6" strokeDasharray="7 5" />
          <path d="M76 108 Q100 78 131 62 T208 18" fill="none" stroke="#f5e6c8" strokeOpacity=".7" strokeWidth="1.5" />
        </>
      )}
      {mapId === 'twin_lakes' && (
        <>
          <g fill="#075985" stroke="#38bdf8" strokeOpacity=".8" strokeWidth="3">
            <ellipse cx="78" cy="54" rx="47" ry="39" />
            <ellipse cx="242" cy="54" rx="47" ry="39" />
          </g>
          <g fill="none" stroke="#bae6fd" strokeOpacity=".35" strokeWidth="1.4">
            <ellipse cx="78" cy="54" rx="37" ry="29" />
            <ellipse cx="242" cy="54" rx="37" ry="29" />
          </g>
          <path d="M120 48 Q160 36 200 48 L200 65 Q160 54 120 65Z" fill="#c5a777" stroke="#f5e6c8" strokeWidth="2" />
          <path d="M120 55 H200" stroke="#6b5540" strokeWidth="2" strokeDasharray="5 4" />
          <path d="M0 12 Q82 2 126 27 M194 88 Q246 108 320 92" fill="none" stroke="#a3e635" strokeOpacity=".5" strokeWidth="5" />
        </>
      )}
      <g fill="#166534" stroke="#86efac" strokeOpacity=".65" strokeWidth="1">
        <circle cx="26" cy="24" r="4" /><circle cx="42" cy="30" r="3" />
        <circle cx="288" cy="22" r="4" /><circle cx="274" cy="34" r="3" />
        <circle cx="36" cy="88" r="4" /><circle cx="286" cy="88" r="4" />
      </g>
      <g fill="#fbbf24" stroke="#78350f" strokeWidth="1">
        <circle cx="92" cy="22" r="3" /><circle cx="224" cy="88" r="3" />
      </g>
      <g fill="#cbd5e1" stroke="#334155" strokeWidth="1">
        <rect x="154" y="10" width="6" height="6" rx="1" /><rect x="160" y="96" width="6" height="6" rx="1" />
      </g>
    </svg>
    <div className="absolute inset-x-2 bottom-1 flex items-center justify-between text-[8px] font-black tracking-[.16em] text-white/75 drop-shadow">
      <span>TACTICAL MAP</span>
      <span>◈ RESOURCE NODES</span>
    </div>
  </div>
);

export const TitleScreen: React.FC<TitleScreenProps> = ({
  participants,
  onParticipantsChange,
  mapPreset,
  onMapPresetChange,
  resourceRichness,
  onResourceRichnessChange,
  onStart,
  onOpenMods,
  isMuted,
  onToggleMute,
  isEngineReady,
}) => {
  const distinctTeams = new Set(participants.map((p) => p.team));
  const hasOpposingTeams = distinctTeams.size >= 2;
  const hasHumanPlayer = participants.some((p) => p.controller === 'player');
  const canStart = hasOpposingTeams && isEngineReady;

  const [previewCivId, setPreviewCivId] = React.useState<CivilizationId>('medieval');
  const humanParticipant = participants.find((p) => p.controller === 'player') || null;
  const humanCiv = getCivilizationConfig(humanParticipant ? humanParticipant.civilization : previewCivId);
  const uniqueBldgDef = DEFAULT_BUILDINGS[humanCiv.uniqueBuildingType];

  const handleAddParticipant = () => {
    if (participants.length >= 6) return;
    const idx = participants.length;
    const palette = DEFAULT_PARTICIPANT_PALETTE[idx % DEFAULT_PARTICIPANT_PALETTE.length];
    const nextTeam = (idx % 2) + 1;
    const nextCiv = CIVILIZATION_LIST[idx % CIVILIZATION_LIST.length].id;
    const newSlot: MatchParticipant = {
      id: `slot_${idx + 1}`,
      name: `勢力 ${idx + 1}`,
      controller: 'ai',
      team: nextTeam,
      civilization: nextCiv,
      aiPersonality: 'standard',
      ...palette,
    };
    onParticipantsChange([...participants, newSlot]);
  };

  const handleRemoveParticipant = (id: string) => {
    if (participants.length <= 2) return;
    const filtered = participants.filter((p) => p.id !== id);
    onParticipantsChange(filtered);
  };

  const handleToggleController = (id: string) => {
    const target = participants.find((p) => p.id === id);
    if (!target) return;

    if (target.controller === 'ai') {
      const next = participants.map((p, idx) => ({
        ...p,
        controller: p.id === id ? ('player' as const) : ('ai' as const),
        name:
          p.id === id
            ? '玩家勢力'
            : p.name === '玩家勢力'
            ? `電腦 AI ${idx + 1}`
            : p.name,
      }));
      onParticipantsChange(next);
    } else {
      // Allow switching the last human player to AI for full All-AI spectator mode
      const next = participants.map((p, idx) =>
        p.id === id
          ? {
              ...p,
              controller: 'ai' as const,
              name: p.name === '玩家勢力' ? `電腦 AI ${idx + 1}` : p.name,
            }
          : p
      );
      onParticipantsChange(next);
    }
  };

  const handleToggleAllAi = () => {
    if (hasHumanPlayer) {
      onParticipantsChange(
        participants.map((p, idx) => ({
          ...p,
          controller: 'ai' as const,
          name: p.name === '玩家勢力' ? `電腦 AI ${idx + 1}` : p.name,
        }))
      );
    } else {
      onParticipantsChange(
        participants.map((p, idx) => ({
          ...p,
          controller: idx === 0 ? ('player' as const) : ('ai' as const),
          name: idx === 0 ? '玩家勢力' : p.name === '玩家勢力' ? `電腦 AI ${idx + 1}` : p.name,
        }))
      );
    }
  };

  const handleTeamChange = (id: string, team: number) => {
    const next = participants.map((p) => (p.id === id ? { ...p, team } : p));
    onParticipantsChange(next);
  };

  const handleCivilizationChange = (id: string, civilization: CivilizationId) => {
    const next = participants.map((p) => (p.id === id ? { ...p, civilization } : p));
    onParticipantsChange(next);
  };

  const handleAiPersonalityChange = (
    id: string,
    aiPersonality: 'easy' | 'standard' | 'hard' | 'defensive'
  ) => {
    const next = participants.map((p) => (p.id === id ? { ...p, aiPersonality } : p));
    onParticipantsChange(next);
  };

  return (
    <div className="absolute inset-0 flex flex-col justify-between p-4 md:p-6 z-20 pointer-events-none select-none overflow-y-auto">
      {/* Top Header */}
      <div className="flex justify-end items-center w-full shrink-0">
        <button
          onClick={onToggleMute}
          className="pointer-events-auto p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 text-slate-200 border border-slate-700/70 shadow-lg cursor-pointer transition-colors"
          aria-label={isMuted ? '開啟音效' : '靜音'}
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
        </button>
      </div>

      {/* Main Content Layout: Hero + Civ & Map Selector | Match Lobby Setup */}
      <div className="my-auto mx-auto w-full py-2 flex flex-col lg:flex-row items-stretch gap-5 max-w-6xl">
        {/* Left: Hero Title Lockup + Civilization Specialty + Map Picker */}
        <div className="flex-1 p-5 md:p-6 bg-slate-950/92 border border-amber-500/30 rounded-2xl shadow-2xl flex flex-col justify-between space-y-3.5 pointer-events-auto">
          <div className="space-y-2.5">
            <div className="flex items-center gap-4">
              <svg className="w-12 h-12 shrink-0 drop-shadow-xl" viewBox="0 0 64 64" fill="none">
                <polygon points="32,4 60,18 60,46 32,60 4,46 4,18" fill="#1e293b" stroke="#f59e0b" strokeWidth="2.5" />
                <path d="M32 12 L48 22 L48 42 L32 52 L16 42 L16 22 Z" fill="#2563eb" fillOpacity="0.4" stroke="#60a5fa" strokeWidth="1.5" />
                <line x1="20" y1="20" x2="44" y2="44" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="44" y1="20" x2="20" y2="44" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="32" cy="32" r="4" fill="#fbbf24" />
              </svg>
              <div>
                <div className="text-amber-400 text-[11px] font-bold tracking-widest uppercase">
                  Age of Clash · Three Civilizations RTS
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight drop-shadow-md">
                  世紀帝國：<span className="text-amber-400">亂鬥爭霸</span>
                </h1>
              </div>
            </div>

            {/* Human Civilization Quick Picker & Specialty Card */}
            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{humanParticipant ? '指揮官專屬文明與養成系統' : '參戰文明系統一覽（全 AI 觀戰）'}</span>
                </div>
                <div className="flex items-center gap-1">
                  {CIVILIZATION_LIST.map((civ) => {
                    const active = humanCiv.id === civ.id;
                    return (
                      <button
                        key={civ.id}
                        type="button"
                        data-human-civ={civ.id}
                        onClick={() => {
                          if (humanParticipant) {
                            handleCivilizationChange(humanParticipant.id, civ.id);
                          } else {
                            setPreviewCivId(civ.id);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                          active
                            ? 'bg-amber-500 text-slate-950 border-amber-300 shadow'
                            : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {civ.icon} {civ.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-extrabold text-white flex items-center gap-1.5">
                    <span>{humanCiv.icon}</span>
                    <span>{humanCiv.name}</span>
                    <span className="text-[10px] font-bold text-cyan-300 border border-cyan-500/40 bg-cyan-950/50 px-1.5 py-0.5 rounded">
                      {humanCiv.progressionTitle}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                    {humanCiv.progressionSummary}
                  </p>
                </div>
                <div className="shrink-0 px-2.5 py-1.5 bg-slate-950/90 border border-slate-800 rounded-lg text-[10px] space-y-0.5">
                  <div className="text-amber-300 font-bold">
                    🏛️ 專屬奇觀: {uniqueBldgDef?.name.split(' ')[0]}
                  </div>
                  <div className="text-slate-400">
                    {humanCiv.id === 'anime'
                      ? '⚡ 氣彈超戰士專屬歷練 Lv.1~5 · 科技樹'
                      : humanCiv.id === 'medieval'
                      ? '🛡️ 鍛造工坊護甲光環 · 科技樹研發'
                      : '💚 魔力之泉回血光環 · 科技樹研發'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Map Preset & Resource Richness Selector */}
          <div className="space-y-2 border-t border-slate-800/80 pt-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <MapIcon className="w-4 h-4" />
                <span>戰場地圖地形選擇</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                <Gem className="w-3.5 h-3.5 text-amber-400 ml-1.5" />
                <button
                  type="button"
                  data-richness="standard"
                  onClick={() => onResourceRichnessChange('standard')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                    resourceRichness === 'standard'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  標準資源
                </button>
                <button
                  type="button"
                  data-richness="abundant"
                  onClick={() => onResourceRichnessChange('abundant')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                    resourceRichness === 'abundant'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  豐富資源
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MAP_PRESETS.map((preset) => {
                const active = mapPreset === preset.id;
                const badgeIcon =
                  preset.id === 'river_valley' ? '🌊' : preset.id === 'highland_basin' ? '⛰️' : '🏝️';
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-map-preset={preset.id}
                    onClick={() => onMapPresetChange(preset.id)}
                    className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                      active
                        ? 'bg-amber-500/15 border-amber-400 shadow-lg shadow-amber-900/20'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <MapPreview mapId={preset.id} groundTint={preset.groundTint} />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-white flex items-center gap-1">
                        <span>{badgeIcon}</span>
                        <span>{preset.name}</span>
                      </span>
                      {active && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                          已選
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-2 pt-1">
            {!hasOpposingTeams && (
              <div className="px-3 py-1.5 bg-red-950/80 border border-red-500/60 text-red-200 text-xs font-semibold rounded-lg">
                ⚠️ 請至少分配兩個不同隊伍，才能開始對戰。
              </div>
            )}
            {hasOpposingTeams && !isEngineReady && (
              <div data-engine-loading="true" className="px-3 py-1.5 bg-sky-950/75 border border-sky-500/40 text-sky-200 text-xs font-semibold rounded-lg">
                ◌ 正在載入 3D 戰場與模型資源，完成後即可開始對戰。
              </div>
            )}
            {!hasHumanPlayer && hasOpposingTeams && (
              <div
                data-all-ai-banner="true"
                className="px-3 py-1.5 bg-cyan-950/80 border border-cyan-500/50 text-cyan-200 text-xs font-semibold rounded-lg flex items-center justify-between gap-2"
              >
                <span>👁️ 全 AI 自動混戰觀戰模式：各 AI 將全程自主採集、建城、晉升時代與集群攻防</span>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                data-start="true"
                disabled={!canStart}
                onClick={() => onStart(participants)}
                className="group flex items-center gap-2.5 px-7 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-45 disabled:cursor-not-allowed text-slate-950 font-bold text-base rounded-xl shadow-xl shadow-amber-900/30 cursor-pointer transition-all"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{!isEngineReady ? '載入戰場中…' : hasHumanPlayer ? '開始對戰 (Enter / Space)' : '開始全 AI 觀戰 (Enter / Space)'}</span>
              </button>

              <button
                onClick={onOpenMods}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-100 font-semibold text-sm rounded-xl border border-slate-700 shadow-lg cursor-pointer transition-all"
              >
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>模組 & AI 腳本</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Pre-Match Skirmish Lobby Setup */}
        <div className="w-full lg:w-[515px] p-5 bg-slate-950/92 border border-slate-800 rounded-2xl shadow-2xl flex flex-col justify-between space-y-3 pointer-events-auto">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white">對戰陣容與文明組隊 ({participants.length} / 6 名)</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-all-ai-toggle="true"
                onClick={handleToggleAllAi}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                  !hasHumanPlayer
                    ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/70'
                    : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-500/40'
                }`}
                title="一鍵切換全 AI 觀戰模式或恢復玩家參戰"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>{!hasHumanPlayer ? '恢復玩家參戰' : '全 AI 觀戰'}</span>
              </button>
              <button
                data-add-participant="true"
                onClick={handleAddParticipant}
                disabled={participants.length >= 6}
                className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增成員</span>
              </button>
            </div>
          </div>

          {/* Participant Rows */}
          <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
            {participants.map((p, index) => {
              const pCiv = getCivilizationConfig(p.civilization);
              return (
                <div
                  key={p.id}
                  data-participant-row={p.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 bg-slate-900/90 border border-slate-800 rounded-xl"
                >
                  {/* Color Swatch & Slot Name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/40 shadow"
                      style={{
                        backgroundColor: p.colorCss,
                        borderColor: getTeamVisualColor(p.team).colorCss,
                        boxShadow: `0 0 0 1px ${getTeamVisualColor(p.team).colorCss}`,
                      }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {p.controller === 'player' ? '我方指揮官' : p.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        點位 #{index + 1} · {pCiv.shortName}
                      </div>
                    </div>
                  </div>

                  {/* Controls: Civilization select + Player/AI toggle + Team select + Remove */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      aria-label={`${p.name} 文明選擇`}
                      data-civ-select={p.id}
                      value={pCiv.id}
                      onChange={(e) => handleCivilizationChange(p.id, e.target.value as CivilizationId)}
                      className="px-1.5 py-1 bg-slate-800 border border-slate-700 text-cyan-300 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:border-cyan-400"
                    >
                      {CIVILIZATION_LIST.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon} {c.shortName}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      data-toggle-controller={p.id}
                      onClick={() => handleToggleController(p.id)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                        p.controller === 'player'
                          ? 'bg-blue-600/25 text-blue-300 border-blue-500/50 hover:bg-blue-600/35'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                      title="點擊切換由玩家操控或電腦 AI 操控（支援全員 AI 觀戰）"
                    >
                      {p.controller === 'player' ? (
                        <>
                          <User className="w-3 h-3" />
                          <span>玩家</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-3 h-3 text-rose-400" />
                          <span>AI</span>
                        </>
                      )}
                    </button>

                    {p.controller === 'ai' && (
                      <select
                        aria-label={`${p.name} AI 風格`}
                        value={p.aiPersonality || 'standard'}
                        onChange={(e) =>
                          handleAiPersonalityChange(
                            p.id,
                            e.target.value as 'easy' | 'standard' | 'hard' | 'defensive'
                          )
                        }
                        className="px-1.5 py-1 bg-slate-800 border border-slate-700 text-sky-300 rounded-lg text-[10px] font-bold cursor-pointer focus:outline-none focus:border-sky-500 max-w-[8.5rem]"
                        title="簡單：慢節奏少騷擾｜標準：均衡｜困難：快升時代強壓｜防守練習：幾乎不主動進攻"
                      >
                        <option value="easy">簡單 AI</option>
                        <option value="standard">標準 AI</option>
                        <option value="hard">困難 AI</option>
                        <option value="defensive">防守練習</option>
                      </select>
                    )}

                    <select
                      aria-label={`${p.name} 隊伍選擇`}
                      value={p.team}
                      onChange={(e) => handleTeamChange(p.id, Number(e.target.value))}
                      className="px-1.5 py-1 bg-slate-800 border border-slate-700 text-amber-300 rounded-lg text-[11px] font-bold cursor-pointer focus:outline-none focus:border-amber-500"
                    >
                      <option value={1}>隊1</option>
                      <option value={2}>隊2</option>
                      <option value={3}>隊3</option>
                      <option value={4}>隊4</option>
                    </select>

                    {participants.length > 2 && (
                      <button
                        onClick={() => handleRemoveParticipant(p.id)}
                        className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg cursor-pointer transition-colors"
                        title="移除此參戰成員"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 flex items-center justify-between">
            <span>不同文明擁有專屬建築、兵種與科技養成樹</span>
            <span className="text-amber-400 font-bold">{distinctTeams.size} 支陣營</span>
          </div>
        </div>
      </div>

      {/* Clean borderless control hint in safe margin */}
      <div className="w-full text-center sm:text-left text-xs font-medium text-slate-200 drop-shadow shrink-0">
        WASD 移動視野 · Ctrl+1~9 編組 · H 主堡 / B 軍營 / I 閒置 / Space 全軍 · Q 奧義 / F 推進 / X 停止 · 支援全 AI 自動觀戰
      </div>
    </div>
  );
};
