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
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" /> New
          </span>
        );
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> Queued
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /> Sent
          </span>
        );
      case 'REPLIED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" /> Replied
          </span>
        );
      case 'MISSING_EMAIL':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" /> No Email
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl shadow-xl shadow-black/20 backdrop-blur-md overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-white/[0.03] flex justify-between items-center bg-transparent">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-medium tracking-tight text-slate-200">Scraped Leads Pipeline</h2>
          <span className="text-xs font-normal px-2.5 py-0.5 bg-white/[0.03] rounded-full text-slate-400">
            {leads.length} Leads
          </span>
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse min-w-[850px]">
          <thead>
            <tr className="bg-transparent border-b border-white/[0.03]">
              <th className="py-3 px-6 font-medium text-[11px] tracking-wider uppercase text-slate-500">Company & Domain</th>
              <th className="py-3 px-6 font-medium text-[11px] tracking-wider uppercase text-slate-500">Direct Email</th>
              <th className="py-3 px-6 font-medium text-[11px] tracking-wider uppercase text-slate-500">AI Audit Status</th>
              <th className="py-3 px-6 font-medium text-[11px] tracking-wider uppercase text-slate-500 text-center">Status</th>
              <th className="py-3 px-6 font-medium text-[11px] tracking-wider uppercase text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-500 font-normal text-sm">
                  No leads found. Create a campaign to start discovery scraping.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr 
                  key={lead.id} 
                  onClick={() => onSelectLead(lead)}
                  className="hover:bg-white/[0.02] transition-colors duration-200 cursor-pointer group"
                >
                  {/* Company & Domain */}
                  <td className="py-5 px-6">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-200 text-sm group-hover:text-indigo-300 transition-colors duration-200">
                        {lead.company_name}
                      </span>
                      <a 
                        href={lead.website_url} 
                        target="_blank" 
                        rel="noreferrer" 
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-600 hover:text-slate-300 transition-colors duration-200"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-xs text-slate-500 truncate max-w-[220px] mt-0.5 font-normal">
                      {lead.website_url.replace(/^https?:\/\//, '')}
                    </p>

                    {/* Contact Channels */}
                    <div className="flex gap-2 mt-2 items-center">
                      {lead.whatsapp && (
                        <span title="WhatsApp available" className="p-1 rounded-md bg-emerald-500/10 text-emerald-400/90 ring-1 ring-emerald-500/15">
                          <Phone className="w-3 h-3" />
                        </span>
                      )}
                      {lead.linkedin_url && (
                        <span title="LinkedIn available" className="p-1 rounded-md bg-sky-500/10 text-sky-400/90 ring-1 ring-sky-500/15">
                          <Briefcase className="w-3 h-3" />
                        </span>
                      )}
                      {lead.instagram_url && (
                        <span title="Instagram available" className="p-1 rounded-md bg-pink-500/10 text-pink-400/90 ring-1 ring-pink-500/15">
                          <Camera className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Direct Email */}
                  <td className="py-5 px-6">
                    {lead.email ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-emerald-400/90 font-normal">{lead.email}</span>
                        <button
                          onClick={(e) => handleCopy(e, lead.email!, lead.id)}
                          className="p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] text-slate-500 hover:text-slate-200 transition-colors"
                          title="Copy Email"
                        >
                          {copiedId === lead.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-rose-300/80 font-normal">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400/80" /> Missing Email
                      </span>
                    )}
                  </td>

                  {/* AI Audit Status */}
                  <td className="py-5 px-6">
                    {lead.audit_notes ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-indigo-300/90 font-normal">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400/90" /> Audit Ready
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600 italic">Pending...</span>
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
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 text-xs font-normal transition-all duration-200"
                    >
                      Inspect & Pitch <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
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
