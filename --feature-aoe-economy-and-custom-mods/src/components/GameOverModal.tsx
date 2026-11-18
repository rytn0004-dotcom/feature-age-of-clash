import React from 'react';
import { Trophy, Skull, RotateCcw, Home, Clock, Swords, ShieldAlert, Wheat, Eye } from 'lucide-react';
import { GameStats } from '../types/game';
import { MatchWinnerSummary } from '../game/rules';

interface GameOverModalProps {
  result: 'victory' | 'defeat';
  stats: GameStats;
  isSpectator?: boolean;
  winnerSummary?: MatchWinnerSummary | null;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  result,
  stats,
  isSpectator = false,
  winnerSummary = null,
  onRestart,
  onReturnTitle,
}) => {
  const isVictory = result === 'victory';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}分 ${secs}秒`;
  };

  const totalGathered =
    stats.resourcesGathered.food +
    stats.resourcesGathered.wood +
    stats.resourcesGathered.gold +
    stats.resourcesGathered.stone;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-2xl max-w-md w-full p-6 text-center space-y-6 shadow-2xl">
        {/* Emblem */}
        <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg">
          {isSpectator ? (
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-300">
              <Eye className="w-9 h-9" />
            </div>
          ) : isVictory ? (
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400">
              <Trophy className="w-9 h-9" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400">
              <Skull className="w-9 h-9" />
            </div>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-white tracking-wide">
            {isSpectator
              ? `全 AI 爭霸決勝 · 第 ${winnerSummary?.team ?? 1} 陣營勝出！`
              : isVictory
              ? '宏圖大業 · 征服勝利！'
              : '帝國覆滅 · 戰事受挫'}
          </h2>
          <p className="text-xs text-slate-300">
            {isSpectator
              ? `最終霸主：${winnerSummary?.names?.join('、') || '勝利 AI 陣營'}，所有敵對勢力城鎮與軍隊已全數覆滅！`
              : isVictory
              ? '敵軍城鎮要塞已被夷為平地，你的帝國與英雄名垂青史！'
              : '主要基地失陷，整理軍備重新出發，再圖爭霸！'}
          </p>
        </div>

        {/* Match Statistics Tiles */}
        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>對戰時間</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">{formatTime(stats.gameDuration)}</div>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Swords className="w-3.5 h-3.5 text-red-400" />
              <span>擊潰敵軍</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">{stats.enemiesKilled} 單位</div>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
              <span>我軍陣亡</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">{stats.unitsLost} 單位</div>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Wheat className="w-3.5 h-3.5 text-emerald-400" />
              <span>總採集量</span>
            </div>
            <div className="text-lg font-bold text-emerald-400 font-mono">{Math.floor(totalGathered)} 資源</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            data-start="true"
            onClick={onRestart}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-xl shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>再戰一局 (Play Again)</span>
          </button>
          <button
            onClick={onReturnTitle}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>返回標題畫面</span>
          </button>
        </div>
      </div>
    </div>
  );
};
