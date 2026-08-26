"use client";

import React, { useEffect, useState } from 'react';
import { Terminal, Clock } from 'lucide-react';

interface SystemLog {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
}

export function LiveLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);

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
    const interval = setInterval(fetchLogs, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const getLogColor = (type: string) => {
    switch (type) {
      case 'SUCCESS': return 'text-emerald-400 font-bold';
      case 'BOUNCER_REJECTED': return 'text-rose-400';
      case 'NO_EMAIL': return 'text-amber-400';
      case 'QUOTA_MET': return 'text-cyan-400 font-bold';
      case 'COOLDOWN': return 'text-purple-400 font-semibold';
      case 'SCRAPE_START': return 'text-blue-400 font-semibold';
      case 'SCRAPE_ENQUEUED': return 'text-indigo-400 font-semibold';
      case 'LOCATION_PIVOT': return 'text-fuchsia-400 font-bold';
      case 'ERROR': return 'text-red-500 font-bold';
      default: return 'text-slate-300';
    }
  };

  return (
    <div id="live-logs" className="bg-[#0a0a0c] border border-white/[0.04] rounded-2xl overflow-hidden mt-9">
      <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.02] border-b border-white/[0.04]">
        <Terminal className="w-4 h-4 text-indigo-400" />
        <h3 className="text-xs font-medium text-slate-300">Live Scraper Feed</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] text-slate-500">Listening to QStash workers...</span>
        </div>
      </div>
      
      <div className="p-4 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed tracking-tight bg-[#050505]">
        {loading ? (
          <div className="text-slate-600 animate-pulse">Initializing log stream...</div>
        ) : logs.length === 0 ? (
          <div className="text-slate-600">No recent activity. Queue is idle.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {logs.map(log => (
              <div key={log.id} className="flex gap-3 hover:bg-white/[0.02] px-2 py-1 rounded transition-colors">
                <span className="text-slate-500 shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 w-32 font-semibold ${getLogColor(log.event_type)}`}>
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
