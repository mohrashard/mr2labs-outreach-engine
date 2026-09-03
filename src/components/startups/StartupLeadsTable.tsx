'use client';

import { useState } from 'react';
import { StartupLead } from '@/types/startup';
import { ExternalLink, Globe, Mail, Search, CheckCircle2, Clock, XCircle, Tag, Send, Download } from 'lucide-react';

interface StartupLeadsTableProps {
  leads: StartupLead[];
  onRefresh?: () => void;
}

export function StartupLeadsTable({ leads, onRefresh }: StartupLeadsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      !searchTerm ||
      lead.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.website_url.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.work_email && lead.work_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.founder_name && lead.founder_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || lead.status === statusFilter;
    const matchesSource = sourceFilter === 'ALL' || lead.source_type === sourceFilter;

    return matchesSearch && matchesStatus && matchesSource;
  });

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
      'Founder Name',
      'Work Email',
      'LinkedIn URL',
      'Source Type',
      'YC Batch',
      'Tech Stack',
      'Intent Snippet',
      'Status',
      'Sent At',
      'Created At'
    ];

    const rows = filteredLeads.map(lead => [
      escapeCsv(lead.company_name || ''),
      escapeCsv(lead.website_url || ''),
      escapeCsv(lead.founder_name || ''),
      escapeCsv(lead.work_email || ''),
      escapeCsv(lead.linkedin_url || ''),
      escapeCsv(lead.source_type || ''),
      escapeCsv(lead.yc_batch || ''),
      escapeCsv((lead.tech_stack || []).join('; ')),
      escapeCsv(lead.intent_snippet || ''),
      escapeCsv(lead.status || ''),
      escapeCsv(lead.sent_at || ''),
      escapeCsv(lead.created_at || '')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `startup_leads_${sourceFilter.toLowerCase()}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT':
        return <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Sent</span>;
      case 'QUEUED':
        return <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock className="w-3 h-3" /> Queued</span>;
      case 'REPLIED':
        return <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"><Send className="w-3 h-3" /> Replied</span>;
      case 'INVALID_DOMAIN':
      case 'REJECTED':
        return <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20"><XCircle className="w-3 h-3" /> Rejected</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">New</span>;
    }
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search company, founder, domain..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto items-center">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Sources</option>
            <option value="HN_INTENT">HN Intent</option>
            <option value="YC_FUNDED">YC Funded</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New</option>
            <option value="QUEUED">Queued</option>
            <option value="SENT">Sent</option>
            <option value="REPLIED">Replied</option>
          </select>

          <button
            onClick={handleExportCsv}
            disabled={filteredLeads.length === 0}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            title="Export CSV of filtered startup leads"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Company & Target</th>
              <th className="py-3 px-4">Founder & Work Email</th>
              <th className="py-3 px-4">Intent / Tech Stack</th>
              <th className="py-3 px-4">Source</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No startup leads found matching the filters.
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-white text-sm">{lead.company_name}</div>
                    <a
                      href={lead.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline inline-flex items-center gap-1 text-xs mt-0.5"
                    >
                      {lead.website_url.includes('news.ycombinator.com')
                        ? 'View HN Post'
                        : lead.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '') === '&'
                        ? 'HN Post'
                        : lead.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="text-white font-medium flex items-center gap-2">
                      {lead.founder_name || 'Founder/CEO'}
                      {lead.linkedin_url && (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    {lead.work_email ? (
                      <div className="text-slate-400 inline-flex items-center gap-1 text-xs mt-0.5">
                        <Mail className="w-3 h-3 text-slate-500" />
                        {lead.work_email}
                      </div>
                    ) : (
                      <div className="text-slate-600 text-xs italic">Email Pending Enrichment</div>
                    )}
                  </td>

                  <td className="py-3.5 px-4 max-w-xs">
                    <div className="flex flex-wrap gap-1 mb-1">
                      {lead.tech_stack && lead.tech_stack.length > 0 ? (
                        lead.tech_stack.slice(0, 3).map((tech, idx) => (
                          <span key={idx} className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] px-2 py-0.5 rounded">
                            {tech}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-600 text-[10px]">MVP Tech</span>
                      )}
                    </div>
                    {lead.intent_snippet && (
                      <p className="text-slate-400 text-[11px] truncate max-w-xs" title={lead.intent_snippet}>
                        "{lead.intent_snippet}"
                      </p>
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      <Tag className="w-3 h-3 text-amber-400" />
                      {lead.source_type === 'HN_INTENT' ? 'HN Intent' : `YC ${lead.yc_batch || 'Funded'}`}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">{getStatusBadge(lead.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
