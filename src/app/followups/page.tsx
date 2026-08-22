"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Calendar, Mail, Settings, RefreshCw, BarChart } from 'lucide-react';
import Image from 'next/image';

import { LeadDetailDrawer } from '@/components/leads/LeadDetailDrawer';

export default function FollowUpsDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/followups');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async (campaignId: string, s1: number, s2: number, s3: number) => {
    setSaving(true);
    try {
      await fetch('/api/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, step1: s1, step2: s2, step3: s3 })
      });
      await fetchData();
      alert('Settings updated');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLead = async (updated: any) => {
    // Basic stub, just close for now
    setSelectedLead(null);
    fetchData();
  };

  const handleSendTestEmail = async (lead: any) => {
    alert("Test email not supported from Follow-ups view yet.");
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0c] text-white p-10 flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-300 font-sans pb-20 relative">
      <LeadDetailDrawer 
        lead={selectedLead} 
        onClose={() => setSelectedLead(null)} 
        onUpdateLead={handleUpdateLead}
        onSendTestEmail={handleSendTestEmail}
      />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[380px] bg-gradient-to-b from-indigo-950/[0.04] via-slate-900/[0.015] to-transparent blur-3xl pointer-events-none" />

      <header className="border-b border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 bg-white/[0.02] hover:bg-white/[0.05] rounded-xl transition-colors">
              <ArrowLeft className="w-4 h-4 text-slate-400" />
            </Link>
            <div className="flex items-center gap-3">
              <Image src="/mr-squared-logo.png" alt="Logo" width={30} height={30} className="rounded-lg ring-1 ring-white/10" />
              <h1 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                Follow-up Operations
                <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-300/90 rounded-full">Pipeline View</span>
              </h1>
            </div>
          </div>
          <button onClick={fetchData} className="p-2 text-slate-400 hover:text-slate-200">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-9 space-y-9 relative z-10">
        {/* Funnel Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Initial Outbound (Step 0)', val: data?.funnel?.step0, color: 'text-slate-200' },
            { label: 'Follow-up 1 (Step 1)', val: data?.funnel?.step1, color: 'text-blue-400' },
            { label: 'Follow-up 2 (Step 2)', val: data?.funnel?.step2, color: 'text-indigo-400' },
            { label: 'Final Push (Step 3)', val: data?.funnel?.step3, color: 'text-purple-400' },
            { label: 'Total Replied', val: data?.funnel?.replied, color: 'text-emerald-400', icon: true }
          ].map((m, i) => (
            <div key={i} className="bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl p-5 relative overflow-hidden">
              <p className="text-[11px] text-slate-500 mb-2">{m.label}</p>
              <div className={`text-2xl font-semibold tracking-tight ${m.color}`}>
                {m.val || 0}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-9">
          {/* Waiting Room Table */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" /> Waiting Room / Scheduled
            </h2>
            <div className="bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.04]">
                    <th className="py-3 px-4 font-medium text-slate-400">Company</th>
                    <th className="py-3 px-4 font-medium text-slate-400">Campaign</th>
                    <th className="py-3 px-4 font-medium text-slate-400">Status</th>
                    <th className="py-3 px-4 font-medium text-slate-400">Last Contact</th>
                    <th className="py-3 px-4 font-medium text-slate-400">Scheduled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {data?.waitingRoom?.map((lead: any) => (
                    <tr 
                      key={lead.id} 
                      onClick={() => setSelectedLead(lead)}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-medium text-slate-300">{lead.company_name}</td>
                      <td className="py-3 px-4 text-slate-500">{lead.campaigns?.name}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${lead.status === 'QUEUED' ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-500/10 text-slate-300'}`}>
                          {lead.status} (Step {lead.follow_up_step})
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString() : 'N/A'}</td>
                      <td className="py-3 px-4 text-indigo-400">{lead.scheduled_for ? new Date(lead.scheduled_for).toLocaleDateString() + ' ' + new Date(lead.scheduled_for).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Auto-calculated'}</td>
                    </tr>
                  ))}
                  {data?.waitingRoom?.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-500">No leads waiting in queue.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Campaign Settings */}
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2">
              <Settings className="w-4 h-4 text-purple-400" /> Automation Rules
            </h2>
            <div className="space-y-4">
              {data?.campaigns?.map((camp: any) => (
                <div key={camp.id} className="bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-slate-300 mb-4">{camp.name}</h3>
                  <div className="space-y-3">
                    {['step_1_days', 'step_2_days', 'step_3_days'].map((key, i) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Wait after Step {i}</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            defaultValue={camp[key]} 
                            id={`${camp.id}-${key}`}
                            className="w-16 bg-[#050505] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-200 text-center focus:outline-none focus:border-indigo-500/50"
                          />
                          <span className="text-[10px] text-slate-500">days</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => {
                      const s1 = parseInt((document.getElementById(`${camp.id}-step_1_days`) as HTMLInputElement).value);
                      const s2 = parseInt((document.getElementById(`${camp.id}-step_2_days`) as HTMLInputElement).value);
                      const s3 = parseInt((document.getElementById(`${camp.id}-step_3_days`) as HTMLInputElement).value);
                      handleUpdateSettings(camp.id, s1, s2, s3);
                    }}
                    disabled={saving}
                    className="w-full mt-5 px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 rounded-xl text-xs transition-colors"
                  >
                    Save Rules
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
