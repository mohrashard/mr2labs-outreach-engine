'use client';

import React, { useState, useEffect } from 'react';
import { Download, Search, Activity, Clock, ArrowRight, ChevronDown, ChevronUp, Mail, Eye, MousePointer, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import PauseSendingButton from '@/components/PauseSendingButton';

interface SequenceEvent {
  step: number;
  event: string;
  timestamp: string;
}

interface TrackerData {
  id: string;
  company_name: string;
  email: string;
  subject: string;
  sent_at: string | null;
  status: string;
  follow_up_step: number;
  campaign: string | undefined;
  website_url: string;
  times_opened: number;
  times_clicked: number;
  intent_selected: 'fix' | 'nurture' | 'pass' | null;
  last_active_at: string | null;
  days_since_contact: number | null;
  engagement_score: number;
  sequence_history?: SequenceEvent[];
}

export default function ProspectTracker() {
  const [data, setData] = useState<TrackerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [intentFilter, setIntentFilter] = useState('ALL');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tracker')
      .then(res => res.json())
      .then(json => {
        if (json.success) setData(json.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const filteredData = data.filter(row => {
    const matchesSearch = 
      row.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      row.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
    const matchesIntent = intentFilter === 'ALL' || (intentFilter === 'NONE' ? !row.intent_selected : row.intent_selected === intentFilter);
    
    return matchesSearch && matchesStatus && matchesIntent;
  });

  const downloadCsv = () => {
    if (filteredData.length === 0) return;

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      'Company Name',
      'Website URL',
      'Email',
      'Subject',
      'Status',
      'Engagement Score',
      'Intent Selected',
      'Opens',
      'Clicks',
      'Follow-up Step',
      'Campaign',
      'Sent At',
      'Last Active At',
      'Days Since Contact'
    ];
    
    const rows = filteredData.map(row => [
      escapeCsv(row.company_name || ''),
      escapeCsv(row.website_url || ''),
      escapeCsv(row.email || ''),
      escapeCsv(row.subject || ''),
      escapeCsv(row.status || ''),
      escapeCsv(row.engagement_score),
      escapeCsv(row.intent_selected || ''),
      escapeCsv(row.times_opened),
      escapeCsv(row.times_clicked),
      escapeCsv(row.follow_up_step),
      escapeCsv(row.campaign || ''),
      escapeCsv(row.sent_at || ''),
      escapeCsv(row.last_active_at || ''),
      escapeCsv(row.days_since_contact ?? '')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `prospect_tracker_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getIntentBadge = (intent: string | null) => {
    switch(intent) {
      case 'fix': return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">🟢 Fix</span>;
      case 'nurture': return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-400">🟡 Nurture</span>;
      case 'pass': return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-[10px] font-mono text-rose-400">🔴 Pass</span>;
      default: return <span className="text-zinc-600 text-xs">—</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPENED':
        return <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] rounded uppercase font-medium">OPENED</span>;
      case 'CLICKED':
        return <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] rounded uppercase font-medium">CLICKED</span>;
      case 'INTERESTED':
        return <span className="px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] rounded uppercase font-semibold">INTERESTED</span>;
      case 'REPLIED':
        return <span className="px-2 py-1 bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] rounded uppercase font-semibold">REPLIED</span>;
      case 'UNCONTACTABLE':
      case 'BOUNCED':
      case 'UNSUBSCRIBED':
        return <span className="px-2 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] rounded uppercase font-medium">{status}</span>;
      case 'SENT':
        return <span className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] rounded uppercase font-medium">SENT</span>;
      default:
        return <span className="px-2 py-1 bg-white/5 border border-white/10 text-zinc-400 text-[10px] rounded uppercase font-medium">{status}</span>;
    }
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const toggleExpand = (id: string) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  return (
    <div className="min-h-[100dvh] bg-[#030407] text-zinc-100 p-6 md:p-8 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-center gap-4">
             <Image src="/mr-squared-logo.png" alt="Mr² Labs" width={40} height={40} className="rounded-xl border border-white/10" />
            <div>
              <h1 className="text-2xl font-medium tracking-tight text-white flex items-center gap-2">
                Prospect Tracker
                <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">LIVE ENGINE</span>
              </h1>
              <p className="text-sm text-zinc-400 mt-1">Multi-step sequence telemetry, engagement sync, & intent tracking.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <PauseSendingButton />

            <Link 
              href="/"
              className="px-3 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-full font-medium text-xs transition-colors flex items-center gap-1 border border-white/10"
            >
              <span>⚡ Main Engine</span>
            </Link>
            <Link 
              href="/dashboard/leads"
              className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-full font-medium text-xs transition-colors flex items-center gap-1 border border-emerald-500/20"
            >
              <span>🎯 Leads Desk</span>
            </Link>
            <Link 
              href="/startups"
              className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-full font-medium text-xs transition-colors flex items-center gap-1 border border-indigo-500/20"
            >
              <span>🚀 Startup Engine</span>
            </Link>
            <Link 
              href="/campaigns"
              className="px-3 py-2 hover:bg-white/5 text-zinc-400 hover:text-zinc-200 rounded-full font-normal text-xs transition-colors"
            >
              Campaigns
            </Link>

            <button onClick={downloadCsv} className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-white text-black text-xs font-medium rounded-full hover:bg-zinc-200 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search company or email..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-black border border-white/10 rounded-xl text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors"
            />
          </div>
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)}
            className="h-10 px-3 bg-black border border-white/10 rounded-xl text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="OPENED">Opened</option>
            <option value="CLICKED">Clicked</option>
            <option value="INTERESTED">Interested</option>
            <option value="REPLIED">Replied</option>
            <option value="UNCONTACTABLE">Closed/Passed</option>
          </select>
          <select 
            value={intentFilter} 
            onChange={e => setIntentFilter(e.target.value)}
            className="h-10 px-3 bg-black border border-white/10 rounded-xl text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Intents</option>
            <option value="fix">🟢 Fix</option>
            <option value="nurture">🟡 Nurture</option>
            <option value="pass">🔴 Pass</option>
            <option value="NONE">No Response</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.01] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-black/40">
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Prospect & Company</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Status</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Score</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Intent</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Engagement</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Multi-Step Progress</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 text-sm">
                      <div className="flex flex-col items-center gap-3">
                        <Activity className="w-6 h-6 animate-pulse text-indigo-500" />
                        Aggregating engagement telemetry...
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 text-sm">No prospects found matching your criteria.</td>
                  </tr>
                ) : (
                  filteredData.map(row => {
                    const isExpanded = expandedRowId === row.id;

                    return (
                      <React.Fragment key={row.id}>
                        <tr 
                          onClick={() => toggleExpand(row.id)} 
                          className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white mb-0.5">{row.company_name}</span>
                              {row.sequence_history && row.sequence_history.length > 0 && (
                                <span className="text-[10px] text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded font-mono">
                                  {row.sequence_history.length} events
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500 flex flex-col gap-0.5">
                              <span>{row.email}</span>
                              <span className="truncate max-w-[220px]" title={row.subject}>{row.subject}</span>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {getStatusBadge(row.status)}
                          </td>

                          <td className="px-6 py-4">
                            <div className={`text-xl font-medium tracking-tight ${row.engagement_score > 5 ? 'text-emerald-400' : 'text-white'}`}>
                              {row.engagement_score}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {getIntentBadge(row.intent_selected)}
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex gap-4 text-xs font-mono">
                              <div className="flex flex-col">
                                <span className="text-zinc-500 text-[10px]">OPENS</span>
                                <span className={`font-semibold ${row.times_opened > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>{row.times_opened}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-zinc-500 text-[10px]">CLICKS</span>
                                <span className={`font-semibold ${row.times_clicked > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>{row.times_clicked}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-xs text-zinc-400 flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                                <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono">
                                  Step {row.follow_up_step} Active
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                                <Clock className="w-3 h-3" />
                                {timeAgo(row.last_active_at)}
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <a 
                                href={`/audit/${row.id}`} 
                                target="_blank" 
                                rel="noreferrer" 
                                onClick={(e) => e.stopPropagation()}
                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                                title="View Audit Landing Page"
                              >
                                <ArrowRight className="w-4 h-4 text-zinc-400" />
                              </a>
                              <button className="text-zinc-500 hover:text-zinc-300">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Multi-Step Timeline Drawer */}
                        {isExpanded && (
                          <tr className="bg-white/[0.015] border-b border-white/5">
                            <td colSpan={7} className="px-8 py-4 bg-black/40">
                              <div className="space-y-3">
                                <h4 className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-semibold flex items-center gap-2">
                                  <Activity className="w-3.5 h-3.5" />
                                  Multi-Step Sequence & Activity Timeline
                                </h4>
                                
                                {(!row.sequence_history || row.sequence_history.length === 0) ? (
                                  <p className="text-xs text-zinc-500">No activity logs recorded for this prospect yet.</p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {row.sequence_history.map((evt, idx) => (
                                      <div key={idx} className="p-3 rounded-xl border border-white/10 bg-black/60 flex items-start gap-2.5">
                                        {evt.event === 'EMAIL_SENT' && <Mail className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />}
                                        {evt.event === 'EMAIL_OPENED' && <Eye className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                                        {evt.event === 'MAGIC_LINK_CLICK' && <MousePointer className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}

                                        <div>
                                          <div className="text-xs font-medium text-white flex items-center gap-1.5">
                                            {evt.event.replace('_', ' ')}
                                            <span className="text-[10px] text-zinc-500 font-mono">Step {evt.step}</span>
                                          </div>
                                          <div className="text-[10px] text-zinc-400 mt-1 font-mono">
                                            {new Date(evt.timestamp).toLocaleString()}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
