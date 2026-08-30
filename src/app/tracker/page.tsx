'use client';

import React, { useState, useEffect } from 'react';
import { Download, Search, Activity, Filter, Clock, ArrowRight } from 'lucide-react';
import Image from 'next/image';

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
}

export default function ProspectTracker() {
  const [data, setData] = useState<TrackerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [intentFilter, setIntentFilter] = useState('ALL');

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
    const headers = [
      'company_name', 'email', 'subject', 'sent_at', 'status',
      'opens', 'clicks', 'intent', 'score', 'last_active_at',
      'follow_up_step', 'campaign', 'website_url'
    ];
    
    const rows = filteredData.map(row => [
      `"${row.company_name || ''}"`,
      row.email || '',
      `"${row.subject || ''}"`,
      row.sent_at || '',
      row.status || '',
      row.times_opened,
      row.times_clicked,
      row.intent_selected || '',
      row.engagement_score,
      row.last_active_at || '',
      row.follow_up_step,
      `"${row.campaign || ''}"`,
      row.website_url || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `prospect_tracker_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getIntentBadge = (intent: string | null) => {
    switch(intent) {
      case 'fix': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">🟢 Fix</span>;
      case 'nurture': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-400">🟡 Nurture</span>;
      case 'pass': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-400">🔴 Pass</span>;
      default: return <span className="text-zinc-600 text-xs">—</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'SENT') return <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-[10px] rounded uppercase font-medium">SENT</span>;
    if (status === 'REPLIED') return <span className="px-2 py-1 bg-purple-500/10 text-purple-400 text-[10px] rounded uppercase font-medium">REPLIED</span>;
    if (status === 'UNCONTACTABLE') return <span className="px-2 py-1 bg-rose-500/10 text-rose-400 text-[10px] rounded uppercase font-medium">CLOSED</span>;
    return <span className="px-2 py-1 bg-white/5 text-zinc-400 text-[10px] rounded uppercase font-medium">{status}</span>;
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
                <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">BETA</span>
              </h1>
              <p className="text-sm text-zinc-400 mt-1">Aggregated engagement signals and intent tracking.</p>
            </div>
          </div>
          <button onClick={downloadCsv} className="h-10 px-4 inline-flex items-center gap-2 bg-white text-black text-sm font-medium rounded-xl hover:bg-zinc-200 transition-colors">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
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
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Prospect</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Status</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Score</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Intent</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Events</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Timeline</th>
                  <th className="px-6 py-4 text-[11px] font-mono text-zinc-500 uppercase tracking-wider font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 text-sm">
                      <div className="flex flex-col items-center gap-3">
                        <Activity className="w-6 h-6 animate-pulse text-indigo-500" />
                        Aggregating activity logs...
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 text-sm">No prospects found matching your criteria.</td>
                  </tr>
                ) : (
                  filteredData.map(row => (
                    <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white mb-0.5">{row.company_name}</div>
                        <div className="text-xs text-zinc-500 flex flex-col gap-0.5">
                          <span>{row.email}</span>
                          <span className="truncate max-w-[200px]" title={row.subject}>{row.subject}</span>
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
                            <span className="text-zinc-500">OPENS</span>
                            <span className="text-white">{row.times_opened}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-zinc-500">CLICKS</span>
                            <span className="text-white">{row.times_clicked}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-zinc-400 flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            Active {timeAgo(row.last_active_at)}
                          </div>
                          <div>Step {row.follow_up_step}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <a href={`/audit/${row.id}`} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                          <ArrowRight className="w-4 h-4 text-zinc-400" />
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
