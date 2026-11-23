import React, { useId } from 'react';
import { UnitDefinition } from '../types/game';
import { getUnitPortraitSpec, UnitPortraitKey } from '../game/unitPortraits';

export interface UnitPortraitProps {
  unitId?: string;
  modelType?: UnitDefinition['visual']['modelType'];
  visualColor?: string;
  factionColor?: string;
  size?: number;
  level?: number;
  className?: string;
}

export const UnitPortrait: React.FC<UnitPortraitProps> = ({
  unitId,
  modelType,
  visualColor,
  factionColor,
  size = 40,
  level,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const spec = getUnitPortraitSpec(unitId, modelType);
  const rimColor = factionColor || spec.accentHex;
  const clothAccent = visualColor || spec.accentHex;

  const bgId = `bg_${uid}`;
  const steelId = `steel_${uid}`;
  const goldId = `gold_${uid}`;
  const woodId = `wood_${uid}`;
  const glowId = `glow_${uid}`;

  const renderArtwork = (key: UnitPortraitKey) => {
    switch (key) {
      case 'scout_rider':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Bay horse head & neck */}
            <path d="M12 56 L17 34 L27 29 L35 37 L29 44 L26 56 Z" fill="#7c3f1d" />
            <path d="M17 34 L14 40 L18 41 Z" fill="#3e1e0c" />
            <path d="M27 29 L29 23 L32 28 Z" fill="#7c3f1d" />
            <circle cx="29" cy="34" r="1.2" fill="#0f172a" stroke="none" />
            {/* Rider cloak & hood */}
            <path d="M28 56 L30 35 L46 35 L50 56 Z" fill={clothAccent} />
            <path d="M31 35 C31 21 47 21 47 35 Z" fill="#1e293b" />
            <circle cx="39" cy="30" r="5" fill="#f3c69f" />
            {/* Feather plume on hood */}
            <path d="M43 22 C49 14 55 16 53 23 C49 23 45 25 43 22 Z" fill="#38bdf8" />
            {/* Brass spyglass */}
            <path d="M41 31 L56 26 L57 29 L42 34 Z" fill={`url(#${goldId})`} />
            <circle cx="56.5" cy="27.5" r="2" fill="#7dd3fc" />
            {/* Pennon spear */}
            <line x1="15" y1="56" x2="15" y2="10" stroke="#92400e" strokeWidth="2.2" />
            <polygon points="15,8 18,14 12,14" fill={`url(#${steelId})`} />
            <polygon points="16,15 28,19 16,23" fill="#38bdf8" />
          </g>
        );

      case 'mongol_herder':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M14 58 C16 42 23 38 32 38 C41 38 48 42 50 58 Z" fill="#92400e" />
            <path d="M22 26 Q32 12 42 26 L45 30 L19 30 Z" fill="#f8f3e3" />
            <circle cx="32" cy="29" r="8.5" fill="#f3c69f" />
            <path d="M22 23 Q32 18 42 23" fill="none" stroke="#b91c1c" strokeWidth="3" />
            <path d="M23 40 L32 51 L41 40" fill="none" stroke="#fbbf24" strokeWidth="2.2" />
            <line x1="45" y1="55" x2="54" y2="16" stroke="#92400e" strokeWidth="3" />
            <path d="M51 16 L60 20 L52 24 Z" fill="#f59e0b" />
          </g>
        );

      case 'villager':
      case 'fallback_villager':
        return (
          <g stroke="#0f172a" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
            {/* Shoulder & tunic */}
            <path d="M14 58 C16 42 24 38 32 38 C40 38 48 42 50 58 Z" fill={clothAccent} />
            <path d="M24 39 L32 48 L40 39" fill="#d97706" opacity="0.55" />
            {/* Apron straps */}
            <path d="M25 40 L25 58 M39 40 L39 58" stroke="#78350f" strokeWidth="2.5" />
            {/* Head */}
            <circle cx="32" cy="27" r="9.5" fill="#f3c69f" />
            {/* Peasant flat cloth cap */}
            <path d="M21 25 C21 15 43 15 43 24 L46 26 L20 26 Z" fill="#92400e" />
            <path d="M23 23 C27 19 37 19 41 23" fill="none" stroke="#b45309" strokeWidth="1.2" />
            {/* Eyes */}
            <circle cx="29" cy="28" r="1.1" fill="#0f172a" stroke="none" />
            <circle cx="35" cy="28" r="1.1" fill="#0f172a" stroke="none" />
            {/* Iron Pickaxe held over shoulder */}
            <line x1="44" y1="55" x2="52" y2="16" stroke={`url(#${woodId})`} strokeWidth="3.2" />
            <path d="M40 16 C48 12 56 14 59 22 C54 19 49 18 42 20 Z" fill={`url(#${steelId})`} />
          </g>
        );

      case 'anime_spirit_harvester':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Teal shrine robe */}
            <path d="M13 58 C15 41 24 37 32 37 C40 37 49 41 51 58 Z" fill="#0f766e" />
            <path d="M25 38 L32 49 L39 38" fill="#f8fafc" />
            <rect x="23" y="47" width="18" height="4.5" rx="1.5" fill="#f43f5e" />
            {/* Head & dark bob hair */}
            <circle cx="32" cy="27" r="9" fill="#fde2c8" />
            <path d="M21 28 C21 15 43 15 43 28 C40 22 24 22 21 28 Z" fill="#1e293b" />
            {/* Fox Kitsune side mask on temple */}
            <g transform="translate(36, 11) rotate(16)">
              <polygon points="0,12 3,2 8,7 13,2 16,12 8,17" fill="#f8fafc" />
              <path d="M3 10 L6 11 M10 11 L13 10" stroke="#ef4444" strokeWidth="1.4" />
            </g>
            {/* Spirit sickle with glowing jade blade */}
            <line x1="16" y1="56" x2="21" y2="21" stroke="#475569" strokeWidth="2.8" />
            <path d="M21 21 C12 16 12 8 27 11 C21 14 20 18 22 22 Z" fill="#2dd4bf" />
            <circle cx="15" cy="14" r="2.2" fill="#99f6e4" stroke="none" />
          </g>
        );

      case 'fantasy_goblin_sapper':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Red powder keg strapped behind shoulder */}
            <rect x="38" y="29" width="15" height="21" rx="4" fill="#b91c1c" />
            <line x1="38" y1="35" x2="53" y2="35" stroke="#475569" strokeWidth="2.2" />
            <line x1="38" y1="44" x2="53" y2="44" stroke="#475569" strokeWidth="2.2" />
            <path d="M46 29 C47 24 51 23 52 20" fill="none" stroke="#d97706" strokeWidth="1.6" />
            <circle cx="52.5" cy="19.5" r="2.5" fill="#fde047" stroke="#f97316" strokeWidth="1" />
            {/* Leather vest */}
            <path d="M14 58 C15 42 23 39 30 39 C37 39 43 43 45 58 Z" fill="#78350f" />
            {/* Goblin green head & huge pointed ears */}
            <polygon points="18,26 8,21 17,31" fill="#65a30d" />
            <polygon points="40,26 50,21 41,31" fill="#65a30d" />
            <circle cx="29" cy="28" r="9" fill="#84cc16" />
            {/* Brass goggles */}
            <rect x="20" y="21" width="18" height="7" rx="3" fill={`url(#${goldId})`} />
            <circle cx="25" cy="24.5" r="3" fill="#38bdf8" />
            <circle cx="33" cy="24.5" r="3" fill="#38bdf8" />
            {/* Grin */}
            <path d="M25 33 Q29 36 33 33" fill="none" stroke="#0f172a" strokeWidth="1.5" />
            {/* Iron pick */}
            <line x1="15" y1="56" x2="18" y2="32" stroke={`url(#${woodId})`} strokeWidth="2.6" />
            <path d="M11 33 C17 30 22 30 26 35" fill="none" stroke={`url(#${steelId})`} strokeWidth="3" />
          </g>
        );

      case 'mongol_foot_guard':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M14 58 C15 41 23 37 32 37 C41 37 49 41 50 58 Z" fill="#a16207" />
            <path d="M20 28 Q22 14 32 14 Q43 14 44 28 L46 32 L18 32 Z" fill="#78350f" />
            <path d="M25 20 Q32 15 39 20" stroke="#fbbf24" strokeWidth="2.2" fill="none" />
            <rect x="25" y="25" width="14" height="3" rx="1" fill="#0f172a" />
            <path d="M9 35 L23 33 L25 48 L17 57 L9 48 Z" fill="#92400e" />
            <circle cx="17" cy="45" r="5" fill="#d6d3d1" />
            <polygon points="48,45 57,12 60,18 52,49" fill="#e2e8f0" />
            <line x1="44" y1="46" x2="54" y2="46" stroke="#fbbf24" strokeWidth="3" />
          </g>
        );

      case 'swordsman':
      case 'fallback_swordsman':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Pauldrons & steel breastplate */}
            <path d="M14 58 C15 41 23 37 32 37 C41 37 49 41 50 58 Z" fill={`url(#${steelId})`} />
            <path d="M13 43 C15 36 22 35 25 40 Z" fill="#64748b" />
            <path d="M51 43 C49 36 42 35 39 40 Z" fill="#64748b" />
            <path d="M25 40 L32 52 L39 40" fill={clothAccent} opacity="0.85" />
            {/* Sallet steel helmet */}
            <path d="M22 28 C21 15 43 15 42 28 L46 33 L20 33 Z" fill={`url(#${steelId})`} />
            <rect x="25" y="24" width="14" height="3.2" rx="1" fill="#0f172a" />
            <line x1="32" y1="16" x2="32" y2="24" stroke="#e2e8f0" strokeWidth="1.3" />
            {/* Damascus broadsword */}
            <polygon points="48,44 54,12 57,18 52,44" fill="#e2e8f0" />
            <line x1="45" y1="44" x2="55" y2="44" stroke={`url(#${goldId})`} strokeWidth="3" />
            <circle cx="50" cy="49" r="2.2" fill={`url(#${goldId})`} />
            {/* Heater shield */}
            <path d="M10 34 L25 34 L25 47 C25 53 17.5 57 17.5 57 C17.5 57 10 53 10 47 Z" fill={clothAccent} />
            <path d="M12.5 36.5 L22.5 36.5 L22.5 46 C22.5 50.5 17.5 53.5 17.5 53.5 C17.5 53.5 12.5 50.5 12.5 46 Z" fill="none" stroke={`url(#${goldId})`} strokeWidth="1.5" />
            <line x1="17.5" y1="36.5" x2="17.5" y2="53.5" stroke="#f8fafc" strokeWidth="1.8" />
          </g>
        );

      case 'anime_katana_shinigami':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Samurai haori & layered armor */}
            <path d="M14 58 L20 37 L44 37 L50 58 Z" fill="#1e293b" />
            <path d="M24 37 L32 49 L40 37" fill="#be123c" />
            {/* Kabuto helmet + crescent kuwagata horns */}
            <path d="M21 29 C21 16 43 16 43 29 L47 34 L17 34 Z" fill="#334155" />
            <path d="M25 19 C17 12 18 6 24 11 C23 14 26 16 28 17 Z" fill={`url(#${goldId})`} />
            <path d="M39 19 C47 12 46 6 40 11 C41 14 38 16 36 17 Z" fill={`url(#${goldId})`} />
            {/* Crimson oni half-mask & fierce eyes */}
            <rect x="24" y="25" width="16" height="4" rx="1" fill="#0f172a" />
            <circle cx="28.5" cy="27" r="1.2" fill="#fb7185" stroke="none" />
            <circle cx="35.5" cy="27" r="1.2" fill="#fb7185" stroke="none" />
            <path d="M24 29 L40 29 L38 36 L26 36 Z" fill="#9f1239" />
            {/* Curved katana blade slashing diagonally */}
            <path d="M46 47 Q56 26 54 9 Q50 24 43 45 Z" fill="#f1f5f9" />
            <line x1="41" y1="45" x2="49" y2="48" stroke={`url(#${goldId})`} strokeWidth="2.8" />
            {/* Scabbard on left hip */}
            <line x1="11" y1="53" x2="23" y2="39" stroke="#450a0a" strokeWidth="3.5" />
          </g>
        );

      case 'longbowman':
      case 'fallback_archer':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Quiver with feathered arrows */}
            <path d="M16 20 L23 20 L26 42 L19 42 Z" fill="#78350f" />
            <line x1="17" y1="14" x2="19" y2="20" stroke="#e2e8f0" strokeWidth="1.6" />
            <line x1="21" y1="12" x2="22" y2="20" stroke="#fbbf24" strokeWidth="1.6" />
            {/* Forest ranger cloak */}
            <path d="M15 58 L21 36 L43 36 L49 58 Z" fill="#065f46" />
            <path d="M23 37 L41 49" stroke="#78350f" strokeWidth="3" />
            {/* Hooded head */}
            <path d="M22 34 C20 17 42 15 41 34 Z" fill="#047857" />
            <circle cx="32" cy="27" r="6.5" fill="#f3c69f" />
            <circle cx="33" cy="27" r="1.1" fill="#0f172a" stroke="none" />
            {/* Recurve longbow & nocked arrow */}
            <path d="M45 11 C55 21 55 43 45 53" fill="none" stroke={`url(#${woodId})`} strokeWidth="3.2" />
            <line x1="45" y1="11" x2="45" y2="53" stroke="#e2e8f0" strokeWidth="1.1" />
            <line x1="34" y1="32" x2="57" y2="32" stroke="#cbd5e1" strokeWidth="1.8" />
            <polygon points="58,32 53,29.5 53,34.5" fill={`url(#${steelId})`} />
          </g>
        );

      case 'mongol_mangudai':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M13 58 L19 37 L44 37 L50 58 Z" fill="#92400e" />
            <path d="M21 36 Q18 17 32 16 Q46 17 43 36 Z" fill="#a16207" />
            <circle cx="32" cy="28" r="7" fill="#f3c69f" />
            <path d="M18 24 Q32 15 46 24" fill="none" stroke="#451a03" strokeWidth="4" />
            <path d="M22 42 L42 42" stroke="#fbbf24" strokeWidth="2.5" />
            <path d="M10 16 Q4 32 12 48 Q19 32 10 16 Z" fill="none" stroke="#b45309" strokeWidth="2.4" />
            <line x1="48" y1="55" x2="55" y2="12" stroke="#92400e" strokeWidth="2.8" />
            <path d="M55 12 L61 17 L55 22 Z" fill="#e2e8f0" />
            <path d="M45 16 L56 19" stroke="#fbbf24" strokeWidth="1.5" />
          </g>
        );

      case 'mongol_keshik':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M12 58 L18 37 L46 37 L51 58 Z" fill="#7f1d1d" />
            <path d="M19 37 L20 22 Q32 8 44 22 L45 36 Z" fill="#92400e" />
            <path d="M22 41 L42 41 M22 46 L42 46" stroke="#fbbf24" strokeWidth="3" />
            <path d="M20 22 Q32 13 44 22" stroke="#fbbf24" strokeWidth="2.2" fill="none" />
            <rect x="26" y="23" width="12" height="5" rx="1" fill="#0f172a" />
            <circle cx="32" cy="31" r="5" fill="#f3c69f" />
            <path d="M32 18 L32 7" stroke="#dc2626" strokeWidth="3" />
            <path d="M32 9 Q43 3 47 10 Q39 10 32 15 Z" fill="#dc2626" />
            <path d="M12 37 L23 37 L21 54 L16 58 L11 53 Z" fill="#d6d3d1" />
            <circle cx="17" cy="46" r="4" fill="#fbbf24" />
            <line x1="49" y1="56" x2="57" y2="7" stroke="#92400e" strokeWidth="3.1" />
            <polygon points="57,5 60,15 54,15" fill="#fbbf24" />
          </g>
        );

      case 'mongol_lancer':
      case 'fallback_horse_archer':
      case 'fallback_keshik':
      case 'knight':
      case 'fallback_knight':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Plume */}
            <path d="M32 18 C36 8 48 9 47 18 C42 16 37 17 32 18 Z" fill="#ef4444" />
            {/* Horse chamfron armored head */}
            <path d="M9 56 L14 34 L24 30 L29 39 L22 47 L21 56 Z" fill={`url(#${steelId})`} />
            <path d="M17 33 L24 37 L18 43 Z" fill={`url(#${goldId})`} />
            {/* Knight plate torso */}
            <path d="M24 58 L26 36 L47 36 L51 58 Z" fill={`url(#${steelId})`} />
            <path d="M29 38 L37 51 L45 38" fill={clothAccent} opacity="0.8" />
            {/* Great helm */}
            <rect x="27" y="18" width="16" height="17" rx="4" fill={`url(#${steelId})`} />
            <line x1="27" y1="25" x2="43" y2="25" stroke="#0f172a" strokeWidth="2.4" />
            <line x1="35" y1="19" x2="35" y2="34" stroke={`url(#${goldId})`} strokeWidth="1.8" />
            {/* Tournament lance with vamplate */}
            <line x1="51" y1="56" x2="56" y2="8" stroke={`url(#${steelId})`} strokeWidth="3.2" />
            <polygon points="56,6 59,15 53,15" fill="#f8fafc" />
            <polygon points="46,43 56,43 54,48 48,48" fill={`url(#${goldId})`} />
          </g>
        );

      case 'fantasy_paladin':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Radiant halo behind head */}
            <circle cx="32" cy="24" r="15" fill={`url(#${glowId})`} stroke="none" opacity="0.45" />
            {/* White-gold winged crest */}
            <path d="M22 21 L12 10 L17 22 Z" fill="#fef08a" />
            <path d="M42 21 L52 10 L47 22 Z" fill="#fef08a" />
            {/* Holy armor */}
            <path d="M14 58 L20 36 L44 36 L50 58 Z" fill="#e2e8f0" />
            <path d="M20 36 L32 45 L44 36" fill={`url(#${goldId})`} />
            {/* Winged great helm */}
            <path d="M23 33 L23 20 C23 14 41 14 41 20 L41 33 Z" fill="#f8fafc" />
            <line x1="25" y1="24" x2="39" y2="24" stroke="#0f172a" strokeWidth="2.2" />
            <line x1="32" y1="17" x2="32" y2="32" stroke={`url(#${goldId})`} strokeWidth="2" />
            {/* Sun kite shield */}
            <path d="M9 34 L23 34 L22 48 L16 56 L10 48 Z" fill={`url(#${goldId})`} />
            <circle cx="16" cy="43" r="3" fill="#fef9c3" />
            {/* Radiant warhammer */}
            <line x1="49" y1="56" x2="52" y2="21" stroke="#b45309" strokeWidth="3" />
            <rect x="44" y="13" width="15" height="9" rx="2" fill="#fde047" />
          </g>
        );

      case 'anime_ninja_assassin':
      case 'fallback_ninja':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Back katana sheath */}
            <line x1="16" y1="12" x2="42" y2="54" stroke="#312e81" strokeWidth="3.6" />
            {/* Shinobi vest & trailing scarf */}
            <path d="M15 58 L21 37 L43 37 L49 58 Z" fill="#1e1b4b" />
            <path d="M23 35 L41 35 L46 47 L56 44 L44 51 L22 41 Z" fill="#e11d48" />
            {/* Spiky hair */}
            <polygon points="18,22 22,10 29,16 34,8 39,16 47,11 45,23" fill="#0f172a" />
            {/* Headband & face mask */}
            <circle cx="32" cy="26" r="8.5" fill="#f3c69f" />
            <rect x="23" y="17" width="18" height="5" rx="1.5" fill="#334155" />
            <rect x="28" y="18" width="8" height="3" fill={`url(#${steelId})`} />
            <path d="M23 27 L41 27 L39 36 L25 36 Z" fill="#1e293b" />
            <circle cx="28.5" cy="24.5" r="1.2" fill="#38bdf8" stroke="none" />
            <circle cx="35.5" cy="24.5" r="1.2" fill="#38bdf8" stroke="none" />
            {/* Dual kunai */}
            <polygon points="52,29 58,20 56,31" fill="#e2e8f0" />
            <circle cx="52" cy="34" r="2.2" fill="none" stroke="#cbd5e1" strokeWidth="1.6" />
          </g>
        );

      case 'anime_saiyan_brawler':
      case 'fallback_saiyan':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Golden Super Ki Aura */}
            <polygon
              points="32,4 40,16 53,12 47,26 58,36 47,46 50,58 14,58 17,46 6,36 17,26 11,12 24,16"
              fill={`url(#${glowId})`}
              stroke="#fde047"
              strokeWidth="1.2"
              opacity="0.65"
            />
            {/* Battle armor chestplate & pauldrons */}
            <path d="M16 58 L20 37 L44 37 L48 58 Z" fill="#1d4ed8" />
            <path d="M15 39 L24 35 L24 44 Z" fill="#f8fafc" />
            <path d="M49 39 L40 35 L40 44 Z" fill="#f8fafc" />
            <path d="M22 39 L42 39 L40 53 L24 53 Z" fill="#f8fafc" />
            <line x1="25" y1="45" x2="39" y2="45" stroke="#eab308" strokeWidth="2.5" />
            {/* Head */}
            <circle cx="32" cy="27" r="8.2" fill="#f3c69f" />
            <circle cx="29" cy="27" r="1.2" fill="#06b6d4" stroke="none" />
            <circle cx="35" cy="27" r="1.2" fill="#06b6d4" stroke="none" />
            {/* Golden 9-spike Saiyan hair */}
            <polygon
              points="21,25 14,16 24,18 22,6 31,15 35,4 38,16 47,8 43,20 51,18 42,26 32,21"
              fill="#facc15"
            />
          </g>
        );

      case 'mongol_shaman':
      case 'fallback_shaman':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M14 58 L20 36 L44 36 L50 58 Z" fill="#075985" />
            <path d="M21 37 L32 48 L43 37" fill="#38bdf8" />
            <circle cx="32" cy="29" r="7.5" fill="#f3c69f" />
            <path d="M20 29 Q20 13 32 13 Q44 13 44 29 L40 33 L24 33 Z" fill="#164e63" />
            <path d="M25 20 Q32 13 39 20" fill="none" stroke="#fbbf24" strokeWidth="2.4" />
            <line x1="51" y1="56" x2="51" y2="18" stroke="#92400e" strokeWidth="3" />
            <polygon points="51,8 57,16 51,24 45,16" fill="#38bdf8" />
            <path d="M46 12 L56 20 M56 12 L46 20" stroke="#e0f2fe" strokeWidth="1.4" />
          </g>
        );

      case 'fantasy_mage':
      case 'fallback_mage':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Layered robe & gold mantle */}
            <path d="M14 58 L20 36 L44 36 L50 58 Z" fill="#581c87" />
            <path d="M20 36 L32 45 L44 36" fill={`url(#${goldId})`} />
            {/* Flowing white beard */}
            <circle cx="32" cy="29" r="7.5" fill="#f3c69f" />
            <path d="M25 31 L32 46 L39 31 Z" fill="#f8fafc" />
            {/* Pointed wizard hat */}
            <ellipse cx="32" cy="23" rx="15" ry="4" fill="#6b21a8" />
            <path d="M21 22 L34 6 L43 22 Z" fill="#7e22ce" />
            <path d="M24 19 L41 19" stroke={`url(#${goldId})`} strokeWidth="2.2" />
            {/* Crystal staff */}
            <line x1="51" y1="57" x2="51" y2="21" stroke={`url(#${woodId})`} strokeWidth="2.8" />
            <polygon points="51,9 56,16 51,23 46,16" fill="#c084fc" />
            <circle cx="51" cy="16" r="2.2" fill="#f5d0fe" stroke="none" />
            {/* Open rune tome */}
            <polygon points="8,44 16,41 16,52 8,55" fill="#fef3c7" />
            <polygon points="16,41 24,44 24,55 16,52" fill="#fde68a" />
          </g>
        );

      case 'fantasy_treant':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Leaf canopy crown & stag antler horns */}
            <circle cx="22" cy="18" r="9" fill="#15803d" />
            <circle cx="42" cy="18" r="9" fill="#166534" />
            <circle cx="32" cy="14" r="10" fill="#16a34a" />
            <path d="M22 18 L12 8 M17 13 L11 15" stroke="#5c3a21" strokeWidth="2.5" />
            <path d="M42 18 L52 8 M47 13 L53 15" stroke="#5c3a21" strokeWidth="2.5" />
            {/* Gnarled bark torso & boulder fists */}
            <path d="M16 58 L20 26 L44 26 L48 58 Z" fill="#5c3a21" />
            <rect x="8" y="37" width="11" height="14" rx="3" fill="#452713" />
            <rect x="45" y="37" width="11" height="14" rx="3" fill="#452713" />
            {/* Bark brow eyes */}
            <circle cx="27" cy="31" r="2" fill="#4ade80" stroke="none" />
            <circle cx="37" cy="31" r="2" fill="#4ade80" stroke="none" />
            {/* Glowing emerald heartwood core */}
            <polygon points="32,37 38,44 32,52 26,44" fill="#22c55e" />
            <polygon points="32,40 35,44 32,48 29,44" fill="#bbf7d0" stroke="none" />
          </g>
        );

      case 'battering_ram':
      case 'fallback_ram':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Hide-clad angled pent roof */}
            <polygon points="10,33 32,15 54,33 50,45 14,45" fill="#7c2d12" />
            <line x1="10" y1="33" x2="32" y2="15" stroke={`url(#${steelId})`} strokeWidth="2.6" />
            <line x1="32" y1="15" x2="54" y2="33" stroke={`url(#${steelId})`} strokeWidth="2.6" />
            {/* Hanging side shields */}
            <circle cx="22" cy="37" r="4.5" fill="#b45309" />
            <circle cx="33" cy="37" r="4.5" fill="#b45309" />
            {/* Iron-snouted battering beam protruding forward */}
            <rect x="26" y="35" width="23" height="8" fill="#92400e" />
            <polygon points="49,33 60,39 49,45" fill={`url(#${steelId})`} />
            {/* Spoked siege wheels */}
            <circle cx="20" cy="49" r="6.5" fill="#451a03" />
            <circle cx="20" cy="49" r="2" fill={`url(#${steelId})`} />
            <circle cx="43" cy="49" r="6.5" fill="#451a03" />
            <circle cx="43" cy="49" r="2" fill={`url(#${steelId})`} />
          </g>
        );

      case 'catapult':
      case 'fallback_golem':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Timber A-frame & chassis */}
            <line x1="20" y1="47" x2="31" y2="22" stroke={`url(#${woodId})`} strokeWidth="4" />
            <line x1="42" y1="47" x2="31" y2="22" stroke={`url(#${woodId})`} strokeWidth="4" />
            <rect x="13" y="43" width="38" height="6" rx="1.5" fill="#78350f" />
            {/* Throwing arm & spoon holding boulder */}
            <line x1="32" y1="42" x2="51" y2="16" stroke="#b45309" strokeWidth="3.5" />
            <circle cx="51" cy="15" r="6.5" fill="#94a3b8" />
            <path d="M45 17 Q51 23 57 17" fill="none" stroke="#475569" strokeWidth="2.5" />
            {/* Counterweight basket */}
            <polygon points="12,28 21,28 23,37 10,37" fill="#57534e" />
            {/* Spoked wheels */}
            <circle cx="20" cy="51" r="5.5" fill="#451a03" />
            <circle cx="44" cy="51" r="5.5" fill="#451a03" />
          </g>
        );

      case 'bombard_cannon':
      case 'fallback_cannon':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Heavy wooden gun carriage */}
            <polygon points="10,49 39,35 42,46 14,52" fill="#78350f" />
            {/* Fluted bronze barrel & cascabel */}
            <polygon points="15,34 55,21 57,30 18,43" fill={`url(#${goldId})`} />
            <ellipse cx="56" cy="25.5" rx="2.5" ry="5" fill="#1e293b" />
            <circle cx="14" cy="39" r="3" fill="#b45309" />
            {/* Fuse spark */}
            <circle cx="20" cy="31" r="2.8" fill="#fb923c" stroke="#fde047" strokeWidth="1" />
            {/* Large artillery wheel */}
            <circle cx="32" cy="46" r="9.5" fill="none" stroke="#451a03" strokeWidth="3.5" />
            <line x1="23" y1="46" x2="41" y2="46" stroke="#78350f" strokeWidth="1.6" />
            <line x1="32" y1="37" x2="32" y2="55" stroke="#78350f" strokeWidth="1.6" />
            <circle cx="32" cy="46" r="2.8" fill={`url(#${steelId})`} />
          </g>
        );

      case 'greek_fire_siphon':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Copper pressure cauldron */}
            <rect x="13" y="25" width="18" height="20" rx="5" fill="#c2410c" />
            <line x1="13" y1="32" x2="31" y2="32" stroke={`url(#${goldId})`} strokeWidth="2" />
            <line x1="13" y1="39" x2="31" y2="39" stroke={`url(#${goldId})`} strokeWidth="2" />
            {/* Front iron shield mantlet */}
            <polygon points="31,26 39,28 38,48 30,48" fill={`url(#${steelId})`} />
            {/* Brass siphon tube & flared nozzle */}
            <polygon points="29,28 48,23 50,29 30,34" fill="#d97706" />
            {/* Roaring Greek fire flame jet */}
            <path d="M49 24 C55 19 60 22 59 27 C61 30 56 34 49 28 Z" fill="#f97316" />
            <path d="M50 25 C54 22 57 25 54 28 Z" fill="#fef08a" stroke="none" />
            {/* Wheels */}
            <circle cx="21" cy="50" r="6" fill="#451a03" />
            <circle cx="37" cy="50" r="6" fill="#451a03" />
          </g>
        );

      case 'fishing_boat':
      case 'fallback_boat':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            {/* Ocean wave line */}
            <path d="M6 51 Q18 46 32 51 T58 51 L58 59 L6 59 Z" fill="#0284c7" opacity="0.65" stroke="none" />
            {/* Mast & cream stitched canvas sail */}
            <line x1="31" y1="43" x2="31" y2="11" stroke={`url(#${woodId})`} strokeWidth="2.8" />
            <path d="M32 13 C47 16 49 30 33 37 Z" fill="#fef3c7" />
            <line x1="33" y1="25" x2="45" y2="25" stroke="#d97706" strokeWidth="1" strokeDasharray="2 2" />
            {/* Curved oak hull */}
            <path d="M11 41 L53 41 L46 51 L18 51 Z" fill="#92400e" />
            {/* Fishing net pole */}
            <line x1="18" y1="41" x2="10" y2="25" stroke="#78350f" strokeWidth="2" />
            <path d="M10 25 C12 31 16 34 21 35" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="2 2" />
          </g>
        );

      case 'transport_boat':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M6 51 Q18 47 32 51 T58 51 L58 59 L6 59 Z" fill="#0369a1" opacity="0.7" stroke="none" />
            {/* Mast & wide square sail */}
            <line x1="30" y1="40" x2="30" y2="11" stroke={`url(#${woodId})`} strokeWidth="2.8" />
            <rect x="18" y="14" width="24" height="19" rx="2" fill="#e2e8f0" />
            <polygon points="30,10 42,13 30,16" fill={clothAccent} />
            {/* Broad barge hull + shield-lined gunwales */}
            <path d="M9 39 L55 39 L49 51 L15 51 Z" fill="#78350f" />
            <circle cx="20" cy="43" r="3.2" fill={clothAccent} />
            <circle cx="30" cy="43" r="3.2" fill={`url(#${goldId})`} />
            <circle cx="40" cy="43" r="3.2" fill={clothAccent} />
            {/* Boarding ramp */}
            <polygon points="49,39 58,45 55,49 46,43" fill="#b45309" />
          </g>
        );

      case 'war_galley':
        return (
          <g stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M6 52 Q18 48 32 52 T58 52 L58 59 L6 59 Z" fill="#0c4a6e" opacity="0.8" stroke="none" />
            {/* War sail with emblem */}
            <line x1="31" y1="39" x2="31" y2="9" stroke={`url(#${woodId})`} strokeWidth="3" />
            <path d="M17 12 L46 12 C48 22 47 29 44 33 L18 33 C20 25 20 18 17 12 Z" fill={clothAccent} />
            <polygon points="32,16 37,23 32,30 27,23" fill={`url(#${goldId})`} />
            {/* Heavy warship hull + stern castle + bronze ram prow */}
            <path d="M10 34 L21 34 L23 39 L48 39 L58 45 L47 51 L14 51 Z" fill="#7c2d12" />
            <polygon points="48,43 60,46 48,49" fill={`url(#${goldId})`} />
            {/* Twin bank of oars */}
            <line x1="23" y1="47" x2="18" y2="57" stroke="#fde68a" strokeWidth="1.7" />
            <line x1="30" y1="47" x2="25" y2="57" stroke="#fde68a" strokeWidth="1.7" />
            <line x1="37" y1="47" x2="32" y2="57" stroke="#fde68a" strokeWidth="1.7" />
          </g>
        );
    }
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-lg overflow-hidden shrink-0 shadow-inner select-none ${className}`}
      style={{
        width: size,
        height: size,
        border: `1.5px solid ${rimColor}`,
        background: `radial-gradient(circle at 35% 25%, ${spec.bgFrom}, ${spec.bgTo})`,
      }}
      title={spec.label}
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        className="w-full h-full block"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={bgId} cx="35%" cy="28%" r="72%">
            <stop offset="0%" stopColor={spec.bgFrom} />
            <stop offset="100%" stopColor={spec.bgTo} />
          </radialGradient>
          <linearGradient id={steelId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f1f5f9" />
            <stop offset="50%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <linearGradient id={goldId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="55%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#a16207" />
          </linearGradient>
          <linearGradient id={woodId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="100%" stopColor="#451a03" />
          </linearGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.95" />
            <stop offset="100%" stopColor={spec.accentHex} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" fill={`url(#${bgId})`} />
        {renderArtwork(spec.key)}
      </svg>
      {level && level >= 2 && (
        <span className="absolute -bottom-0.5 -right-0.5 px-1 rounded-tl bg-amber-500 text-slate-950 font-black text-[9px] leading-tight border-t border-l border-amber-200 shadow">
          ★{level}
        </span>
      )}
    </div>
  );
};
