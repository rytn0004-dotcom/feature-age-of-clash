import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Check,
  Copy,
  Download,
  Upload,
  Cpu,
  Layers,
  Sparkles,
  Sliders,
  Shield,
  Swords,
  Crosshair,
  Zap,
} from 'lucide-react';
import { RtsEngine } from '../game/engine';
import { AiRule, BuildingDefinition, BuildingType, GameMod, TechDefinition, UnitDefinition, UnitCategory } from '../types/game';
import { DEFAULT_BUILDINGS, INITIAL_MODS } from '../game/mods';

interface ModEditorModalProps {
  engine: RtsEngine;
  onClose: () => void;
  onApply: () => void;
}

export const ModEditorModal: React.FC<ModEditorModalProps> = ({ engine, onClose, onApply }) => {
  const [activeTab, setActiveTab] = useState<'switchboard' | 'units' | 'content' | 'ai' | 'json'>('switchboard');
  const [mods, setMods] = useState<GameMod[]>(() => JSON.parse(JSON.stringify(engine.activeMods)));
  const [selectedModIndex, setSelectedModIndex] = useState(0);

  // New unit form state
  const [editingUnit, setEditingUnit] = useState<UnitDefinition | null>(null);
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingType>('town_center');

  // JSON import/export state
  const [jsonText, setJsonText] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const currentMod = mods[selectedModIndex] || mods[0];

  // Save changes to engine
  const handleSaveAndApply = () => {
    engine.activeMods = JSON.parse(JSON.stringify(mods));
    engine.saveModsToLocalStorage();
    onApply();
    onClose();
  };

  const updateSelectedMod = (mutate: (mod: GameMod) => void) => {
    const updated: GameMod[] = JSON.parse(JSON.stringify(mods));
    const target = updated[selectedModIndex];
    if (!target) return;
    mutate(target);
    setMods(updated);
  };

  const handleAddModPack = () => {
    const newPack: GameMod = {
      id: `custom_pack_${Date.now()}`,
      name: '我的跨界模組包',
      author: 'Player',
      description: '自訂角色、英雄、兵種、建築覆寫與專屬科技。',
      version: '1.0.0',
      enabled: true,
      civilizationId: 'shared',
      unitDefinitions: [],
      buildingOverrides: {},
      techDefinitions: [],
      balanceMultipliers: {
        gatherRate: 1,
        unitHp: 1,
        unitDamage: 1,
        buildSpeed: 1,
        moveSpeed: 1,
      },
      aiRules: [],
    };
    setMods([...mods, newPack]);
    setSelectedModIndex(mods.length);
    setActiveTab('content');
  };

  const handleAddCustomTech = () => {
    updateSelectedMod((mod) => {
      const civId = mod.civilizationId || 'shared';
      const tech: TechDefinition = {
        id: `custom_tech_${Date.now()}`,
        civId,
        buildingType: 'town_center',
        name: '新自訂科技',
        icon: '✨',
        description: '自訂陣營專屬科技。',
        effectLabel: '村民採集速度 +20%',
        cost: { food: 100, wood: 50, gold: 50, stone: 0 },
        researchTime: 15,
        requiredAge: 2,
        targetCategories: ['worker'],
        effect: { gatherMultiplier: 1.2 },
      };
      mod.techDefinitions = [...(mod.techDefinitions || []), tech];
    });
  };

  // Toggle mod enabled
  const toggleModEnabled = (index: number) => {
    const updated = [...mods];
    updated[index].enabled = !updated[index].enabled;
    setMods(updated);
  };

  // Update multipliers
  const handleMultiplierChange = (
    key: keyof GameMod['balanceMultipliers'],
    value: number
  ) => {
    const updated = [...mods];
    updated[selectedModIndex].balanceMultipliers[key] = value;
    setMods(updated);
  };

  // Add / Edit Unit
  const handleSaveUnit = (unit: UnitDefinition) => {
    const updated = [...mods];
    const unitList = updated[selectedModIndex].unitDefinitions;
    const existingIdx = unitList.findIndex((u) => u.id === unit.id);
    if (existingIdx >= 0) {
      unitList[existingIdx] = unit;
    } else {
      unitList.push(unit);
    }
    setMods(updated);
    setEditingUnit(null);
  };

  const handleDeleteUnit = (unitId: string) => {
    const updated = [...mods];
    updated[selectedModIndex].unitDefinitions = updated[selectedModIndex].unitDefinitions.filter(
      (u) => u.id !== unitId
    );
    setMods(updated);
  };

  const patchCustomTech = (techId: string, patch: Partial<TechDefinition>) => {
    updateSelectedMod((mod) => {
      mod.techDefinitions = (mod.techDefinitions || []).map((tech) =>
        tech.id === techId ? { ...tech, ...patch } : tech
      );
    });
  };

  const patchCustomTechCost = (techId: string, resource: keyof TechDefinition['cost'], value: number) => {
    updateSelectedMod((mod) => {
      mod.techDefinitions = (mod.techDefinitions || []).map((tech) =>
        tech.id === techId ? { ...tech, cost: { ...tech.cost, [resource]: value } } : tech
      );
    });
  };

  const patchCustomTechEffect = (
    techId: string,
    effectKey: keyof TechDefinition['effect'],
    value: number
  ) => {
    updateSelectedMod((mod) => {
      mod.techDefinitions = (mod.techDefinitions || []).map((tech) =>
        tech.id === techId ? { ...tech, effect: { ...tech.effect, [effectKey]: value } } : tech
      );
    });
  };

  const patchBuildingOverride = (patch: Partial<BuildingDefinition>) => {
    updateSelectedMod((mod) => {
      mod.buildingOverrides = {
        ...(mod.buildingOverrides || {}),
        [selectedBuildingType]: {
          ...(mod.buildingOverrides?.[selectedBuildingType] || {}),
          ...patch,
          cost: {
            ...((mod.buildingOverrides?.[selectedBuildingType] as Partial<BuildingDefinition> | undefined)?.cost || {}),
            ...(patch.cost || {}),
          },
        },
      };
    });
  };

  const patchBuildingCost = (resource: keyof BuildingDefinition['cost'], value: number) => {
    const override = currentMod.buildingOverrides?.[selectedBuildingType];
    patchBuildingOverride({
      cost: {
        ...((override?.cost || {}) as BuildingDefinition['cost']),
        [resource]: value,
      },
    });
  };

  // AI Rule Management
  const handleToggleRule = (ruleId: string) => {
    const updated = [...mods];
    const rules = updated[selectedModIndex].aiRules;
    const rule = rules.find((r) => r.id === ruleId);
    if (rule) rule.enabled = !rule.enabled;
    setMods(updated);
  };

  const handleAddAiRule = () => {
    const updated = [...mods];
    const newRule: AiRule = {
      id: `ai_rule_${Date.now()}`,
      name: '自訂戰術指令 (Custom AI Rule)',
      enabled: true,
      conditions: [{ field: 'food', operator: '>=', value: 80 }],
      action: { type: 'train_unit', targetId: 'swordsman', priority: 55 },
    };
    updated[selectedModIndex].aiRules.push(newRule);
    setMods(updated);
  };

  const handleDeleteAiRule = (ruleId: string) => {
    const updated = [...mods];
    updated[selectedModIndex].aiRules = updated[selectedModIndex].aiRules.filter((r) => r.id !== ruleId);
    setMods(updated);
  };

  // Export JSON
  const handleExportJson = () => {
    const data = JSON.stringify(mods, null, 2);
    setJsonText(data);
    navigator.clipboard?.writeText(data);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  // Import JSON with a minimal schema check before it reaches the game engine.
  const handleImportJson = () => {
    try {
      const parsed: unknown = JSON.parse(jsonText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        alert('匯入失敗：請提供至少一個模組包。');
        return;
      }

      const candidates = parsed as Array<Partial<GameMod>>;
      const valid = candidates.every((mod) =>
        !!mod &&
        typeof mod.id === 'string' &&
        !!mod.id.trim() &&
        typeof mod.name === 'string' &&
        !!mod.name.trim() &&
        Array.isArray(mod.unitDefinitions) &&
        Array.isArray(mod.aiRules) &&
        !!mod.balanceMultipliers &&
        ['gatherRate', 'unitHp', 'unitDamage', 'buildSpeed', 'moveSpeed'].every((key) =>
          Number.isFinite(mod.balanceMultipliers?.[key as keyof GameMod['balanceMultipliers']])
        )
      );
      const ids = candidates.map((mod) => mod.id);
      if (!valid || new Set(ids).size !== ids.length) {
        alert('匯入失敗：模組格式不完整，或模組 ID 重複。請檢查 JSON。');
        return;
      }

      const normalized: GameMod[] = candidates.map((mod) => ({
        ...(mod as GameMod),
        enabled: mod.enabled !== false,
        civilizationId: mod.civilizationId || 'shared',
        buildingOverrides: mod.buildingOverrides || {},
        techDefinitions: Array.isArray(mod.techDefinitions) ? mod.techDefinitions : [],
        unitDefinitions: mod.unitDefinitions || [],
        aiRules: mod.aiRules || [],
      }));
      setMods(normalized);
      setSelectedModIndex(0);
      alert('模組配置匯入成功！點擊右上角「儲存並套用」即可生效。');
    } catch {
      alert('JSON 格式錯誤，請檢查內容後重試。');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Sliders className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-white">模組開關 & AI 戰術指令集編寫器</h2>
              <p className="text-xs text-slate-300">
                自由擴充動漫亂鬥、神話陣營、自訂屬性平衡與自動化 AI 行為腳本
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-900/60">
          <button
            onClick={() => setActiveTab('switchboard')}
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'switchboard'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" /> 模組包與數值平衡
          </button>
          <button
            onClick={() => setActiveTab('units')}
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'units'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" /> 自訂兵種屬性 ({currentMod.unitDefinitions.length})
          </button>
          <button
            onClick={() => setActiveTab('content')}
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'content'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" /> 科技與建築內容
          </button>
          <button
            onClick={() => setActiveTab('ai')
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'ai'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" /> AI 戰術指令集編寫
          </button>
          <button
            onClick={() => {
              setActiveTab('json');
              setJsonText(JSON.stringify(mods, null, 2));
            }}
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'json'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Copy className="w-4 h-4" /> 匯出 / 匯入 JSON
          </button>
        </div>

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: MOD SWITCHBOARD & BALANCE */}
          {activeTab === 'switchboard' && (
            <div className="space-y-6">
              {/* Mod Packs Switchboard */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-white">已安裝的擴充模組包 (Installed Packs)</h3>
                  <button
                    onClick={handleAddModPack}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> 新增跨界模組
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {mods.map((mod, idx) => (
                    <div
                      key={mod.id}
                      onClick={() => setSelectedModIndex(idx)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        selectedModIndex === idx
                          ? 'bg-slate-800/90 border-amber-500 shadow-md'
                          : 'bg-slate-850/60 border-slate-700/60 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-white text-sm">{mod.name}</span>
                        <input
                          type="checkbox"
                          checked={mod.enabled}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleModEnabled(idx);
                          }}
                          className="w-4 h-4 accent-amber-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2 mb-3">{mod.description}</p>
                      <div className="flex justify-between items-center text-[11px] text-slate-400">
                        <span>收錄 {mod.unitDefinitions.length} 個單位</span>
                        <span className={`font-bold ${mod.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {mod.enabled ? '● 啟用中' : '○ 已關閉'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Global Balance Multipliers */}
              <div className="p-4 bg-slate-800/60 border border-slate-700 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-amber-400">
                    「{currentMod.name}」即時平衡性調節器 (Balance Multipliers)
                  </h3>
                  <button
                    onClick={() => {
                      const updated = [...mods];
                      updated[selectedModIndex].balanceMultipliers = {
                        gatherRate: 1,
                        unitHp: 1,
                        unitDamage: 1,
                        buildSpeed: 1,
                        moveSpeed: 1,
                      };
                      setMods(updated);
                    }}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    重置為 1.0x 預設
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Gather Rate */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>資源採集速率</span>
                      <span className="text-amber-400 font-mono font-bold">
                        {currentMod.balanceMultipliers.gatherRate}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={currentMod.balanceMultipliers.gatherRate}
                      onChange={(e) => handleMultiplierChange('gatherRate', parseFloat(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  {/* Unit HP */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>單位生命值 (HP)</span>
                      <span className="text-emerald-400 font-mono font-bold">
                        {currentMod.balanceMultipliers.unitHp}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={currentMod.balanceMultipliers.unitHp}
                      onChange={(e) => handleMultiplierChange('unitHp', parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  {/* Unit Damage */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>單位攻擊力傷害</span>
                      <span className="text-red-400 font-mono font-bold">
                        {currentMod.balanceMultipliers.unitDamage}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={currentMod.balanceMultipliers.unitDamage}
                      onChange={(e) => handleMultiplierChange('unitDamage', parseFloat(e.target.value))}
                      className="w-full accent-red-500 cursor-pointer"
                    />
                  </div>

                  {/* Move Speed */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>移動奔跑速度</span>
                      <span className="text-purple-400 font-mono font-bold">
                        {currentMod.balanceMultipliers.moveSpeed}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.05"
                      value={currentMod.balanceMultipliers.moveSpeed}
                      onChange={(e) => handleMultiplierChange('moveSpeed', parseFloat(e.target.value))}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>

                  {/* Build Speed */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>建造與訓練產能</span>
                      <span className="text-blue-400 font-mono font-bold">
                        {currentMod.balanceMultipliers.buildSpeed}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={currentMod.balanceMultipliers.buildSpeed}
                      onChange={(e) => handleMultiplierChange('buildSpeed', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: UNIT ATTRIBUTE BALANCER & CREATOR */}
          {activeTab === 'units' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-300">
                  當前模組: <strong className="text-amber-400">{currentMod.name}</strong>
                </span>
                <button
                  onClick={() =>
                    setEditingUnit({
                      id: `custom_unit_${Date.now()}`,
                      name: '新自訂角色 (Custom Hero)',
                      factionPack: currentMod.id,
                      isHero: true,
                      availableInBuildings: ['barracks', 'castle'],
                      category: 'melee',
                      description: '玩家自創的強大戰鬥單位！',
                      stats: {
                        maxHp: 150,
                        attack: 20,
                        defense: 3,
                        range: 1.5,
                        speed: 4.2,
                        attackRate: 1.2,
                        cost: { food: 80, wood: 20, gold: 50, stone: 0 },
                        trainTime: 12,
                        gatherSpeed: 0,
                        carryCapacity: 0,
                      },
                      visual: {
                        color: '#a855f7',
                        modelType: 'saiyan',
                        scale: 1.2,
                        projectileType: 'ki_blast',
                      },
                      specialAbility: {
                        name: '奧義大爆發 (Ultimate Burst)',
                        type: 'ki_burst',
                        cooldown: 12,
                        potency: 60,
                        description: '釋放毀滅能量爆風。',
                      },
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow"
                >
                  <Plus className="w-4 h-4" /> 新增自訂單位
                </button>
              </div>

              {/* Unit List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentMod.unitDefinitions.map((unit) => (
                  <div
                    key={unit.id}
                    className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: unit.visual.color }} />
                        <div>
                          <div className="font-bold text-white text-sm">{unit.name} {unit.isHero && <span className="text-[10px] text-amber-300">★ 英雄</span>}</div>
                          <div className="text-[11px] text-slate-400">{unit.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingUnit(JSON.parse(JSON.stringify(unit)))}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs cursor-pointer"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleDeleteUnit(unit.id)}
                          className="p-1 text-red-400 hover:text-red-300 rounded cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Stats pills */}
                    <div className="grid grid-cols-4 gap-1 text-[11px] bg-slate-900/60 p-2 rounded-lg text-slate-300">
                      <div>生命: <strong className="text-emerald-400">{unit.stats.maxHp}</strong></div>
                      <div>攻擊: <strong className="text-red-400">{unit.stats.attack}</strong></div>
                      <div>防禦: <strong className="text-blue-400">{unit.stats.defense}</strong></div>
                      <div>射程: <strong className="text-amber-400">{unit.stats.range}</strong></div>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-amber-300 font-mono">
                      <span>
                        花費: {unit.stats.cost.food}F {unit.stats.cost.wood}W {unit.stats.cost.gold}G
                      </span>
                      <span className="text-slate-400">外觀: {unit.visual.modelType}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Edit Unit Modal / Sub-form */}
              {editingUnit && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-lg w-full space-y-4 shadow-2xl">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <h4 className="font-bold text-white text-sm">編輯單位屬性</h4>
                      <button onClick={() => setEditingUnit(null)} className="text-slate-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-slate-300 block mb-1">名稱</label>
                        <input
                          type="text"
                          value={editingUnit.name}
                          onChange={(e) => setEditingUnit({ ...editingUnit, name: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1">模型樣式</label>
                        <select
                          value={editingUnit.visual.modelType}
                          onChange={(e) =>
                            setEditingUnit({
                              ...editingUnit,
                              visual: { ...editingUnit.visual, modelType: e.target.value as any },
                            })
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                        >
                          <option value="villager">村民 (Villager)</option>
                          <option value="swordsman">劍士 (Swordsman)</option>
                          <option value="archer">弓兵 (Archer)</option>
                          <option value="knight">騎士 (Knight)</option>
                          <option value="ninja">木葉忍者 (Ninja)</option>
                          <option value="saiyan">賽亞戰士 (Saiyan)</option>
                          <option value="mage">大法師 (Mage)</option>
                          <option value="golem">石精/樹精 (Golem)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-slate-300 block mb-1">生命值 (HP)</label>
                        <input
                          type="number"
                          value={editingUnit.stats.maxHp}
                          onChange={(e) =>
                            setEditingUnit({
                              ...editingUnit,
                              stats: { ...editingUnit.stats, maxHp: parseInt(e.target.value) || 1 },
                            })
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                        />
                      </div>

                      <div>
                        <label className="text-slate-300 block mb-1">攻擊力 (Attack)</label>
                        <input
                          type="number"
                          value={editingUnit.stats.attack}
                          onChange={(e) =>
                            setEditingUnit({
                              ...editingUnit,
                              stats: { ...editingUnit.stats, attack: parseInt(e.target.value) || 0 },
                            })
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                        />
                      </div>

                      <div>
                        <label className="text-slate-300 block mb-1">防禦力 (Defense)</label>
                        <input
                          type="number"
                          value={editingUnit.stats.defense}
                          onChange={(e) =>
                            setEditingUnit({
                              ...editingUnit,
                              stats: { ...editingUnit.stats, defense: parseInt(e.target.value) || 0 },
                            })
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                        />
                      </div>

                      <div>
                        <label className="text-slate-300 block mb-1">攻擊射程 (Range)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={editingUnit.stats.range}
                          onChange={(e) =>
                            setEditingUnit({
                              ...editingUnit,
                              stats: { ...editingUnit.stats, range: parseFloat(e.target.value) || 1 },
                            })
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-slate-300 block mb-1">角色描述</label>
                        <textarea
                          rows={2}
                          value={editingUnit.description}
                          onChange={(e) => setEditingUnit({ ...editingUnit, description: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1">兵種分類</label>
                        <select
                          value={editingUnit.category}
                          onChange={(e) => setEditingUnit({ ...editingUnit, category: e.target.value as UnitCategory })}
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                        >
                          <option value="worker">工人 / 採集者</option>
                          <option value="melee">近戰步兵</option>
                          <option value="ranged">遠程兵種</option>
                          <option value="cavalry">騎兵</option>
                          <option value="siege">攻城單位</option>
                          <option value="special">特殊兵種 / 英雄</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-300 block mb-1">需求時代</label>
                        <select
                          value={editingUnit.requiredAge || 0}
                          onChange={(e) => setEditingUnit({
                            ...editingUnit,
                            requiredAge: Number(e.target.value) === 0 ? undefined : Number(e.target.value) as 1 | 2 | 3 | 4,
                          })}
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                        >
                          <option value={0}>不限制</option>
                          <option value={1}>時代 I</option>
                          <option value={2}>時代 II</option>
                          <option value={3}>時代 III</option>
                          <option value={4}>時代 IV</option>
                        </select>
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!editingUnit.isHero}
                          onChange={(e) => setEditingUnit({ ...editingUnit, isHero: e.target.checked })}
                          className="accent-amber-500"
                        />
                        <label className="text-amber-300 font-bold">標記為英雄 / 跨界角色</label>
                      </div>
                      <div className="col-span-2">
                        <div className="text-slate-300 mb-2">可訓練建築（選擇後會自動加入該建築的招募清單）</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {([
                            ['town_center', '城鎮中心'],
                            ['barracks', '兵營'],
                            ['archery_range', '射箭場'],
                            ['castle', '城堡'],
                          ] as [BuildingType, string][]).map(([type, label]) => (
                            <label key={type} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                              <input
                                type="checkbox"
                                checked={(editingUnit.availableInBuildings || []).includes(type)}
                                onChange={(e) => {
                                  const current = editingUnit.availableInBuildings || [];
                                  const nextBuildings = e.target.checked
                                    ? [...current, type]
                                    : current.filter((item) => item !== type);
                                  setEditingUnit({ ...editingUnit, availableInBuildings: nextBuildings });
                                }}
                                className="accent-amber-500"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="col-span-2 border-t border-slate-800 pt-3">
                        <div className="text-amber-300 font-bold mb-2">訓練成本與經濟屬性</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {(['food', 'wood', 'gold', 'stone'] as const).map((resource) => (
                            <label key={resource} className="text-slate-400">
                              {resource === 'food' ? '糧食' : resource === 'wood' ? '木材' : resource === 'gold' ? '黃金' : '石料'}
                              <input
                                type="number" min="0" value={editingUnit.stats.cost[resource]}
                                onChange={(e) => setEditingUnit({
                                  ...editingUnit,
                                  stats: { ...editingUnit.stats, cost: { ...editingUnit.stats.cost, [resource]: Math.max(0, Number(e.target.value) || 0) } },
                                })}
                                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                              />
                            </label>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                          {([
                            ['trainTime', '訓練秒數'],
                            ['speed', '移動速度'],
                            ['attackRate', '每秒攻擊次數'],
                            ['gatherSpeed', '採集速度'],
                            ['carryCapacity', '攜帶容量'],
                          ] as const).map(([key, label]) => (
                            <label key={key} className="text-slate-400">
                              {label}
                              <input
                                type="number" min="0" step="0.1" value={editingUnit.stats[key]}
                                onChange={(e) => setEditingUnit({
                                  ...editingUnit,
                                  stats: { ...editingUnit.stats, [key]: Math.max(0, Number(e.target.value) || 0) },
                                })}
                                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="col-span-2 border-t border-slate-800 pt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!editingUnit.specialAbility}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditingUnit({
                                  ...editingUnit,
                                  specialAbility: editingUnit.specialAbility || {
                                    name: '自訂奧義',
                                    type: 'ki_burst',
                                    cooldown: 15,
                                    potency: 50,
                                    description: '釋放角色專屬特殊能力。',
                                  },
                                });
                              } else {
                                const { specialAbility, ...withoutAbility } = editingUnit;
                                setEditingUnit(withoutAbility);
                              }
                            }}
                            className="accent-purple-500"
                          />
                          <span className="text-purple-300 font-bold">啟用角色專屬特殊技能</span>
                        </div>
                        {editingUnit.specialAbility && (
                          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-950/70 p-3">
                            <label className="text-slate-400">技能名稱
                              <input
                                value={editingUnit.specialAbility.name}
                                onChange={(e) => setEditingUnit({
                                  ...editingUnit,
                                  specialAbility: { ...editingUnit.specialAbility!, name: e.target.value },
                                })}
                                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                              />
                            </label>
                            <label className="text-slate-400">技能類型
                              <select
                                value={editingUnit.specialAbility.type}
                                onChange={(e) => setEditingUnit({
                                  ...editingUnit,
                                  specialAbility: { ...editingUnit.specialAbility!, type: e.target.value as NonNullable<UnitDefinition['specialAbility']>['type'] },
                                })}
                                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                              >
                                <option value="whirlwind">旋風斬</option>
                                <option value="ki_burst">能量爆發</option>
                                <option value="heal">治療</option>
                                <option value="haste">全軍加速</option>
                              </select>
                            </label>
                            <label className="text-slate-400">冷卻秒數
                              <input
                                type="number" min="3" value={editingUnit.specialAbility.cooldown}
                                onChange={(e) => setEditingUnit({
                                  ...editingUnit,
                                  specialAbility: { ...editingUnit.specialAbility!, cooldown: Math.max(3, Number(e.target.value) || 3) },
                                })}
                                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                              />
                            </label>
                            <label className="text-slate-400">技能威力 / 治療量
                              <input
                                type="number" min="1" value={editingUnit.specialAbility.potency}
                                onChange={(e) => setEditingUnit({
                                  ...editingUnit,
                                  specialAbility: { ...editingUnit.specialAbility!, potency: Math.max(1, Number(e.target.value) || 1) },
                                })}
                                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                              />
                            </label>
                            <label className="col-span-2 text-slate-400">技能敘述
                              <textarea
                                rows={2} value={editingUnit.specialAbility.description}
                                onChange={(e) => setEditingUnit({
                                  ...editingUnit,
                                  specialAbility: { ...editingUnit.specialAbility!, description: e.target.value },
                                })}
                                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => setEditingUnit(null)}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleSaveUnit(editingUnit)}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-xs cursor-pointer shadow"
                      >
                        儲存此角色
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CUSTOM CONTENT: MOD SCOPE, TECH TREE AND BUILDING OVERRIDES */}
          {activeTab === 'content' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-emerald-300">跨界模組內容設定</h3>
                    <p className="text-[11px] text-slate-400">設定模組所屬陣營；選擇「共享」即可讓所有陣營使用其中的角色與科技。</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {currentMod.unitDefinitions.length} 角色 · {(currentMod.techDefinitions || []).length} 科技
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">模組名稱</label>
                    <input
                      value={currentMod.name}
                      onChange={(e) => updateSelectedMod((mod) => { mod.name = e.target.value; })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">適用陣營</label>
                    <select
                      value={currentMod.civilizationId || 'shared'}
                      onChange={(e) => updateSelectedMod((mod) => {
                        mod.civilizationId = e.target.value as GameMod['civilizationId'];
                        (mod.techDefinitions || []).forEach((tech) => {
                          tech.civId = mod.civilizationId || 'shared';
                        });
                      })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"
                    >
                      <option value="shared">共享跨界內容（所有陣營）</option>
                      <option value="medieval">聖殿鐵衛帝國</option>
                      <option value="anime">蒼嵐忍道聯盟</option>
                      <option value="fantasy">秘銀森靈聖域</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-300 mb-1">模組說明</label>
                    <textarea
                      rows={2}
                      value={currentMod.description}
                      onChange={(e) => updateSelectedMod((mod) => { mod.description = e.target.value; })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white resize-y"
                    />
                  </div>
                </div>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">陣營專屬科技</h3>
                    <p className="text-[11px] text-slate-400">科技會出現在指定建築的研發清單，效果支援採集、生命、攻擊、防禦、速度及技能冷卻。</p>
                  </div>
                  <button
                    onClick={handleAddCustomTech}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg text-xs font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" /> 新增科技
                  </button>
                </div>

                {(currentMod.techDefinitions || []).length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-400">
                    這個模組尚未建立自訂科技。新增後可設定研發建築、時代、成本及效果。
                  </div>
                )}

                {(currentMod.techDefinitions || []).map((tech) => (
                  <div key={tech.id} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          value={tech.name}
                          onChange={(e) => patchCustomTech(tech.id, { name: e.target.value })}
                          aria-label="科技名稱"
                          className="bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"
                        />
                        <div className="flex gap-2">
                          <input
                            value={tech.icon}
                            onChange={(e) => patchCustomTech(tech.id, { icon: e.target.value })}
                            aria-label="科技圖示"
                            className="w-14 bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"
                          />
                          <select
                            value={tech.buildingType}
                            onChange={(e) => patchCustomTech(tech.id, { buildingType: e.target.value as BuildingType })}
                            aria-label="研發建築"
                            className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white"
                          >
                            <option value="town_center">城鎮中心</option>
                            <option value="barracks">兵營</option>
                            <option value="archery_range">射箭場</option>
                            <option value="armory_forge">鍛造工坊</option>
                            <option value="spirit_shrine">靈脈神社</option>
                            <option value="mana_well">魔力之泉</option>
                            <option value="castle">城堡</option>
                          </select>
                        </div>
                      </div>
                      <button
                        onClick={() => updateSelectedMod((mod) => {
                          mod.techDefinitions = (mod.techDefinitions || []).filter((item) => item.id !== tech.id);
                        })}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="刪除科技"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={tech.description}
                      onChange={(e) => patchCustomTech(tech.id, { description: e.target.value })}
                      placeholder="科技描述"
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={tech.effectLabel}
                        onChange={(e) => patchCustomTech(tech.id, { effectLabel: e.target.value })}
                        placeholder="效果摘要，例如採集速度 +20%"
                        className="bg-slate-950 border border-slate-700 rounded p-2 text-xs text-emerald-300"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] text-slate-400">研發秒數
                          <input
                            type="number" min="1" step="1" value={tech.researchTime}
                            onChange={(e) => patchCustomTech(tech.id, { researchTime: Math.max(1, Number(e.target.value) || 1) })}
                            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white"
                          />
                        </label>
                        <label className="text-[10px] text-slate-400">需求時代
                          <select
                            value={tech.requiredAge || 1}
                            onChange={(e) => patchCustomTech(tech.id, { requiredAge: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white"
                          >
                            {[1, 2, 3, 4].map((age) => <option key={age} value={age}>時代 {age}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(['food', 'wood', 'gold', 'stone'] as const).map((resource) => (
                        <label key={resource} className="text-[10px] text-slate-400">
                          {resource === 'food' ? '糧食' : resource === 'wood' ? '木材' : resource === 'gold' ? '黃金' : '石料'}
                          <input
                            type="number" min="0" value={tech.cost[resource]}
                            onChange={(e) => patchCustomTechCost(tech.id, resource, Math.max(0, Number(e.target.value) || 0))}
                            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white"
                          />
                        </label>
                      ))}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-amber-300 mb-2">科技效果（數值為加成或倍率）</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {([
                          ['gatherMultiplier', '採集倍率', 1],
                          ['hpMultiplier', '生命倍率', 1],
                          ['speedMultiplier', '移動倍率', 1],
                          ['cooldownMultiplier', '技能冷卻倍率', 1],
                          ['attackBonus', '攻擊加成', 0],
                          ['defenseBonus', '防禦加成', 0],
                          ['rangeBonus', '射程加成', 0],
                        ] as const).map(([key, label, fallback]) => (
                          <label key={key} className="text-[10px] text-slate-400">
                            {label}
                            <input
                              type="number" min="0" step="0.05"
                              value={tech.effect[key] ?? fallback}
                              onChange={(e) => patchCustomTechEffect(tech.id, key, Math.max(0, Number(e.target.value) || 0))}
                              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </section>

              <section className="space-y-3 border-t border-slate-800 pt-4">
                <div>
                  <h3 className="text-sm font-bold text-white">建築屬性覆寫</h3>
                  <p className="text-[11px] text-slate-400">目前以既有 3D 建築模型為模板，可為本模組獨立調整成本、生命、建造時間、人口及可訓練兵種。</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedBuildingType}
                    onChange={(e) => setSelectedBuildingType(e.target.value as BuildingType)}
                    className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  >
                    {([
                      ['town_center', '城鎮中心'],
                      ['barracks', '兵營'],
                      ['archery_range', '射箭場'],
                      ['farm', '農田'],
                      ['lumber_camp', '伐木場'],
                      ['mining_camp', '採礦場'],
                      ['tower', '箭塔'],
                      ['castle', '城堡'],
                      ['armory_forge', '鍛造工坊'],
                      ['spirit_shrine', '靈脈神社'],
                      ['mana_well', '魔力之泉'],
                    ] as [BuildingType, string][]).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
                  </select>
                  <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-400">
                    {currentMod.buildingOverrides?.[selectedBuildingType] ? '此建築已有自訂覆寫' : '目前使用遊戲預設值'}
                  </div>
                </div>
                {(() => {
                  const base = DEFAULT_BUILDINGS[selectedBuildingType];
                  const override = currentMod.buildingOverrides?.[selectedBuildingType] || {};
                  const effectiveName = override.name || base.name;
                  const effectiveHp = override.maxHp ?? base.maxHp;
                  const effectiveTime = override.buildTime ?? base.buildTime;
                  const effectiveSize = override.size ?? base.size;
                  const effectivePop = override.populationProvided ?? base.populationProvided ?? 0;
                  const effectiveCost = { ...base.cost, ...(override.cost || {}) };
                  return (
                    <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="text-[10px] text-slate-400">建築顯示名稱
                          <input value={effectiveName} onChange={(e) => patchBuildingOverride({ name: e.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white" />
                        </label>
                        <label className="text-[10px] text-slate-400">最大生命值
                          <input type="number" min="1" value={effectiveHp} onChange={(e) => patchBuildingOverride({ maxHp: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white" />
                        </label>
                        <label className="text-[10px] text-slate-400">建造秒數
                          <input type="number" min="1" value={effectiveTime} onChange={(e) => patchBuildingOverride({ buildTime: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white" />
                        </label>
                        <label className="text-[10px] text-slate-400">人口供應
                          <input type="number" min="0" value={effectivePop} onChange={(e) => patchBuildingOverride({ populationProvided: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white" />
                        </label>
                        <label className="text-[10px] text-slate-400">建築碰撞尺寸
                          <input type="number" min="0.5" step="0.5" value={effectiveSize} onChange={(e) => patchBuildingOverride({ size: Math.max(0.5, Number(e.target.value) || 0.5) })} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white" />
                        </label>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {(['food', 'wood', 'gold', 'stone'] as const).map((resource) => (
                          <label key={resource} className="text-[10px] text-slate-400">
                            {resource === 'food' ? '糧食' : resource === 'wood' ? '木材' : resource === 'gold' ? '黃金' : '石料'}
                            <input type="number" min="0" value={effectiveCost[resource]} onChange={(e) => patchBuildingCost(resource, Math.max(0, Number(e.target.value) || 0))} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white" />
                          </label>
                        ))}
                      </div>
                      <label className="block text-[10px] text-slate-400">可訓練兵種 ID（以逗號分隔；留空則沿用陣營預設）
                        <input
                          value={override.trainableUnits ? override.trainableUnits.join(', ') : ''}
                          placeholder={base.trainableUnits.join(', ')}
                          onChange={(e) => patchBuildingOverride({ trainableUnits: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
                          className="mt-1 w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs font-mono text-white"
                        />
                      </label>
                      <button
                        onClick={() => updateSelectedMod((mod) => {
                          const next = { ...(mod.buildingOverrides || {}) };
                          delete next[selectedBuildingType];
                          mod.buildingOverrides = next;
                        })}
                        className="text-[11px] text-slate-400 hover:text-white underline"
                      >
                        清除此建築覆寫
                      </button>
                    </div>
                  );
                })()}
              </section>
            </div>
          )}

          {/* TAB 3: VISUAL AI TACTICS SCRIPTING */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center gap-2 flex-wrap">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-200 block">
                    多分類即時戰術引擎：AI 會同時評估「採集重心 / 募兵編制 / 擴建升級 / 攻防調度」，互不阻塞。
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    戰鬥自動執行「1v1 克制選敵」（騎兵/忍者切後排、投石機拆塔、近戰攔截威脅）與「集群集火推進」。
                  </span>
                </div>
                <button
                  onClick={handleAddAiRule}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow shrink-0"
                >
                  <Plus className="w-4 h-4" /> 新增 AI 戰術指令
                </button>
              </div>

              {/* Rules List */}
              <div className="space-y-3">
                {currentMod.aiRules.map((rule) => (
                  <div
                    key={rule.id}
                    data-ai-rule={rule.id}
                    className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => handleToggleRule(rule.id)}
                          className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                        />
                        <input
                          type="text"
                          value={rule.name}
                          onChange={(e) => {
                            const updated = [...mods];
                            const r = updated[selectedModIndex].aiRules.find((item) => item.id === rule.id);
                            if (r) r.name = e.target.value;
                            setMods(updated);
                          }}
                          className="font-bold text-white text-sm bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none w-full truncate"
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="text-xs text-amber-400 font-mono flex items-center gap-1">
                          <span>優先級:</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={rule.action.priority}
                            onChange={(e) => {
                              const updated = [...mods];
                              const r = updated[selectedModIndex].aiRules.find((item) => item.id === rule.id);
                              if (r) r.action.priority = Number(e.target.value) || 1;
                              setMods(updated);
                            }}
                            className="w-12 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-amber-300 text-center"
                          />
                        </label>
                        <button
                          onClick={() => handleDeleteAiRule(rule.id)}
                          className="text-red-400 hover:text-red-300 p-1 cursor-pointer"
                          title="刪除規則"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Editable Condition & Action Visual Block */}
                    <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 font-bold rounded">
                        IF (條件)
                      </span>
                      {rule.conditions.map((cond, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-1 bg-slate-950/90 px-1.5 py-0.5 rounded border border-slate-700/80">
                          <select
                            value={cond.field}
                            onChange={(e) => {
                              const updated = [...mods];
                              const r = updated[selectedModIndex].aiRules.find((item) => item.id === rule.id);
                              if (r) r.conditions[cIdx].field = e.target.value as any;
                              setMods(updated);
                            }}
                            className="bg-transparent text-cyan-300 font-mono text-[11px] focus:outline-none cursor-pointer"
                          >
                            <option value="food" className="bg-slate-900">food (糧食)</option>
                            <option value="wood" className="bg-slate-900">wood (木材)</option>
                            <option value="gold" className="bg-slate-900">gold (黃金)</option>
                            <option value="stone" className="bg-slate-900">stone (石料)</option>
                            <option value="workerCount" className="bg-slate-900">workerCount (工人)</option>
                            <option value="armyCount" className="bg-slate-900">armyCount (軍力)</option>
                            <option value="enemyArmyCount" className="bg-slate-900">enemyArmyCount (敵軍)</option>
                            <option value="age" className="bg-slate-900">age (時代)</option>
                            <option value="buildingCount" className="bg-slate-900">buildingCount (建築)</option>
                            <option value="underAttack" className="bg-slate-900">underAttack (遇襲)</option>
                            <option value="enemyProximity" className="bg-slate-900">enemyProximity (敵距)</option>
                            <option value="gameTime" className="bg-slate-900">gameTime (秒數)</option>
                          </select>
                          <select
                            value={cond.operator}
                            onChange={(e) => {
                              const updated = [...mods];
                              const r = updated[selectedModIndex].aiRules.find((item) => item.id === rule.id);
                              if (r) r.conditions[cIdx].operator = e.target.value as any;
                              setMods(updated);
                            }}
                            className="bg-transparent text-amber-300 font-mono text-[11px] focus:outline-none cursor-pointer"
                          >
                            {['>=', '<=', '>', '<', '==', '!='].map((op) => (
                              <option key={op} value={op} className="bg-slate-900">{op}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={cond.value}
                            onChange={(e) => {
                              const updated = [...mods];
                              const r = updated[selectedModIndex].aiRules.find((item) => item.id === rule.id);
                              if (r) r.conditions[cIdx].value = Number(e.target.value) || 0;
                              setMods(updated);
                            }}
                            className="w-14 bg-slate-900 text-white font-mono text-[11px] px-1 rounded border border-slate-700 text-center"
                          />
                        </div>
                      ))}

                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 font-bold rounded ml-1">
                        THEN (執行)
                      </span>
                      <select
                        value={rule.action.type}
                        onChange={(e) => {
                          const updated = [...mods];
                          const r = updated[selectedModIndex].aiRules.find((item) => item.id === rule.id);
                          if (r) r.action.type = e.target.value as any;
                          setMods(updated);
                        }}
                        className="px-2 py-0.5 bg-slate-950 border border-emerald-500/40 rounded font-bold text-emerald-300 text-[11px] cursor-pointer"
                      >
                        <option value="defend_base">DEFEND_BASE (全員迎擊回防)</option>
                        <option value="cluster_attack">CLUSTER_ATTACK (集群集火總攻)</option>
                        <option value="patrol_mid">PATROL_MID (前線集結列陣)</option>
                        <option value="gather_priority">GATHER_PRIORITY (調配採集重心)</option>
                        <option value="train_unit">TRAIN_UNIT (招募指定兵種)</option>
                        <option value="advance_age">ADVANCE_AGE (建造時代地標)</option>
                        <option value="build">BUILD (建造軍事/防禦建築)</option>
                        <option value="attack_player">ATTACK_PLAYER (一般推進)</option>
                        <option value="retreat_to_base">RETREAT_TO_BASE (守軍撤回基地)</option>
                      </select>

                      {(rule.action.type === 'train_unit' ||
                        rule.action.type === 'gather_priority' ||
                        rule.action.type === 'build' ||
                        rule.action.type === 'advance_age') && (
                        <input
                          type="text"
                          value={rule.action.targetId || ''}
                          placeholder="目標 ID"
                          onChange={(e) => {
                            const updated = [...mods];
                            const r = updated[selectedModIndex].aiRules.find((item) => item.id === rule.id);
                            if (r) r.action.targetId = e.target.value;
                            setMods(updated);
                          }}
                          className="w-32 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-amber-200 font-mono text-[11px]"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: JSON IMPORT / EXPORT */}
          {activeTab === 'json' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-300">
                  複製或貼上 JSON 格式模組與指令集，方便分享與備份。
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold cursor-pointer border border-slate-700"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copySuccess ? '已複製！' : '複製到剪貼簿'}</span>
                  </button>
                  <button
                    onClick={handleImportJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold cursor-pointer shadow"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>讀取貼上的 JSON</span>
                  </button>
                </div>
              </div>

              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={12}
                className="w-full bg-slate-950 font-mono text-xs text-amber-300/90 p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-800/80 border-t border-slate-700 flex justify-between items-center">
          <button
            onClick={() => {
              setMods(JSON.parse(JSON.stringify(INITIAL_MODS)));
            }}
            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
          >
            重置所有模組回預設值
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSaveAndApply}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer shadow-lg shadow-amber-900/30 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> 儲存並套用變更
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
