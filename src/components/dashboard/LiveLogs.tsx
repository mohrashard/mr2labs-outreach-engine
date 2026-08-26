"use client";

import React, { useEffect, useState } from 'react';
import { Terminal, Clock, ShieldAlert, Sparkles, Navigation, PauseCircle, CheckCircle2 } from 'lucide-react';

interface SystemLog {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
}

export function LiveLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'SYSTEM' | 'SUCCESS' | 'REJECTED'>('ALL');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/logs');
        const data = await res.json();
        if (data.logs) {
          setLogs(data.logs);
        }
      } catch (err) {
        console.error('Failed to fetch logs', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 4000); // Fast 4s polling
    return () => clearInterval(interval);
  }, []);

  const getLogColor = (type: string) => {
    switch (type) {
      case 'SUCCESS': return 'text-emerald-400 font-bold';
      case 'BOUNCER_REJECTED': return 'text-rose-400';
      case 'NO_EMAIL': return 'text-amber-400';
      case 'QUOTA_MET': return 'text-cyan-400 font-bold';
      case 'COOLDOWN': return 'text-purple-400 font-bold';
      case 'SCRAPE_START': return 'text-blue-400 font-bold';
      case 'SCRAPE_ENQUEUED': return 'text-indigo-400 font-semibold';
      case 'LOCATION_PIVOT': return 'text-fuchsia-400 font-bold';
      case 'ERROR': return 'text-red-500 font-bold';
      default: return 'text-slate-300';
    }
  };

  // Find the latest priority system state event (COOLDOWN, SCRAPE_START, LOCATION_PIVOT, QUOTA_MET)
  const priorityEvent = logs.find(l => 
    ['COOLDOWN', 'SCRAPE_START', 'LOCATION_PIVOT', 'QUOTA_MET', 'SCRAPE_ENQUEUED'].includes(l.event_type)
  );

  const filteredLogs = logs.filter(l => {
    if (filter === 'SYSTEM') return ['COOLDOWN', 'SCRAPE_START', 'LOCATION_PIVOT', 'QUOTA_MET', 'SCRAPE_ENQUEUED', 'ERROR'].includes(l.event_type);
    if (filter === 'SUCCESS') return l.event_type === 'SUCCESS';
    if (filter === 'REJECTED') return ['BOUNCER_REJECTED', 'NO_EMAIL', 'NO_FINDING'].includes(l.event_type);
    return true;
  });

  return (
    <div id="live-logs" className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl overflow-hidden mt-9 shadow-2xl">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white/[0.02] border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-semibold text-slate-200">Live Scraper & Pipeline Feed</h3>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-lg border border-white/[0.04]">
          <button 
            onClick={() => setFilter('ALL')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${filter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            All Activity ({logs.length})
          </button>
          <button 
            onClick={() => setFilter('SYSTEM')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${filter === 'SYSTEM' ? 'bg-purple-600 text-white' : 'text-purple-400/80 hover:text-purple-300'}`}
          >
            System & Cooldowns
          </button>
          <button 
            onClick={() => setFilter('SUCCESS')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${filter === 'SUCCESS' ? 'bg-emerald-600 text-white' : 'text-emerald-400/80 hover:text-emerald-300'}`}
          >
            Verified ({logs.filter(l => l.event_type === 'SUCCESS').length})
          </button>
          <button 
            onClick={() => setFilter('REJECTED')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${filter === 'REJECTED' ? 'bg-rose-600 text-white' : 'text-rose-400/80 hover:text-rose-300'}`}
          >
            Rejections
          </button>
        </div>

        {/* Pulse Indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] text-slate-400 font-mono">QStash Workers Active</span>
        </div>
      </div>

      {/* Pinned Latest Pipeline Status Banner */}
      {priorityEvent && (
        <div className={`px-4 py-2.5 border-b text-xs flex items-center gap-2.5 font-medium transition-all ${
          priorityEvent.event_type === 'COOLDOWN' 
            ? 'bg-purple-950/40 border-purple-500/20 text-purple-300' 
            : priorityEvent.event_type === 'LOCATION_PIVOT'
            ? 'bg-fuchsia-950/40 border-fuchsia-500/20 text-fuchsia-300'
            : priorityEvent.event_type === 'SCRAPE_START'
            ? 'bg-blue-950/40 border-blue-500/20 text-blue-300'
            : priorityEvent.event_type === 'QUOTA_MET'
            ? 'bg-cyan-950/40 border-cyan-500/20 text-cyan-300'
            : 'bg-indigo-950/40 border-indigo-500/20 text-indigo-300'
        }`}>
          {priorityEvent.event_type === 'COOLDOWN' && <PauseCircle className="w-4 h-4 text-purple-400 shrink-0 animate-pulse" />}
          {priorityEvent.event_type === 'LOCATION_PIVOT' && <Navigation className="w-4 h-4 text-fuchsia-400 shrink-0 animate-bounce" />}
          {priorityEvent.event_type === 'SCRAPE_START' && <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />}
          {priorityEvent.event_type === 'QUOTA_MET' && <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />}
          {priorityEvent.event_type === 'SCRAPE_ENQUEUED' && <Terminal className="w-4 h-4 text-indigo-400 shrink-0" />}
          
          <div className="truncate flex-1">
            <span className="font-bold uppercase tracking-wider mr-2 text-[10px] px-1.5 py-0.5 rounded bg-black/40 border border-current">
              STATE: {priorityEvent.event_type}
            </span>
            {priorityEvent.message}
          </div>
          <span className="text-[10px] text-slate-400 font-mono shrink-0">
            {new Date(priorityEvent.created_at).toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Terminal Output */}
      <div className="p-4 h-72 overflow-y-auto font-mono text-[11px] leading-relaxed tracking-tight bg-[#040406]">
        {loading ? (
          <div className="text-slate-600 animate-pulse">Initializing log stream...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-slate-600 italic">No logs matching current filter.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredLogs.map(log => (
              <div key={log.id} className="flex gap-3 hover:bg-white/[0.03] px-2 py-1 rounded transition-colors items-center">
                <span className="text-slate-500 shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 w-36 font-semibold ${getLogColor(log.event_type)}`}>
                  [{log.event_type}]
                </span>
                <span className="text-slate-300 truncate" title={log.message}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
