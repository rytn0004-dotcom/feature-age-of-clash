import { BuildingType } from '../types/game';

/**
 * Ergonomic RTS Hotkey Maps (zero overlap with WASD camera panning or Q/F/X/H/B/I/Space/1-9 globals)
 */

export const BUILDING_HOTKEYS: Partial<Record<BuildingType, string>> = {
  town_center: 'C',
  house: 'E',
  lumber_camp: 'L',
  mining_camp: 'G',
  dock: 'J',
  farm: 'R',
  granary: 'N',
  barracks: 'V',
  archery_range: 'Y',
  stable: 'Z',
  siege_workshop: 'M',
  armory_forge: 'K',
  spirit_shrine: 'K',
  mana_well: 'K',
  wall: 'O',
  tower: 'T',
  castle: 'N',
};

export const AGE_ADVANCE_HOTKEY = 'U';
export const FIELD_ENGINEERING_HOTKEY = 'E';
export const UNGARRISON_HOTKEY = 'G';

export const TRAINING_SLOT_HOTKEYS = ['Z', 'C', 'V', 'E'] as const;
export const TECH_SLOT_HOTKEYS = ['R', 'T', 'Y', 'K', 'L', 'O'] as const;

/** Reverse lookup: KeyCode (e.g. 'KeyV') -> key label ('V') */
export function eventCodeToHotkeyLabel(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  return null;
}

export function findBuildingTypeByHotkey(
  keyLabel: string,
  buildableTypes: BuildingType[]
): BuildingType | null {
  const upper = keyLabel.toUpperCase();
  for (const bType of buildableTypes) {
    if (BUILDING_HOTKEYS[bType] === upper) {
      return bType;
    }
  }
  return null;
}

export function findTrainingUnitByHotkey(
  keyLabel: string,
  trainableUnits: string[]
): string | null {
  const idx = TRAINING_SLOT_HOTKEYS.indexOf(keyLabel.toUpperCase() as any);
  if (idx >= 0 && idx < trainableUnits.length) {
    return trainableUnits[idx];
  }
  return null;
}

export function findTechIdByHotkey(
  keyLabel: string,
  buildingTechIds: string[]
): string | null {
  const idx = TECH_SLOT_HOTKEYS.indexOf(keyLabel.toUpperCase() as any);
  if (idx >= 0 && idx < buildingTechIds.length) {
    return buildingTechIds[idx];
  }
  return null;
}

export const HOTKEY_REFERENCE_GROUPS = [
  {
    title: '快捷編隊與快速選取',
    items: [
      { keys: 'Ctrl + 1~9', desc: '將目前部隊設為第 N 隊列' },
      { keys: 'Shift + 1~9', desc: '追加部隊至第 N 隊列' },
      { keys: '1~9 / 連按兩下', desc: '選取第 N 隊列 / 聚焦鏡頭' },
      { keys: '雙擊我方單位', desc: '選取場上同兵種全部單位' },
      { keys: 'Space', desc: '選取全部我方軍事部隊' },
      { keys: 'I', desc: '循環定位閒置村民' },
      { keys: 'H / B', desc: '快速選取城鎮中心 / 軍事建築' },
    ],
  },
  {
    title: '部隊戰術與視野操作',
    items: [
      { keys: 'WASD / 方向鍵 / 螢幕邊緣', desc: '平滑移動戰場視野' },
      { keys: '滑鼠滾輪', desc: '拉近或拉遠攝影機視角縮放' },
      { keys: 'Q', desc: '施放主動文明奧義' },
      { keys: 'F', desc: '攻擊推進 (Attack-Move)' },
      { keys: 'X', desc: '立即停止當前指令' },
      { keys: 'Tab / M / Esc', desc: '頭頂標籤 / 靜音 / 暫停' },
    ],
  },
  {
    title: '村民建造快捷鍵 (選取工人時)',
    items: [
      { keys: 'E / R / L / G / J', desc: '房屋 / 農田 / 伐木場 / 採礦營 / 碼頭' },
      { keys: 'V / Y / Z / M / K', desc: '兵營 / 射箭場 / 馬廄 / 攻城器工坊 / 文明專屬建築' },
      { keys: 'O / T / N / C', desc: '防禦圍牆 / 警戒箭塔 / 要塞城堡 / 主堡' },
      { keys: 'U', desc: '開啟時代地標晉升選單' },
      { keys: 'E (選取步兵；非村民)', desc: '已研發野戰工程後，集結至少 4 名步兵組裝衝車' },
    ],
  },
  {
    title: '建築招募與駐防快捷鍵 (選取建築時)',
    items: [
      { keys: 'Z / C / V / E', desc: '訓練第 1~4 格位單位' },
      { keys: 'R / T / Y / K / L / O', desc: '研發第 1~6 格位科技' },
      { keys: 'G / 右鍵建築', desc: '駐防單位全部撤出 / 派軍進駐建築' },
      { keys: '滑鼠右鍵', desc: '設定集結點 (點資源/農田自動採集)' },
    ],
  },
];
