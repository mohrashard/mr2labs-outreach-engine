"use client";

import React, { useState } from 'react';
import { 
  ExternalLink, Copy, Check, Sparkles, 
  Phone, Camera, Briefcase, ChevronRight, Mail, AlertCircle
} from 'lucide-react';
import { OutreachLead, LeadStatus } from '@/types/lead';

interface LeadsTableProps {
  leads: OutreachLead[];
  onSelectLead: (lead: OutreachLead) => void;
}

export function LeadsTable({ leads, onSelectLead }: LeadsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, email: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(email);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'NEW':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">New</span>;
      case 'QUEUED':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Queued</span>;
      case 'SENT':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Sent</span>;
      case 'REPLIED':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold animate-pulse">Replied</span>;
      case 'MISSING_EMAIL':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">No Email</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">{status}</span>;
    }
  };

  return (
    <div className="bg-[#111116] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
      <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-white">Scraped Leads Pipeline</h2>
          <span className="text-xs font-bold px-2.5 py-1 bg-white/10 rounded-full text-gray-300">
            {leads.length} Leads
          </span>
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse min-w-[850px]">
          <thead>
            <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-white/5 bg-black/40">
              <th className="py-4 px-6 font-semibold">Company & Domain</th>
              <th className="py-4 px-6 font-semibold">Direct Email</th>
              <th className="py-4 px-6 font-semibold">AI Audit Status</th>
              <th className="py-4 px-6 font-semibold text-center">Status</th>
              <th className="py-4 px-6 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-500 font-medium">
                  No leads found. Create a campaign to start discovery scraping.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr 
                  key={lead.id} 
                  onClick={() => onSelectLead(lead)}
                  className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                >
                  {/* Company & Domain */}
                  <td className="py-5 px-6">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm group-hover:text-indigo-400 transition-colors">
                        {lead.company_name}
                      </span>
                      <a 
                        href={lead.website_url} 
                        target="_blank" 
                        rel="noreferrer" 
                        onClick={(e) => e.stopPropagation()}
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-xs text-gray-400 truncate max-w-[220px] mt-0.5">
                      {lead.website_url.replace(/^https?:\/\//, '')}
                    </p>

                    {/* Contact Channels */}
                    <div className="flex gap-2 mt-2 items-center">
                      {lead.whatsapp && (
                        <span title="WhatsApp available" className="p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Phone className="w-3 h-3" />
                        </span>
                      )}
                      {lead.linkedin_url && (
                        <span title="LinkedIn available" className="p-1 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          <Briefcase className="w-3 h-3" />
                        </span>
                      )}
                      {lead.instagram_url && (
                        <span title="Instagram available" className="p-1 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
                          <Camera className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Direct Email */}
                  <td className="py-5 px-6">
                    {lead.email ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-emerald-400 font-medium">{lead.email}</span>
                        <button
                          onClick={(e) => handleCopy(e, lead.email!, lead.id)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                          title="Copy Email"
                        >
                          {copiedId === lead.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-rose-400 font-mono bg-rose-950/40 px-2.5 py-1 rounded-md border border-rose-800/40">
                        <AlertCircle className="w-3 h-3" /> Missing Email
                      </span>
                    )}
                  </td>

                  {/* AI Audit Status */}
                  <td className="py-5 px-6">
                    {lead.audit_notes ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Audit Ready
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500 italic">Pending...</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-5 px-6 text-center">
                    {getStatusBadge(lead.status)}
                  </td>

                  {/* Actions */}
                  <td className="py-5 px-6 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLead(lead);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-indigo-600 hover:text-white text-xs font-semibold text-gray-300 transition-all shadow-sm border border-white/10 hover:border-indigo-500"
                    >
                      Inspect & Pitch <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
