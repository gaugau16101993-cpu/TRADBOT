import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Trash2, Filter } from 'lucide-react';
import { LogMessage, BotFilter } from '../types/engine';

interface ConsoleLogsProps {
  logs: LogMessage[];
  onClearLogs: () => void;
}

export const ConsoleLogs: React.FC<ConsoleLogsProps> = React.memo(({ logs, onClearLogs }) => {
  const [filter, setFilter] = useState<BotFilter>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter((l) => {
    if (filter === 'ALL') return true;
    return l.source === filter;
  });

  return (
    <div className="bg-[#11141d] border border-[#1f2430] rounded-xl p-4 flex flex-col h-80 shadow-lg">
      <div className="flex items-center justify-between pb-2 border-b border-[#1f2430]/60 text-xs font-mono">
        <span className="flex items-center gap-1.5 font-bold text-white">
          <Terminal className="w-4 h-4 text-cyan-400" />
          System Console
        </span>

        <div className="flex items-center space-x-2">
          <button
            onClick={onClearLogs}
            className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1 transition cursor-pointer"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 my-1.5 overflow-x-auto pb-1 text-[10px] font-mono border-b border-[#1f2430]/40">
        {(['ALL', 'BOT1', 'BOT2', 'BOT3', 'BOT4', 'BOT5', 'SYS'] as BotFilter[]).map((tab) => {
          const isActive = filter === tab;
          return (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-1.5 py-0.5 rounded transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a202c]'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Console output */}
      <div
        id="console-logs"
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 my-1 font-mono text-[10px] pr-1"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-gray-600 text-center py-8">Không có log phù hợp bộ lọc.</div>
        ) : (
          filteredLogs.map((log) => {
            let colorClass = 'text-gray-400';
            if (log.type === 'success') colorClass = 'text-emerald-400';
            if (log.type === 'warning') colorClass = 'text-amber-400';
            if (log.type === 'danger') colorClass = 'text-rose-400';
            if (log.type === 'cyan') colorClass = 'text-cyan-400';
            if (log.type === 'purple') colorClass = 'text-purple-400';

            return (
              <div key={log.id} className={`${colorClass} leading-tight break-words hover:bg-[#161a24] px-1 py-0.5 rounded transition`}>
                <span className="text-gray-600 mr-1.5">[{log.time}]</span>
                <span>{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="pt-1.5 border-t border-[#1f2430]/60 flex justify-between text-[9px] font-mono text-gray-600">
        <span>Log Buffer: {logs.length} events</span>
        <span className="text-cyan-500">Auto-streaming</span>
      </div>
    </div>
  );
});
