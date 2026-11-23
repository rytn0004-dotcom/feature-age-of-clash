import type { CivilizationId, LandmarkType } from '../types/game';

/** Canonical civilization-specific landmark identities used by the HUD and match recap. */
export const LANDMARK_NAMES: Readonly<Record<CivilizationId, Readonly<Record<LandmarkType, string>>>> = {
  medieval: {
    landmark_aachen: '聖殿聖光大教堂',
    landmark_barracks: '皇家白塔軍械學院',
    landmark_guildhall: '王國鑄幣行會大廳',
    landmark_citadel: '鐵衛王權城塞',
    landmark_observatory: '帝國星曆觀象台',
    landmark_arsenal: '聖殿重炮軍火總署',
  },
  anime: {
    landmark_aachen: '靈脈御神社',
    landmark_barracks: '蒼嵐武神道場',
    landmark_guildhall: '百忍商盟萬象殿',
    landmark_citadel: '雷影天守要塞',
    landmark_observatory: '天照星盤觀測殿',
    landmark_arsenal: '須佐能乎神兵庫',
  },
  fantasy: {
    landmark_aachen: '生命聖樹神殿',
    landmark_barracks: '秘銀根脈武庫',
    landmark_guildhall: '翡翠商旅秘所',
    landmark_citadel: '森靈古樹聖堡',
    landmark_observatory: '蒼穹星辰聖樹台',
    landmark_arsenal: '龍脈奧術神工坊',
  },
  mongol: {
    landmark_aachen: '長生天敖包聖壇',
    landmark_barracks: '怯薛萬騎大營',
    landmark_guildhall: '絲路萬帳貿易大市',
    landmark_citadel: '大汗鐵騎牙帳城',
    landmark_observatory: '蒼狼天穹觀星台',
    landmark_arsenal: '汗國重炮軍械營',
  },
};

export function getLandmarkName(civilization: CivilizationId, type: LandmarkType): string {
  return LANDMARK_NAMES[civilization][type];
}
