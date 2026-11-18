import React from 'react';
import { Play, RotateCcw, Sliders, Home } from 'lucide-react';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenMods: () => void;
  onReturnTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onOpenMods,
  onReturnTitle,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full p-6 text-center space-y-5 shadow-2xl">
        <h2 className="text-xl font-bold text-white tracking-wide">戰局暫停 (Game Paused)</h2>
        <p className="text-xs text-slate-300">
          按 Esc 或點擊繼續戰鬥，亦可在此調節模組平衡性或 AI 指令集
        </p>

        <div className="space-y-2.5 pt-2">
          <button
            onClick={onResume}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl shadow cursor-pointer flex items-center justify-center gap-2 transition-colors"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>繼續遊戲 (Resume)</span>
          </button>

          <button
            onClick={onOpenMods}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer flex items-center justify-center gap-2 transition-colors"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>調整模組 & AI 戰術指令集</span>
          </button>

          <button
            onClick={onRestart}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>重新開始此局</span>
          </button>

          <button
            onClick={onReturnTitle}
            className="w-full py-2 bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-white text-xs font-medium rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>返回標題畫面</span>
          </button>
        </div>
      </div>
    </div>
  );
};
