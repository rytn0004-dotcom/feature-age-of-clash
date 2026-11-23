import type { ResourceNode } from '../types/game';

export interface WildlifeBadgePresentation {
  title: string;
  icon: string;
  valueText: string;
  ratio: number;
  actionText: string;
  signature: string;
}

/** Produces a stable overhead badge state from the wildlife's actual HP, not its meat reserve. */
export function getWildlifeBadgePresentation(
  node: Pick<ResourceNode, 'subtype' | 'animalAlive' | 'animalHp' | 'animalMaxHp' | 'amount' | 'maxAmount'>,
): WildlifeBadgePresentation | null {
  const isBoar = node.subtype === 'boar';
  const isDeer = node.subtype === 'hunt';
  if (!isBoar && !isDeer) return null;

  const maxHp = Math.max(1, node.animalMaxHp || (isBoar ? 200 : 32));
  const hp = Math.max(0, Math.min(maxHp, node.animalHp ?? maxHp));
  const isAlive = node.animalAlive !== false && hp > 0;
  const ratio = isAlive
    ? hp / maxHp
    : Math.max(0, Math.min(1, node.amount / Math.max(1, node.maxAmount)));
  const bucket = Math.ceil(ratio * 20);

  return {
    title: isBoar
      ? isAlive ? '野生野豬' : '野豬屍體'
      : isAlive ? '野生山羌' : '山羌屍體',
    icon: isBoar ? '🐗' : '🦌',
    valueText: isAlive
      ? `${Math.ceil(hp)}/${maxHp} HP`
      : `${Math.round(node.amount)}/${Math.round(node.maxAmount)}`,
    ratio,
    actionText: isAlive
      ? isBoar ? '危險野獸・受到攻擊會反擊' : '受驚會逃・先獵殺再採肉'
      : '已擊倒・可採集肉類',
    signature: `${isAlive ? 'alive' : 'carcass'}:${bucket}`,
  };
}
