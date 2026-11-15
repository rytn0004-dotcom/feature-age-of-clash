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
import { AiRule, GameMod, UnitDefinition } from '../types/game';
import { INITIAL_MODS } from '../game/mods';

interface ModEditorModalProps {
  engine: RtsEngine;
  onClose: () => void;
  onApply: () => void;
}

export const ModEditorModal: React.FC<ModEditorModalProps> = ({ engine, onClose, onApply }) => {
  const [activeTab, setActiveTab] = useState<'switchboard' | 'units' | 'ai' | 'json'>('switchboard');
  const [mods, setMods] = useState<GameMod[]>(() => JSON.parse(JSON.stringify(engine.activeMods)));
  const [selectedModIndex, setSelectedModIndex] = useState(0);

  // New unit form state
  const [editingUnit, setEditingUnit] = useState<UnitDefinition | null>(null);

  // JSON import/export state
  const [jsonText, setJsonText] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const currentMod = mods[selectedModIndex] || mods[0];

  // Save changes to engine
  const handleSaveAndApply = () => {
    engine.activeMods = JSON.parse(JSON.stringify(mods));
    onApply();
    onClose();
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

  // AI Rule Management
  const handleToggleRule = (ruleId: string) => {
    const updated = [...mods];
    const rules = updated[0].aiRules;
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
    updated[0].aiRules.push(newRule);
    setMods(updated);
  };

  const handleDeleteAiRule = (ruleId: string) => {
    const updated = [...mods];
    updated[0].aiRules = updated[0].aiRules.filter((r) => r.id !== ruleId);
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

  // Import JSON
  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        setMods(parsed);
        alert('模組配置匯入成功！點擊右上角「儲存並套用」即可生效。');
      }
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
            onClick={() => setActiveTab('ai')}
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
                <h3 className="text-sm font-bold text-white mb-3">已安裝的擴充模組包 (Installed Packs)</h3>
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
                          <div className="font-bold text-white text-sm">{unit.name}</div>
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
                {mods[0].aiRules.map((rule) => (
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
                            const r = updated[0].aiRules.find((item) => item.id === rule.id);
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
                              const r = updated[0].aiRules.find((item) => item.id === rule.id);
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
                              const r = updated[0].aiRules.find((item) => item.id === rule.id);
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
                              const r = updated[0].aiRules.find((item) => item.id === rule.id);
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
                              const r = updated[0].aiRules.find((item) => item.id === rule.id);
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
                          const r = updated[0].aiRules.find((item) => item.id === rule.id);
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
                            const r = updated[0].aiRules.find((item) => item.id === rule.id);
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
