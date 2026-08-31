'use client';

import { useState, useEffect } from 'react';
import { StartupLead } from '@/types/startup';
import { StartupLauncher } from '@/components/startups/StartupLauncher';
import { StartupLeadsTable } from '@/components/startups/StartupLeadsTable';
import PauseSendingButton from '@/components/PauseSendingButton';
import { Rocket, Target, Send, CheckCircle, RefreshCw, Zap } from 'lucide-react';

export default function StartupsDashboardPage() {
  const [leads, setLeads] = useState<StartupLead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/startups/leads');
      const data = await res.json();
      if (data.leads) {
        setLeads(data.leads);
      }
    } catch (err) {
      console.error('Failed to fetch startup leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const totalFundedScraped = leads.length;
  const activeQueued = leads.filter(l => l.status === 'QUEUED' || l.status === 'NEW').length;
  const totalSent = leads.filter(l => l.status === 'SENT').length;
  const totalReplied = leads.filter(l => l.status === 'REPLIED').length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Rocket className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                Startup & MVP Development Pipeline
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Targeting Hacker News intent & Y Combinator funded founders ($0/mo discovery)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <PauseSendingButton />
          <button
            onClick={fetchLeads}
            className="self-start md:self-auto bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Pipeline
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4 shadow-lg">
          <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">Funded Leads Scraped</div>
            <div className="text-2xl font-bold text-white mt-0.5">{totalFundedScraped}</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4 shadow-lg">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">Active Queue</div>
            <div className="text-2xl font-bold text-white mt-0.5">{activeQueued}</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4 shadow-lg">
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">MVP Pitches Sent</div>
            <div className="text-2xl font-bold text-white mt-0.5">{totalSent}</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4 shadow-lg">
          <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">Founder Replies</div>
            <div className="text-2xl font-bold text-white mt-0.5">{totalReplied}</div>
          </div>
        </div>
      </div>

      {/* Launcher Panel */}
      <StartupLauncher onScrapeComplete={fetchLeads} />

      {/* Table Display */}
      <StartupLeadsTable leads={leads} onRefresh={fetchLeads} />
    </main>
  );
}
