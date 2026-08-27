"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Terminal, PauseCircle, Navigation, Sparkles, CheckCircle2, Calendar } from 'lucide-react';

interface SystemLog {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
  step?: number | 'SYSTEM';
}

export function LiveLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayDate, setTodayDate] = useState<string>('');
  const [filter, setFilter] = useState<'ALL' | 'STEP_0' | 'STEP_1' | 'STEP_2' | 'STEP_3' | 'SYSTEM' | 'REJECTED'>('ALL');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/logs');
        const data = await res.json();
        if (data.logs) {
          setLogs(data.logs);
        }
        if (data.date) {
          setTodayDate(data.date);
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

  // Helper for Step Tag Styling
  const getStepBadge = (step?: number | 'SYSTEM') => {
    switch (step) {
      case 0:
        return { label: 'STEP 0', style: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' };
      case 1:
        return { label: 'STEP 1', style: 'bg-blue-500/10 text-blue-300 border-blue-500/20' };
      case 2:
        return { label: 'STEP 2', style: 'bg-purple-500/10 text-purple-300 border-purple-500/20' };
      case 3:
        return { label: 'STEP 3', style: 'bg-amber-500/10 text-amber-300 border-amber-500/20' };
      default:
        return { label: 'SYSTEM', style: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
    }
  };

  const getLogColor = (type: string, step?: number | 'SYSTEM') => {
    if (type === 'SUCCESS' || type.includes('SENT')) return 'text-emerald-400 font-bold';
    if (type.includes('REJECTED') || type === 'ERROR') return 'text-rose-400 font-semibold';
    if (type === 'NO_EMAIL') return 'text-amber-400';
    if (type === 'QUOTA_MET') return 'text-cyan-400 font-bold';
    if (type === 'COOLDOWN') return 'text-purple-400 font-bold';
    if (type === 'LOCATION_PIVOT') return 'text-fuchsia-400 font-bold';
    if (step === 0) return 'text-cyan-300';
    if (step === 1) return 'text-blue-300';
    if (step === 2) return 'text-purple-300';
    if (step === 3) return 'text-amber-300';
    return 'text-slate-300';
  };

  // Find priority system state event (COOLDOWN, SCRAPE_START, DORK_GENERATED, LOCATION_PIVOT, QUOTA_MET)
  const priorityEvent = logs.find(l => 
    ['COOLDOWN', 'SCRAPE_START', 'DORK_GENERATED', 'LOCATION_PIVOT', 'QUOTA_MET', 'SCRAPE_ENQUEUED'].includes(l.event_type)
  );

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (filter === 'STEP_0') return l.step === 0;
      if (filter === 'STEP_1') return l.step === 1;
      if (filter === 'STEP_2') return l.step === 2;
      if (filter === 'STEP_3') return l.step === 3;
      if (filter === 'SYSTEM') return l.step === 'SYSTEM' || ['COOLDOWN', 'QUOTA_MET', 'ERROR'].includes(l.event_type);
      if (filter === 'REJECTED') return ['BOUNCER_REJECTED', 'NO_EMAIL', 'NO_FINDING', 'DELIVERY_FAILURE', 'ERROR'].includes(l.event_type);
      return true;
    });
  }, [logs, filter]);

  // Count logs by step
  const counts = useMemo(() => {
    const res = { step0: 0, step1: 0, step2: 0, step3: 0, system: 0 };
    logs.forEach(l => {
      if (l.step === 0) res.step0++;
      else if (l.step === 1) res.step1++;
      else if (l.step === 2) res.step2++;
      else if (l.step === 3) res.step3++;
      else res.system++;
    });
    return res;
  }, [logs]);

  return (
    <div id="live-logs" className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl overflow-hidden mt-9 shadow-2xl">
      
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white/[0.02] border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">Live Pipeline Feed</h3>
          </div>
          
          <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md font-mono">
            <Calendar className="w-3 h-3 text-indigo-400" />
            <span>Today ({todayDate || new Date().toLocaleDateString()})</span>
          </div>
        </div>

        {/* Step Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-[#050508] p-1 rounded-xl border border-white/10">
          <button 
            onClick={() => setFilter('ALL')}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition-all ${filter === 'ALL' ? 'bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'}`}
          >
            All Today ({logs.length})
          </button>
          
          <button 
            onClick={() => setFilter('STEP_0')}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition-all ${filter === 'STEP_0' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'text-cyan-400/70 hover:text-cyan-300'}`}
          >
            Step 0 ({counts.step0})
          </button>

          <button 
            onClick={() => setFilter('STEP_1')}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition-all ${filter === 'STEP_1' ? 'bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30' : 'text-blue-400/70 hover:text-blue-300'}`}
          >
            Step 1 ({counts.step1})
          </button>

          <button 
            onClick={() => setFilter('STEP_2')}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition-all ${filter === 'STEP_2' ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30' : 'text-purple-400/70 hover:text-purple-300'}`}
          >
            Step 2 ({counts.step2})
          </button>

          <button 
            onClick={() => setFilter('STEP_3')}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition-all ${filter === 'STEP_3' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-amber-400/70 hover:text-amber-300'}`}
          >
            Step 3 ({counts.step3})
          </button>

          <button 
            onClick={() => setFilter('SYSTEM')}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition-all ${filter === 'SYSTEM' ? 'bg-slate-700/40 text-slate-200 font-bold border border-slate-600/30' : 'text-slate-400 hover:text-slate-200'}`}
          >
            System ({counts.system})
          </button>

          <button 
            onClick={() => setFilter('REJECTED')}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition-all ${filter === 'REJECTED' ? 'bg-rose-600/30 text-rose-300 font-bold border border-rose-500/30' : 'text-rose-400/70 hover:text-rose-300'}`}
          >
            Rejections
          </button>
        </div>

        {/* Active Worker Status Pulse */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] text-slate-400 font-mono">QStash Active</span>
        </div>
      </div>

      {/* Pinned Pipeline State Banner */}
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
            {new Date(priorityEvent.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      )}

      {/* Terminal Feed Display */}
      <div className="p-4 h-80 overflow-y-auto font-mono text-[11px] leading-relaxed tracking-tight bg-[#040406] space-y-2">
        {loading ? (
          <div className="text-slate-600 animate-pulse">Initializing log stream for today...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-slate-600 italic py-6 text-center">No logs recorded for this filter today.</div>
        ) : (
          filteredLogs.map(log => {
            const stepBadge = getStepBadge(log.step);

            return (
              <div key={log.id} className="flex items-start gap-2.5 hover:bg-white/[0.02] py-0.5 px-1 rounded transition-colors">
                {/* Timestamp */}
                <span className="text-slate-500 shrink-0 select-none">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>

                {/* Step Badge */}
                <span className={`px-1.5 py-0.2 text-[9px] font-bold border rounded shrink-0 ${stepBadge.style}`}>
                  {stepBadge.label}
                </span>

                {/* Event Type Tag */}
                <span className="text-slate-400 font-semibold shrink-0">
                  [{log.event_type}]
                </span>

                {/* Human-Readable Message */}
                <span className={`flex-1 break-words ${getLogColor(log.event_type, log.step)}`}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
