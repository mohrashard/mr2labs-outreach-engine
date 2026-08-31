'use client';

import React, { useState, useEffect } from 'react';
import { Pause, Play, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';

export default function PauseSendingButton() {
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [updating, setUpdating] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/settings/pause')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setIsPaused(Boolean(data.paused));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load pause setting:', err);
        setLoading(false);
      });
  }, []);

  const togglePause = async () => {
    setUpdating(true);
    const newPausedState = !isPaused;
    try {
      const res = await fetch('/api/settings/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: newPausedState }),
      });
      const data = await res.json();
      if (data.success) {
        setIsPaused(Boolean(data.paused));
      }
    } catch (err) {
      console.error('Failed to update pause setting:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="h-10 px-4 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl text-xs text-zinc-400 font-mono">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Checking Status...
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <button
        onClick={togglePause}
        disabled={updating}
        className={`h-10 px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold rounded-xl border transition-all shadow-lg cursor-pointer ${
          isPaused
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20 shadow-rose-500/5'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 shadow-emerald-500/5'
        }`}
        title={isPaused ? 'Click to Resume Email Dispatches' : 'Click to Pause All Email Dispatches'}
      >
        {updating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isPaused ? (
          <>
            <Play className="w-4 h-4 fill-rose-400 text-rose-400" />
            <span>RESUME SENDING</span>
            <span className="text-[10px] bg-rose-500/20 px-1.5 py-0.5 rounded font-mono">PAUSED</span>
          </>
        ) : (
          <>
            <Pause className="w-4 h-4 fill-emerald-400 text-emerald-400" />
            <span>PAUSE ALL DISPATCHES</span>
            <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded font-mono">ACTIVE</span>
          </>
        )}
      </button>

      {isPaused && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 font-sans">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Step 0, 1, 2, 3 dispatches stopped. Scraping is active.</span>
        </div>
      )}
    </div>
  );
}
