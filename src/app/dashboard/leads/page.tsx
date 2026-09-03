'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Send, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  Clock, 
  ExternalLink, 
  Sparkles, 
  RefreshCw, 
  ChevronRight, 
  X,
  Mail,
  Building2,
  Activity,
  UserCheck,
  AlertTriangle
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import PauseSendingButton from '@/components/PauseSendingButton';

interface LeadLog {
  id: string;
  event_type: string;
  payload: any;
  created_at: string;
}

interface Lead {
  id: string;
  email: string;
  company_name: string;
  website_url: string;
  email_subject: string | null;
  pitch_text: string | null;
  status: string;
  reply_status: string | null;
  reply_snippet: string | null;
  replied_at: string | null;
  sent_at: string | null;
  last_contacted_at: string | null;
  follow_up_step: number;
  campaign_name: string;
  opens: number;
  clicks: number;
  score: number;
  created_at: string;
  logs: LeadLog[];
}

export default function LeadsDashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [campaignFilter, setCampaignFilter] = useState('ALL');
  const [stepFilter, setStepFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'score' | 'date' | 'opens'>('score');
  
  // Slide-out Drawer State
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/leads');
      const data = await res.json();
      if (data.leads) {
        setLeads(data.leads);
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const showBanner = (type: 'success' | 'error', text: string) => {
    setBannerMessage({ type, text });
    setTimeout(() => setBannerMessage(null), 4000);
  };

  // Handler: Send Audit Link to POSITIVE Lead
  const handleSendAuditLink = async (leadId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActionLoadingId(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}/send-audit`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showBanner('success', data.message || 'Audit link sent via Resend!');
        fetchLeads();
      } else {
        showBanner('error', data.error || 'Failed to send audit link');
      }
    } catch (err: any) {
      showBanner('error', err.message || 'Error sending audit link');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handler: Manually Stop / Opt-out Lead
  const handleOptOutLead = async (leadId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to stop all future emails to this lead?')) return;

    setActionLoadingId(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}/optout`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showBanner('success', data.message || 'Lead marked as STOP and added to suppression list.');
        fetchLeads();
      } else {
        showBanner('error', data.error || 'Failed to opt out lead');
      }
    } catch (err: any) {
      showBanner('error', err.message || 'Error opting out lead');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Derived Stats
  const totalLeads = leads.length;
  const sentLeads = leads.filter(l => l.status === 'SENT').length;
  const positiveReplies = leads.filter(l => l.reply_status === 'POSITIVE' || l.status === 'REPLIED').length;
  const stopRequests = leads.filter(l => l.reply_status === 'STOP' || l.status === 'STOP').length;
  const rejectedLeads = leads.filter(l => l.status === 'REJECTED' || l.status === 'UNCONTACTABLE').length;
  const pendingLeads = leads.filter(l => l.status === 'NEW' || l.status === 'QUEUED').length;

  // Campaigns list
  const uniqueCampaigns = Array.from(new Set(leads.map(l => l.campaign_name).filter(Boolean)));

  // Filtered & Sorted Leads
  const filteredLeads = leads
    .filter(lead => {
      const matchesSearch = 
        (lead.company_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        (lead.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesStatus = true;
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'POSITIVE') matchesStatus = lead.reply_status === 'POSITIVE' || lead.status === 'REPLIED';
        else if (statusFilter === 'STOP') matchesStatus = lead.reply_status === 'STOP' || lead.status === 'STOP';
        else matchesStatus = lead.status === statusFilter;
      }

      const matchesCampaign = campaignFilter === 'ALL' || lead.campaign_name === campaignFilter;
      const matchesStep = stepFilter === 'ALL' || String(lead.follow_up_step) === stepFilter;

      return matchesSearch && matchesStatus && matchesCampaign && matchesStep;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'opens') return b.opens - a.opens;
      if (sortBy === 'date') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return 0;
    });

  const getCleanDomain = (url: string) => {
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      return u.hostname.replace('www.', '');
    } catch (e) {
      return url || '';
    }
  };

  const getStatusBadge = (lead: Lead) => {
    if (lead.reply_status === 'POSITIVE' || lead.status === 'REPLIED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          🟢 POSITIVE
        </span>
      );
    }
    if (lead.reply_status === 'STOP' || lead.status === 'STOP') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
          <XCircle className="w-3.5 h-3.5" />
          🔴 STOP
        </span>
      );
    }
    switch (lead.status) {
      case 'SENT':
        return <span className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs rounded-md font-medium">SENT</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs rounded-md font-medium">REJECTED</span>;
      case 'UNCONTACTABLE':
      case 'INVALID_DOMAIN':
        return <span className="px-2.5 py-1 bg-zinc-500/10 border border-zinc-500/20 text-zinc-400 text-xs rounded-md font-medium">{lead.status}</span>;
      default:
        return <span className="px-2.5 py-1 bg-white/5 border border-white/10 text-zinc-400 text-xs rounded-md font-medium">{lead.status || 'NEW'}</span>;
    }
  };

  const handleExportCsv = () => {
    if (filteredLeads.length === 0) return;

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      'Company Name',
      'Website URL',
      'Email',
      'Status',
      'Reply Status',
      'Reply Snippet',
      'Engagement Score',
      'Opens',
      'Clicks',
      'Follow-up Step',
      'Campaign',
      'Email Subject',
      'Pitch Text',
      'Sent At',
      'Last Contacted At',
      'Replied At',
      'Created At'
    ];

    const rows = filteredLeads.map(lead => [
      escapeCsv(lead.company_name || ''),
      escapeCsv(lead.website_url || ''),
      escapeCsv(lead.email || ''),
      escapeCsv(lead.status || ''),
      escapeCsv(lead.reply_status || ''),
      escapeCsv(lead.reply_snippet || ''),
      escapeCsv(lead.score),
      escapeCsv(lead.opens),
      escapeCsv(lead.clicks),
      escapeCsv(lead.follow_up_step),
      escapeCsv(lead.campaign_name || ''),
      escapeCsv(lead.email_subject || ''),
      escapeCsv(lead.pitch_text || ''),
      escapeCsv(lead.sent_at || ''),
      escapeCsv(lead.last_contacted_at || ''),
      escapeCsv(lead.replied_at || ''),
      escapeCsv(lead.created_at || '')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `leads_desk_${statusFilter.toLowerCase()}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#030407] text-zinc-100 p-6 md:p-10 font-sans">
      <div className="max-w-[1500px] mx-auto space-y-8">
        
        {/* Banner Alert Notification */}
        {bannerMessage && (
          <div className={`p-4 rounded-xl border flex items-center justify-between text-sm font-medium transition-all ${
            bannerMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <span>{bannerMessage.text}</span>
            <button onClick={() => setBannerMessage(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Top Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                Leads Management Dashboard
                <span className="text-xs font-mono px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">MR² ENGINE</span>
              </h1>
              <p className="text-sm text-zinc-400 mt-1">Full prospect pipeline lifecycle, permission-ask tracking & opt-out controls.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <PauseSendingButton />

            <Link 
              href="/"
              className="px-3 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-full font-medium text-xs transition-colors flex items-center gap-1.5 border border-white/10"
            >
              <span>⚡ Main Engine</span>
            </Link>
            <Link 
              href="/startups"
              className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-full font-medium text-xs transition-colors flex items-center gap-1.5 border border-indigo-500/20"
            >
              <span>🚀 Startup Engine</span>
            </Link>
            <Link 
              href="/campaigns"
              className="px-3 py-2 hover:bg-white/5 text-zinc-400 hover:text-zinc-200 rounded-full font-normal text-xs transition-colors"
            >
              Campaigns
            </Link>
            <Link 
              href="/templates"
              className="px-3 py-2 hover:bg-white/5 text-zinc-400 hover:text-zinc-200 rounded-full font-normal text-xs transition-colors"
            >
              Templates
            </Link>
            <Link 
              href="/followups"
              className="px-3 py-2 hover:bg-white/5 text-zinc-400 hover:text-zinc-200 rounded-full font-normal text-xs transition-colors"
            >
              Follow-ups
            </Link>
            <Link 
              href="/tracker"
              className="px-3 py-2 hover:bg-white/5 text-zinc-400 hover:text-zinc-200 rounded-full font-normal text-xs transition-colors"
            >
              Tracker
            </Link>

            <button
              onClick={handleExportCsv}
              disabled={filteredLeads.length === 0}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium rounded-full transition-colors cursor-pointer disabled:opacity-40"
              title="Export CSV of filtered leads with all details"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Export CSV ({filteredLeads.length})
            </button>

            <button
              onClick={fetchLeads}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-zinc-900 border border-white/10 text-zinc-300 text-xs font-medium rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Top Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
            <div className="text-xs text-zinc-400 font-medium">Total Leads</div>
            <div className="text-2xl font-bold text-white mt-1">{totalLeads}</div>
          </div>

          <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/[0.03]">
            <div className="text-xs text-blue-400 font-medium">Emails Sent</div>
            <div className="text-2xl font-bold text-blue-300 mt-1">{sentLeads}</div>
          </div>

          <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03]">
            <div className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Positive Replies
            </div>
            <div className="text-2xl font-bold text-emerald-300 mt-1">{positiveReplies}</div>
          </div>

          <div className="p-4 rounded-2xl border border-rose-500/20 bg-rose-500/[0.03]">
            <div className="text-xs text-rose-400 font-medium flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> Stop Requests
            </div>
            <div className="text-2xl font-bold text-rose-300 mt-1">{stopRequests}</div>
          </div>

          <div className="p-4 rounded-2xl border border-orange-500/20 bg-orange-500/[0.03]">
            <div className="text-xs text-orange-400 font-medium">Rejected / Failed</div>
            <div className="text-2xl font-bold text-orange-300 mt-1">{rejectedLeads}</div>
          </div>

          <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
            <div className="text-xs text-zinc-400 font-medium">Pending Queue</div>
            <div className="text-2xl font-bold text-zinc-300 mt-1">{pendingLeads}</div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search by company name or email..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-black border border-white/10 rounded-xl text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <select
            value={campaignFilter}
            onChange={e => setCampaignFilter(e.target.value)}
            className="h-10 px-3 bg-black border border-white/10 rounded-xl text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Campaigns</option>
            {uniqueCampaigns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-10 px-3 bg-black border border-white/10 rounded-xl text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="POSITIVE">🟢 Positive Replies</option>
            <option value="STOP">🔴 Stop Requests</option>
            <option value="SENT">Sent</option>
            <option value="NEW">New</option>
            <option value="REJECTED">Rejected</option>
            <option value="UNCONTACTABLE">Uncontactable</option>
          </select>

          <select
            value={stepFilter}
            onChange={e => setStepFilter(e.target.value)}
            className="h-10 px-3 bg-black border border-white/10 rounded-xl text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Sequence Steps</option>
            <option value="0">Step 0 (Initial)</option>
            <option value="1">Step 1 (Follow-up)</option>
            <option value="2">Step 2 (Follow-up)</option>
            <option value="3">Step 3 (Final)</option>
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="h-10 px-3 bg-black border border-white/10 rounded-xl text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="score">Sort: Engagement Score</option>
            <option value="date">Sort: Recent Date</option>
            <option value="opens">Sort: Opens Count</option>
          </select>
        </div>

        {/* Main Leads Table */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.01] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-black/50">
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Company & Email</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Campaign</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Status</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Step</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Opens</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Score</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Last Contacted</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-zinc-500 text-sm">
                      <div className="flex flex-col items-center gap-3">
                        <Activity className="w-6 h-6 animate-spin text-indigo-500" />
                        Fetching leads pipeline data...
                      </div>
                    </td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-zinc-500 text-sm">No leads match your selected filters.</td>
                  </tr>
                ) : (
                  filteredLeads.map(lead => {
                    const cleanDomain = getCleanDomain(lead.website_url);
                    const faviconUrl = cleanDomain ? `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=64` : null;
                    const isPositive = lead.reply_status === 'POSITIVE' || lead.status === 'REPLIED';
                    const isStop = lead.reply_status === 'STOP' || lead.status === 'STOP';

                    return (
                      <tr 
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                      >
                        {/* Company & Email */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {faviconUrl ? (
                              <img src={faviconUrl} alt="" className="w-6 h-6 rounded-md bg-zinc-800 shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            ) : (
                              <Building2 className="w-5 h-5 text-zinc-600 shrink-0" />
                            )}
                            <div>
                              <div className="font-semibold text-white text-sm">{lead.company_name}</div>
                              <div className="text-xs text-zinc-400 mt-0.5">{lead.email || '—'}</div>
                            </div>
                          </div>
                        </td>

                        {/* Campaign */}
                        <td className="px-6 py-4 text-xs text-zinc-400 font-mono">
                          {lead.campaign_name}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          {getStatusBadge(lead)}
                        </td>

                        {/* Step */}
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono rounded">
                            Step {lead.follow_up_step}
                          </span>
                        </td>

                        {/* Opens */}
                        <td className="px-6 py-4 text-xs font-mono font-semibold text-amber-400">
                          {lead.opens}
                        </td>

                        {/* Score */}
                        <td className="px-6 py-4 text-sm font-bold text-emerald-400">
                          {lead.score}
                        </td>

                        {/* Last Contacted */}
                        <td className="px-6 py-4 text-xs text-zinc-400">
                          {lead.sent_at ? new Date(lead.sent_at).toLocaleDateString() : '—'}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                            
                            {/* POSITIVE Lead Actions */}
                            {isPositive && (
                              <>
                                <button
                                  onClick={e => handleSendAuditLink(lead.id, e)}
                                  disabled={actionLoadingId === lead.id}
                                  className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                                  title="Send diagnostic link email via Resend"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  Send Audit Link
                                </button>

                                <a
                                  href={`/audit/${lead.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  View Audit
                                </a>
                              </>
                            )}

                            {/* STOP Lead Badge */}
                            {isStop && (
                              <span className="px-2.5 py-1 bg-zinc-800 text-zinc-500 border border-zinc-700 text-xs font-mono rounded-md">
                                Removed
                              </span>
                            )}

                            {/* Manual Opt-Out Button (if not already STOP) */}
                            {!isStop && (
                              <button
                                onClick={e => handleOptOutLead(lead.id, e)}
                                disabled={actionLoadingId === lead.id}
                                className="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium rounded-lg transition-colors"
                                title="Opt-out lead and add to suppression list"
                              >
                                Stop
                              </button>
                            )}

                            {/* View Slide-out Drawer */}
                            <button
                              onClick={() => setSelectedLead(lead)}
                              className="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                              title="View full lead telemetry drawer"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Slide-Out Detail Panel / Drawer */}
        {selectedLead && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end" onClick={() => setSelectedLead(null)}>
            <div 
              className="w-full max-w-2xl bg-[#0a0c12] border-l border-white/10 h-full p-6 md:p-8 overflow-y-auto space-y-6 text-zinc-100 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    {selectedLead.company_name}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">{selectedLead.email}</p>
                </div>
                <button 
                  onClick={() => setSelectedLead(null)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status & Intent Summary */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-zinc-500">Status</div>
                  <div className="mt-1">{getStatusBadge(selectedLead)}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Sequence Step</div>
                  <div className="font-mono text-indigo-300 mt-1 font-semibold">Step {selectedLead.follow_up_step}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Opens</div>
                  <div className="font-mono text-amber-400 mt-1 font-semibold">{selectedLead.opens}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Score</div>
                  <div className="font-mono text-emerald-400 mt-1 font-semibold">{selectedLead.score}</div>
                </div>
              </div>

              {/* Reply Snippet If Available */}
              {selectedLead.reply_snippet && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 space-y-2">
                  <div className="text-xs font-semibold uppercase font-mono flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4" /> Inbound Reply Snippet
                  </div>
                  <p className="text-xs italic bg-black/40 p-3 rounded-lg border border-emerald-500/20 font-sans">
                    "{selectedLead.reply_snippet}"
                  </p>
                </div>
              )}

              {/* Sent Pitch Body */}
              <div className="space-y-2">
                <h3 className="text-xs font-mono uppercase text-zinc-400 font-semibold">Pitch Sent</h3>
                <div className="p-4 rounded-xl bg-black/60 border border-white/10 text-xs text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap">
                  {selectedLead.pitch_text || 'No pitch body text recorded.'}
                </div>
              </div>

              {/* Activity Logs Timeline */}
              <div className="space-y-3">
                <h3 className="text-xs font-mono uppercase text-indigo-400 font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Activity Telemetry Timeline
                </h3>

                {(!selectedLead.logs || selectedLead.logs.length === 0) ? (
                  <p className="text-xs text-zinc-500">No activity logs recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedLead.logs.map(log => (
                      <div key={log.id} className="p-3 rounded-xl border border-white/10 bg-white/[0.01] flex items-start justify-between text-xs">
                        <div>
                          <div className="font-mono text-white font-medium">{log.event_type}</div>
                          {log.payload && (
                            <pre className="text-[10px] text-zinc-400 mt-1 font-mono bg-black/40 p-2 rounded max-w-md overflow-x-auto">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono shrink-0">
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Footer */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <a
                  href={`/audit/${selectedLead.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> Open Audit Page
                </a>

                {selectedLead.reply_status === 'POSITIVE' && (
                  <button
                    onClick={() => handleSendAuditLink(selectedLead.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" /> Send Audit Link Now
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
