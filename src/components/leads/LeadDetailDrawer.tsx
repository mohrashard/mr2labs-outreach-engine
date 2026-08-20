"use client";

import React, { useState, useEffect } from 'react';
import { 
  X, Sparkles, Send, Save, ExternalLink, Copy, Check, 
  FileText, Code2, Clock, Phone, Camera, Briefcase, 
  MessageSquare, Globe, Mail, ShieldAlert, ImageIcon
} from 'lucide-react';
import { OutreachLead, LeadStatus } from '@/types/lead';

interface LeadDetailDrawerProps {
  lead: OutreachLead | null;
  onClose: () => void;
  onUpdateLead: (updatedLead: OutreachLead) => void;
  onSendTestEmail: (lead: OutreachLead) => Promise<void>;
}

export function LeadDetailDrawer({ 
  lead, 
  onClose, 
  onUpdateLead, 
  onSendTestEmail 
}: LeadDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'pitch' | 'dom' | 'activity'>('pitch');
  const [emailSubject, setEmailSubject] = useState('');
  const [auditNotes, setAuditNotes] = useState('');
  const [pitchText, setPitchText] = useState('');
  const [status, setStatus] = useState<LeadStatus>('NEW');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setEmailSubject(lead.email_subject || '');
      setAuditNotes(lead.audit_notes || '');
      setPitchText(lead.pitch_text || '');
      setStatus(lead.status);
    }
  }, [lead]);

  if (!lead) return null;

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated: OutreachLead = {
        ...lead,
        email_subject: emailSubject,
        audit_notes: auditNotes,
        pitch_text: pitchText,
        status,
      };
      await onUpdateLead(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    setIsSending(true);
    try {
      await onSendTestEmail({
        ...lead,
        email_subject: emailSubject,
        pitch_text: pitchText,
      });
    } finally {
      setIsSending(false);
    }
  };

  const rawDomText = typeof lead.raw_scraped_data === 'object' && lead.raw_scraped_data !== null
    ? (lead.raw_scraped_data.dom_snippet || JSON.stringify(lead.raw_scraped_data, null, 2))
    : (lead.raw_scraped_data || 'No raw scraped DOM text available.');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Backdrop Click to Close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Body */}
      <div className="w-full max-w-2xl bg-[#09090b] border-l border-zinc-800 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 bg-zinc-950/80 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">{lead.company_name}</h2>
              <a 
                href={lead.website_url} 
                target="_blank" 
                rel="noreferrer" 
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-1">{lead.website_url}</p>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/50 px-6">
          <button
            onClick={() => setActiveTab('pitch')}
            className={`py-3.5 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'pitch' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-400" /> Pitch Studio
          </button>
          <button
            onClick={() => setActiveTab('dom')}
            className={`py-3.5 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'dom' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-4 h-4 text-emerald-400" /> DOM & Contacts
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`py-3.5 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'activity' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-400" /> Activity Logs
          </button>
        </div>

        {/* Drawer Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: PITCH STUDIO */}
          {activeTab === 'pitch' && (
            <div className="space-y-5">
              {/* Lead Status Select */}
              <div className="flex items-center justify-between p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Pipeline Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as LeadStatus)}
                  className="bg-black border border-zinc-700 text-white rounded-xl px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="NEW">NEW</option>
                  <option value="QUEUED">QUEUED</option>
                  <option value="SENT">SENT</option>
                  <option value="REPLIED">REPLIED</option>
                  <option value="MISSING_EMAIL">MISSING_EMAIL</option>
                  <option value="UNCONTACTABLE">UNCONTACTABLE</option>
                  <option value="INVALID_DOMAIN">INVALID_DOMAIN</option>
                </select>
              </div>

              {/* Email Subject Line */}
              <div>
                <label className="block text-xs font-semibold text-amber-300 mb-2 uppercase tracking-wider">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="e.g. Quick question regarding site conversions"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              {/* Site Audit Notes */}
              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-2 uppercase tracking-wider">
                  AI Technical Audit Findings
                </label>
                <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-2xl">
                  <textarea
                    rows={2}
                    value={auditNotes}
                    onChange={(e) => setAuditNotes(e.target.value)}
                    className="w-full bg-transparent text-xs text-rose-200 focus:outline-none resize-none"
                  />
                </div>
              </div>

              {/* Custom Pitch Generator */}
              <div>
                <label className="block text-xs font-semibold text-indigo-400 mb-2 uppercase tracking-wider">
                  Tailored Pitch Proposal
                </label>
                <textarea
                  rows={4}
                  value={pitchText}
                  onChange={(e) => setPitchText(e.target.value)}
                  placeholder="Enter customized sales pitch..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 2: DOM & CONTACTS */}
          {activeTab === 'dom' && (
            <div className="space-y-6">
              {/* Direct Endpoints Card */}
              <div className="p-5 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Direct Contact Endpoints</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-black/40 rounded-xl border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs text-zinc-300 font-mono truncate">{lead.email || 'No email found'}</span>
                    </div>
                    {lead.email && (
                      <button onClick={() => handleCopy(lead.email!, 'email')} className="text-zinc-500 hover:text-white">
                        {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  <div className="p-3 bg-black/40 rounded-xl border border-zinc-800 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-zinc-300 font-mono">{lead.phone || 'No phone'}</span>
                  </div>

                  {lead.whatsapp && (
                    <a href={lead.whatsapp} target="_blank" rel="noreferrer" className="p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-xl flex items-center gap-2 text-xs text-emerald-400 hover:bg-emerald-900/40 transition-colors">
                      <MessageSquare className="w-4 h-4" /> Open WhatsApp
                    </a>
                  )}

                  {lead.linkedin_url && (
                    <a href={lead.linkedin_url} target="_blank" rel="noreferrer" className="p-3 bg-sky-950/30 border border-sky-800/50 rounded-xl flex items-center gap-2 text-xs text-sky-400 hover:bg-sky-900/40 transition-colors">
                      <Briefcase className="w-4 h-4" /> LinkedIn Profile
                    </a>
                  )}

                  {lead.instagram_url && (
                    <a href={lead.instagram_url} target="_blank" rel="noreferrer" className="p-3 bg-pink-950/30 border border-pink-800/50 rounded-xl flex items-center gap-2 text-xs text-pink-400 hover:bg-pink-900/40 transition-colors">
                      <Camera className="w-4 h-4" /> Instagram Page
                    </a>
                  )}
                </div>
              </div>

              {/* Live Preview / Screenshot */}
              {lead.screenshot_url && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Homepage Screenshot Preview</h3>
                  <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-black max-h-64">
                    <img 
                      src={lead.screenshot_url} 
                      alt={lead.company_name}
                      className="w-full object-cover object-top hover:opacity-90 transition-opacity"
                    />
                  </div>
                </div>
              )}

              {/* Raw Scraped Text Explorer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Scraped DOM Text Snippet</h3>
                  <button 
                    onClick={() => handleCopy(rawDomText, 'dom')} 
                    className="text-xs text-zinc-500 hover:text-white flex items-center gap-1"
                  >
                    {copiedField === 'dom' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Copy Raw Text
                  </button>
                </div>
                <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 max-h-60 overflow-y-auto font-mono text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                  {rawDomText}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACTIVITY LOGS */}
          {activeTab === 'activity' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Dispatch & Audit Timeline</h3>
              <div className="space-y-3">
                <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">Lead Discovered & AI Audited</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{new Date(lead.created_at).toLocaleString()}</p>
                  </div>
                </div>

                {lead.sent_at ? (
                  <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800 flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5">
                      <Send className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">Cold Pitch Email Dispatched</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{new Date(lead.sent_at).toLocaleString()}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 flex items-start gap-3 opacity-60">
                    <div className="p-2 rounded-xl bg-zinc-800 text-zinc-500 mt-0.5">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-400">Email Pending Queue Flush</p>
                      <p className="text-xs text-zinc-600 mt-0.5">Not dispatched yet</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Bar Footer */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 bg-white hover:bg-zinc-200 disabled:opacity-50 text-black rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg"
          >
            <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Lead Changes'}
          </button>

          {lead.email && (
            <button
              onClick={handleSendTest}
              disabled={isSending}
              className="py-3 px-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
            >
              <Send className="w-4 h-4" /> {isSending ? 'Sending...' : 'Send Test Email'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
