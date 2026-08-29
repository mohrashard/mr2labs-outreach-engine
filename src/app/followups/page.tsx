"use client";

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Clock, 
  Settings, 
  RefreshCw, 
  ShieldCheck, 
  Globe, 
  Mail, 
  Filter, 
  Sparkles,
  Layers,
  ChevronRight,
  Activity,
  Send,
  MessageSquare,
  X,
  Sliders
} from 'lucide-react';
import Image from 'next/image';

import { LeadDetailDrawer } from '@/components/leads/LeadDetailDrawer';

export default function FollowUpsDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isFlushing, setIsFlushing] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [nextCronTime, setNextCronTime] = useState('Calculating...');

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'QUEUED' | 'SENT' | 'REPLIED' | 'NEW'>('ALL');
  const [stepFilter, setStepFilter] = useState<'ALL' | '0' | '1' | '2' | '3'>('ALL');
  const [siteTypeFilter, setSiteTypeFilter] = useState<'ALL' | 'DIY' | 'LEGACY'>('ALL');

  useEffect(() => {
    // Dynamically calculate next 09:00 UTC cron run in local timezone
    const date = new Date();
    date.setUTCHours(9, 0, 0, 0);
    if (date.getTime() < Date.now()) {
      date.setDate(date.getDate() + 1);
    }
    setNextCronTime(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }));
    
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
      alert('Sequence Cadence Rules successfully saved.');
      setIsRulesOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleFlushQueue = async () => {
    setIsFlushing(true);
    try {
      const res = await fetch('/api/cron/daily-outreach?action=dispatch', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'mr2labs_cron_secret_key_2026'}`
        }
      });
      const resData = await res.json();
      if (resData.error) throw new Error(resData.error);
      alert(`Queue flushed! Enqueued ${resData.enqueuedJobs || 0} scheduled follow-ups.`);
      fetchData();
    } catch (err: any) {
      alert(`Error flushing queue: ${err.message}`);
    } finally {
      setIsFlushing(false);
    }
  };

  const handleUpdateLead = async () => {
    setSelectedLead(null);
    fetchData();
  };

  const handleSendTestEmail = async () => {
    alert("Test email dispatch can be triggered from the main Leads dashboard.");
  };

  // Helper for Status Badge styling
  const getStatusBadgeMeta = (status: string) => {
    switch (status) {
      case 'QUEUED':
        return { label: 'QUEUED', color: 'bg-amber-500/10 text-amber-300 border-amber-500/20 shadow-sm shadow-amber-500/5', icon: Clock };
      case 'SENT':
        return { label: 'SENT', color: 'bg-blue-500/10 text-blue-300 border-blue-500/20 shadow-sm shadow-blue-500/5', icon: Send };
      case 'REPLIED':
        return { label: 'REPLIED', color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 shadow-sm shadow-emerald-500/5', icon: MessageSquare };
      case 'NEW':
        return { label: 'NEW LEAD', color: 'bg-purple-500/10 text-purple-300 border-purple-500/20 shadow-sm shadow-purple-500/5', icon: Sparkles };
      default:
        return { label: status, color: 'bg-slate-500/10 text-slate-300 border-slate-500/20', icon: Activity };
    }
  };

  // Helper to extract Site Build Type (DIY vs LEGACY)
  const getSiteTypeMeta = (lead: any) => {
    const raw = lead.raw_scraped_data || {};
    if (raw.site_type === 'DIY') {
      return { label: 'DIY Site', badgeStyle: 'bg-amber-500/10 text-amber-300 border-amber-500/20' };
    }
    const url = (lead.website_url || '').toLowerCase();
    const isDiyUrl = ['wix', 'squarespace', 'carrd', 'weebly', 'webflow', 'framer', 'wordpress'].some(k => url.includes(k));
    if (isDiyUrl) {
      return { label: 'DIY Site', badgeStyle: 'bg-amber-500/10 text-amber-300 border-amber-500/20' };
    }
    return { label: 'Legacy Custom', badgeStyle: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' };
  };

  // Helper to extract Verification Score and Tool
  const getVerificationMeta = (lead: any) => {
    const raw = lead.raw_scraped_data || {};
    const verifier = raw.verifier_used || lead.verifier_used || 'Verifalia (DOM Scraped)';
    let score = raw.confidence_score;
    if (score === undefined || score === null) {
      const source = raw.enrichment_source || 'DOM';
      score = source === 'DOM' ? 75 : 60;
    }

    let color = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (score < 35) color = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    else if (score < 60) color = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

    return { score, verifier, color };
  };

  // Filtered leads
  const filteredWaitingRoom = useMemo(() => {
    if (!data?.waitingRoom) return [];
    return data.waitingRoom.filter((lead: any) => {
      // Status Filter
      if (statusFilter !== 'ALL') {
        if (lead.status !== statusFilter) return false;
      }
      // Step Filter
      if (stepFilter !== 'ALL') {
        const stepNum = parseInt(stepFilter);
        if (lead.follow_up_step !== stepNum) return false;
      }
      // Site Type Filter
      if (siteTypeFilter !== 'ALL') {
        const meta = getSiteTypeMeta(lead);
        if (siteTypeFilter === 'DIY' && meta.label !== 'DIY Site') return false;
        if (siteTypeFilter === 'LEGACY' && meta.label !== 'Legacy Custom') return false;
      }
      return true;
    });
  }, [data, statusFilter, stepFilter, siteTypeFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-white p-10 flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-sm font-medium text-slate-400">Loading Follow-up Operations Pipeline...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-300 font-sans pb-20 relative">
      
      {/* Lead Detail Drawer Overlay */}
      <LeadDetailDrawer 
        lead={selectedLead} 
        onClose={() => setSelectedLead(null)} 
        onUpdateLead={handleUpdateLead}
        onSendTestEmail={handleSendTestEmail}
      />
      
      {/* Sequence Cadence Rules Settings Modal */}
      {isRulesOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0c10] border border-white/10 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <Sliders className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2 uppercase tracking-wide">
                    Sequence Cadence Rules
                  </h2>
                  <p className="text-[11px] text-slate-400">Set wait delays between sequence follow-up steps</p>
                </div>
              </div>
              <button 
                onClick={() => setIsRulesOpen(false)}
                className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {data?.campaigns?.map((camp: any) => (
                <div key={camp.id} className="bg-[#050508] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                    <h3 className="text-xs font-semibold text-slate-200">{camp.name}</h3>
                    <span className="text-[10px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full font-mono">
                      Active Campaign
                    </span>
                  </div>

                  <div className="space-y-3">
                    {[
                      { key: 'step_1_days', step: 1, desc: 'Wait time after Initial Pitch (Step 0)' },
                      { key: 'step_2_days', step: 2, desc: 'Wait time after First Follow-up (Step 1)' },
                      { key: 'step_3_days', step: 3, desc: 'Wait time after Second Follow-up (Step 2)' }
                    ].map((cfg) => (
                      <div key={cfg.key} className="bg-[#0a0a0e] p-3 rounded-xl border border-white/5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-200">Step {cfg.step} Delay</span>
                          <div className="flex items-center gap-1.5">
                            <input 
                              type="number" 
                              defaultValue={camp[cfg.key]} 
                              id={`modal-${camp.id}-${cfg.key}`}
                              className="w-16 bg-[#050508] border border-white/20 rounded-lg px-2 py-1 text-[11px] text-slate-100 text-center font-mono font-bold focus:outline-none focus:border-indigo-500"
                            />
                            <span className="text-[10px] text-slate-400 font-mono">Days</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500">{cfg.desc}</p>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => {
                      const s1 = parseInt((document.getElementById(`modal-${camp.id}-step_1_days`) as HTMLInputElement).value);
                      const s2 = parseInt((document.getElementById(`modal-${camp.id}-step_2_days`) as HTMLInputElement).value);
                      const s3 = parseInt((document.getElementById(`modal-${camp.id}-step_3_days`) as HTMLInputElement).value);
                      handleUpdateSettings(camp.id, s1, s2, s3);
                    }}
                    disabled={saving}
                    className="w-full px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-200 rounded-xl text-xs font-semibold transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5 text-purple-400" />
                    Save Sequence Rules
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[380px] bg-gradient-to-b from-indigo-950/[0.08] via-purple-900/[0.02] to-transparent blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 bg-white/[0.02] hover:bg-white/[0.05] rounded-xl transition-colors ring-1 ring-white/5" title="Back to Dashboard">
              <ArrowLeft className="w-4 h-4 text-slate-400" />
            </Link>
            <Link href="/campaigns" className="px-3 py-2 bg-white/[0.02] hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 rounded-xl transition-colors ring-1 ring-white/5 flex items-center gap-1.5 text-xs" title="Campaign Control Center">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Campaigns</span>
            </Link>
            <div className="flex items-center gap-3">
              <Image src="/mr-squared-logo.png" alt="Logo" width={30} height={30} className="rounded-lg ring-1 ring-white/10" />
              <div>
                <h1 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  Follow-up Operations Engine
                  <span className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20 rounded-full font-mono">
                    Sequence Control
                  </span>
                </h1>
                <p className="text-[11px] text-slate-500 mt-0.5 font-normal">
                  Real-time sequence progression, verification scores, status tracking & build type analytics
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end mr-2">
              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-400" /> Next Batch Execution
              </span>
              <span className="text-[11px] text-indigo-400 font-semibold font-mono">{nextCronTime}</span>
            </div>
            
            {/* Sequence Rules Button Widget */}
            <button 
              onClick={() => setIsRulesOpen(true)}
              className="px-3.5 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-300 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shadow-sm"
            >
              <Settings className="w-3.5 h-3.5 text-purple-400" />
              Cadence Rules
            </button>

            {/* Flush Queue Button */}
            <button 
              onClick={handleFlushQueue}
              disabled={isFlushing}
              className="px-3.5 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 disabled:opacity-40 text-indigo-300 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin text-indigo-400' : ''}`} />
              {isFlushing ? 'Dispatching Queue...' : 'Flush Daily Queue'}
            </button>

            <button 
              onClick={fetchData} 
              className="p-2 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 rounded-xl text-slate-400 hover:text-slate-200 transition-colors" 
              title="Refresh Pipeline Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8 relative z-10">
        
        {/* Sequence Progression Funnel Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {[
            { step: 'Step 0', label: 'Initial Pitch Sent', val: data?.funnel?.step0, color: 'text-slate-200', border: 'border-slate-800/80', bg: 'bg-white/[0.02]' },
            { step: 'Step 1', label: 'Follow-up 1 Queued', val: data?.funnel?.step1, color: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/[0.03]' },
            { step: 'Step 2', label: 'Follow-up 2 Queued', val: data?.funnel?.step2, color: 'text-indigo-400', border: 'border-indigo-500/20', bg: 'bg-indigo-500/[0.03]' },
            { step: 'Step 3', label: 'Final Push Queued', val: data?.funnel?.step3, color: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-500/[0.03]' },
            { step: 'Converted', label: 'Total Replied', val: data?.funnel?.replied, color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/[0.03]' }
          ].map((m, i) => (
            <div key={i} className={`ring-1 ${m.border} ${m.bg} rounded-2xl p-4.5 relative overflow-hidden backdrop-blur-md transition-all hover:ring-white/10`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{m.step}</span>
                <Sparkles className="w-3.5 h-3.5 text-slate-600" />
              </div>
              <div className={`text-2xl font-bold tracking-tight ${m.color} font-mono`}>
                {m.val || 0}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-medium">{m.label}</p>
            </div>
          ))}
        </div>

        {/* 100% Full-Width Expanded Table Section */}
        <div className="space-y-4 w-full">
          
          {/* Filter Bar */}
          <div className="flex flex-col space-y-3 bg-white/[0.015] border border-white/[0.05] p-3.5 rounded-2xl">
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-200">Pipeline Filters</span>
              </div>
              <span className="text-[11px] text-slate-500">
                Showing {filteredWaitingRoom.length} of {data?.waitingRoom?.length || 0} sequence leads
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              
              {/* Status Filter */}
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Lead Status</span>
                <div className="flex items-center bg-[#050508] border border-white/10 rounded-xl p-0.5 text-[11px]">
                  {[
                    { id: 'ALL', label: 'All Statuses' },
                    { id: 'QUEUED', label: 'QUEUED' },
                    { id: 'SENT', label: 'SENT' },
                    { id: 'NEW', label: 'NEW' },
                    { id: 'REPLIED', label: 'REPLIED' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setStatusFilter(tab.id as any)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        statusFilter === tab.id 
                          ? 'bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step Filter */}
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Sequence Step</span>
                <div className="flex items-center bg-[#050508] border border-white/10 rounded-xl p-0.5 text-[11px]">
                  {[
                    { id: 'ALL', label: 'All Steps' },
                    { id: '0', label: 'Step 0' },
                    { id: '1', label: 'Step 1' },
                    { id: '2', label: 'Step 2' },
                    { id: '3', label: 'Step 3' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setStepFilter(tab.id as any)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        stepFilter === tab.id 
                          ? 'bg-indigo-600/30 text-indigo-300 font-medium' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Site Build Type Filter */}
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Site Build</span>
                <div className="flex items-center bg-[#050508] border border-white/10 rounded-xl p-0.5 text-[11px]">
                  {[
                    { id: 'ALL', label: 'All Builds' },
                    { id: 'DIY', label: 'DIY Sites' },
                    { id: 'LEGACY', label: 'Legacy' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSiteTypeFilter(tab.id as any)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        siteTypeFilter === tab.id 
                          ? 'bg-purple-600/30 text-purple-300 font-medium' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Full-Width Waiting Room Table Card */}
          <div className="bg-white/[0.015] border border-white/[0.05] rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl w-full">
            <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <h2 className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
                  Scheduled Follow-up Queue ({filteredWaitingRoom.length})
                </h2>
              </div>
              <span className="text-[11px] text-slate-500">Click any row to inspect lead audit & pitch</span>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.04]">
                    <th className="py-3 px-4 font-semibold text-slate-400 uppercase tracking-wider">Target & Site Build</th>
                    <th className="py-3 px-4 font-semibold text-slate-400 uppercase tracking-wider">Direct Email & Verification</th>
                    <th className="py-3 px-4 font-semibold text-slate-400 uppercase tracking-wider">Live Status & Sequence Step</th>
                    <th className="py-3 px-4 font-semibold text-slate-400 uppercase tracking-wider">Scheduled Dispatch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filteredWaitingRoom.map((lead: any) => {
                    const siteMeta = getSiteTypeMeta(lead);
                    const verifyMeta = getVerificationMeta(lead);
                    const statusMeta = getStatusBadgeMeta(lead.status);
                    const StatusIcon = statusMeta.icon;

                    return (
                      <tr 
                        key={lead.id} 
                        onClick={() => setSelectedLead(lead)}
                        className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      >
                        {/* Target & Site Build */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col space-y-1">
                            <span className="font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                              {lead.company_name}
                              <ChevronRight className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </span>
                            
                            <div className="flex items-center gap-2">
                              <a 
                                href={lead.website_url.startsWith('http') ? lead.website_url : `https://${lead.website_url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 truncate max-w-[220px]"
                              >
                                <Globe className="w-3 h-3 text-slate-600" />
                                {lead.website_url.replace(/^https?:\/\//, '').replace(/^www\./, '')}
                              </a>

                              {/* Site Build Badge */}
                              <span className={`px-1.5 py-0.5 text-[9px] font-mono border rounded-md ${siteMeta.badgeStyle}`}>
                                {siteMeta.label}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Direct Email & Verification */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3 h-3 text-slate-500" />
                              <span className="font-mono text-slate-300">{lead.email || 'No email'}</span>
                            </div>

                            {/* Deliverability Badge */}
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 text-[9px] font-mono border rounded-md ${verifyMeta.color}`}>
                                Score: {verifyMeta.score}/100
                              </span>
                              <span className="text-[9px] text-slate-500 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-indigo-400" />
                                {verifyMeta.verifier}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Live Status & Step */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col space-y-1">
                            <div className="flex items-center gap-2">
                              {/* Dedicated Live Status Badge */}
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border flex items-center gap-1 w-fit ${statusMeta.color}`}>
                                <StatusIcon className="w-3 h-3" />
                                {statusMeta.label}
                              </span>

                              <span className="text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">
                                Step {lead.follow_up_step}
                              </span>
                            </div>

                            <span className="text-[10px] text-slate-500 font-medium">
                              {lead.follow_up_step === 0 ? 'Initial Audit Pitch' : `Follow-up #${lead.follow_up_step}`}
                            </span>
                          </div>
                        </td>

                        {/* Scheduled Dispatch */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col space-y-0.5 font-mono">
                            <span className="text-indigo-400 font-medium">
                              {lead.scheduled_for 
                                ? new Date(lead.scheduled_for).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' @ ' + new Date(lead.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : 'Calculated at 09:00 UTC'}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Last: {lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString() : 'Pending'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredWaitingRoom.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-500">
                        <Layers className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        No leads match the selected status, sequence step, or build type filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
