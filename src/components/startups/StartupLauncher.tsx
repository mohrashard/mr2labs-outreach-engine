'use client';

import { useState } from 'react';
import { Rocket, Sparkles, RefreshCw, Layers } from 'lucide-react';

interface StartupLauncherProps {
  onScrapeComplete?: () => void;
}

export function StartupLauncher({ onScrapeComplete }: StartupLauncherProps) {
  const [sourceType, setSourceType] = useState<'HN_INTENT' | 'YC_FUNDED'>('HN_INTENT');
  const [ycBatch, setYcBatch] = useState('W24');
  const [limit, setLimit] = useState(20);
  const [isScraping, setIsScraping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleRunScrape = async () => {
    setIsScraping(true);
    setMessage(null);
    try {
      const res = await fetch('/api/startups/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, ycBatch, limit })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Success! Discovered and added ${data.count} new startup leads.`);
        if (onScrapeComplete) onScrapeComplete();
      } else {
        setMessage(`Error: ${data.error || 'Failed to execute scrape'}`);
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message || 'Network error'}`);
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-xl mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">Intent Discovery Launcher</h2>
            <p className="text-xs text-slate-400">Scrape funded founders and hiring intent ($0 API charges)</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Target Source</label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="HN_INTENT">🔥 Hacker News Intent (Freelance/MVP Threads)</option>
            <option value="YC_FUNDED">🟧 Y Combinator Directory (Early-Stage Startups)</option>
          </select>
        </div>

        {sourceType === 'YC_FUNDED' && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">YC Batch</label>
            <select
              value={ycBatch}
              onChange={(e) => setYcBatch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="W24">W24 (Winter 2024)</option>
              <option value="S24">S24 (Summer 2024)</option>
              <option value="W23">W23 (Winter 2023)</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Max Lead Limit</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10) || 10)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            min={5}
            max={50}
          />
        </div>

        <div>
          <button
            onClick={handleRunScrape}
            disabled={isScraping}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-medium px-4 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
          >
            {isScraping ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Sweeping Leads...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Run Intent Sweep
              </>
            )}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-xs font-medium ${message.startsWith('Error') ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
          {message}
        </div>
      )}
    </div>
  );
}
