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
  const [activeTab, setActiveTab] = useState<'pitch' | 'dom' | 'activity' | 'followups'>('pitch');
  const [emailSubject, setEmailSubject] = useState('');
  const [auditNotes, setAuditNotes] = useState('');
  const [pitchText, setPitchText] = useState('');
  const [status, setStatus] = useState<LeadStatus>('NEW');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [realLogs, setRealLogs] = useState<any[]>([]);

  useEffect(() => {
    if (lead) {
      setEmailSubject(lead.email_subject || '');
      setAuditNotes(lead.audit_notes || '');
      setPitchText(lead.pitch_text || '');
      setStatus(lead.status);
    }
  }, [lead]);

  useEffect(() => {
    if (lead && activeTab === 'activity') {
      fetch(`/api/leads/logs?leadId=${lead.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.logs) setRealLogs(data.logs);
        })
        .catch(console.error);
    }
  }, [lead, activeTab]);

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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Backdrop Click to Close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Body */}
      <div className="w-full max-w-2xl bg-[#0B0C10] ring-l ring-white/[0.08] shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="px-7 py-6 border-b border-white/[0.06] bg-white/[0.01] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-100 tracking-tight">{lead.company_name}</h2>
              <a 
                href={lead.website_url} 
                target="_blank" 
                rel="noreferrer" 
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{lead.website_url}</p>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] ring-1 ring-white/[0.08] text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/[0.06] bg-white/[0.005] px-6">
          <button
            onClick={() => setActiveTab('pitch')}
            className={`py-3.5 px-4 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'pitch' 
                ? 'border-indigo-400 text-indigo-300' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-400" /> Pitch Studio
          </button>
          <button
            onClick={() => setActiveTab('dom')}
            className={`py-3.5 px-4 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'dom' 
                ? 'border-indigo-400 text-indigo-300' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4 text-emerald-400" /> DOM & Contacts
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`py-3.5 px-4 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'activity' 
                ? 'border-indigo-400 text-indigo-300' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-400" /> Activity Logs
          </button>
          <button
            onClick={() => setActiveTab('followups')}
            className={`py-3.5 px-4 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'followups' 
                ? 'border-purple-400 text-purple-300' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-purple-400" /> Follow-ups
          </button>
        </div>

        {/* Drawer Content Area */}
        <div className="flex-1 overflow-y-auto p-7 space-y-6">
          {/* TAB 1: PITCH STUDIO */}
          {activeTab === 'pitch' && (
            <div className="space-y-5">
              {/* Lead Status Select */}
              <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl ring-1 ring-white/[0.06]">
                <span className="text-xs font-medium text-slate-400 tracking-normal">Pipeline Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as LeadStatus)}
                  className="bg-white/[0.04] ring-1 ring-white/[0.08] text-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-indigo-400/40 outline-none"
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
                <label className="block text-xs font-medium text-amber-300/90 mb-2 tracking-normal">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="e.g. Quick question regarding site conversions"
                  className="w-full bg-white/[0.025] hover:bg-white/[0.04] ring-1 ring-white/[0.08] focus:ring-1 focus:ring-indigo-400/40 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none transition-all duration-200"
                />
              </div>

              {/* Service Mapping System */}
              {(() => {
                try {
                  const parsedNotes = JSON.parse(auditNotes);
                  if (parsedNotes && parsedNotes.finding) {
                    return (
                      <div className="space-y-4 p-4 bg-white/[0.02] rounded-2xl ring-1 ring-white/[0.06]">
                        <h3 className="text-xs font-medium text-slate-300 mb-2">Service Mapping System</h3>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-rose-400 uppercase tracking-wider">1. Audit Finding</label>
                          <div className="p-3 bg-black/20 ring-1 ring-white/[0.04] rounded-xl text-xs text-slate-200 font-medium">
                            {parsedNotes.finding}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider">2. Business Impact</label>
                          <div className="p-3 bg-black/20 ring-1 ring-white/[0.04] rounded-xl text-xs text-slate-300">
                            {parsedNotes.impact}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider">3. Recommended MR² Service</label>
                          <div className="p-3 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded-xl text-xs font-semibold text-emerald-300">
                            {parsedNotes.service}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-wider">4. Service Pitch</label>
                          <div className="p-3 bg-indigo-500/10 ring-1 ring-indigo-500/20 rounded-xl text-xs text-indigo-200">
                            {parsedNotes.pitch}
                          </div>
                        </div>
                      </div>
                    );
                  }
                } catch (e) {
                  // Fallback for old plain-text records
                }
                
                return (
                  <div>
                    <label className="block text-xs font-medium text-rose-300/90 mb-2 tracking-normal">
                      AI Technical Audit Findings
                    </label>
                    <div className="p-4 bg-rose-500/[0.05] ring-1 ring-rose-500/20 rounded-2xl">
                      <textarea
                        rows={2}
                        value={auditNotes}
                        onChange={(e) => setAuditNotes(e.target.value)}
                        className="w-full bg-transparent text-xs text-rose-200 focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Custom Pitch Generator */}
              <div>
                <label className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">
                  5. Generated Email
                </label>
                <textarea
                  rows={8}
                  value={pitchText}
                  onChange={(e) => setPitchText(e.target.value)}
                  placeholder="Enter customized sales pitch..."
                  className="w-full bg-white/[0.025] hover:bg-white/[0.04] ring-1 ring-white/[0.08] focus:ring-1 focus:ring-purple-400/40 rounded-xl p-4 text-xs text-slate-200 placeholder-slate-500 focus:outline-none leading-relaxed transition-all duration-200 font-serif"
                />
              </div>
            </div>
          )}

          {/* TAB 2: DOM & CONTACTS */}
          {activeTab === 'dom' && (
            <div className="space-y-6">
              {/* Direct Endpoints Card */}
              <div className="p-5 bg-white/[0.02] rounded-2xl ring-1 ring-white/[0.06] space-y-3">
                <h3 className="text-xs font-medium text-slate-400 tracking-normal">Direct Contact Endpoints</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-black/20 rounded-xl ring-1 ring-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs text-slate-300 font-mono truncate">{lead.email || 'No email found'}</span>
                    </div>
                    {lead.email && (
                      <button onClick={() => handleCopy(lead.email!, 'email')} className="text-slate-500 hover:text-white">
                        {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  <div className="p-3 bg-black/20 rounded-xl ring-1 ring-white/[0.06] flex items-center gap-2">
                    <Phone className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-slate-300 font-mono">{lead.phone || 'No phone'}</span>
                  </div>

                  {lead.whatsapp && (
                    <a href={lead.whatsapp} target="_blank" rel="noreferrer" className="p-3 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded-xl flex items-center gap-2 text-xs text-emerald-300 hover:bg-emerald-500/15 transition-colors">
                      <MessageSquare className="w-4 h-4" /> Open WhatsApp
                    </a>
                  )}

                  {lead.linkedin_url && (
                    <a href={lead.linkedin_url} target="_blank" rel="noreferrer" className="p-3 bg-sky-500/10 ring-1 ring-sky-500/20 rounded-xl flex items-center gap-2 text-xs text-sky-300 hover:bg-sky-500/15 transition-colors">
                      <Briefcase className="w-4 h-4" /> LinkedIn Profile
                    </a>
                  )}

                  {lead.instagram_url && (
                    <a href={lead.instagram_url} target="_blank" rel="noreferrer" className="p-3 bg-pink-500/10 ring-1 ring-pink-500/20 rounded-xl flex items-center gap-2 text-xs text-pink-300 hover:bg-pink-500/15 transition-colors">
                      <Camera className="w-4 h-4" /> Instagram Page
                    </a>
                  )}
                </div>
              </div>

              {/* Live Preview / Screenshot */}
              {lead.screenshot_url && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-slate-400 tracking-normal">Homepage Screenshot Preview</h3>
                  <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.08] bg-black max-h-64">
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
                  <h3 className="text-xs font-medium text-slate-400 tracking-normal">Scraped DOM Text Snippet</h3>
                  <button 
                    onClick={() => handleCopy(rawDomText, 'dom')} 
                    className="text-xs text-slate-500 hover:text-slate-200 flex items-center gap-1"
                  >
                    {copiedField === 'dom' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Copy Raw Text
                  </button>
                </div>
                <div className="p-4 bg-black/40 rounded-2xl ring-1 ring-white/[0.06] max-h-60 overflow-y-auto font-mono text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                  {rawDomText}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACTIVITY LOGS */}
          {activeTab === 'activity' && (
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-slate-400 tracking-normal">Dispatch & Audit Timeline</h3>
              <div className="space-y-3">
                
                {/* 1. Real Activity Logs (Includes Follow-ups) */}
                {realLogs.map((log: any) => (
                  <div key={log.id} className="p-4 bg-white/[0.02] rounded-2xl ring-1 ring-white/[0.06] flex items-start gap-3">
                    <div className={`p-2 rounded-xl mt-0.5 ring-1 ${log.event_type === 'EMAIL_SENT' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-slate-500/10 text-slate-400 ring-slate-500/20'}`}>
                      {log.event_type === 'EMAIL_SENT' ? <Send className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-100">
                        {log.event_type === 'EMAIL_SENT' 
                          ? `Email Dispatched (Step ${log.payload?.step || 0})` 
                          : log.event_type}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{new Date(log.created_at).toLocaleString()}</p>
                      
                      {log.payload?.subject && (
                        <p className="text-xs text-indigo-300 mt-2 font-medium">Subject: {log.payload.subject}</p>
                      )}
                      {log.payload?.content && (
                        <div className="mt-2 p-3 bg-black/40 rounded-xl text-[11px] text-slate-300 whitespace-pre-wrap ring-1 ring-white/5 font-serif leading-relaxed">
                          {log.payload.content}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* 2. Lead Discovered (Static Base Event) */}
                <div className="p-4 bg-white/[0.02] rounded-2xl ring-1 ring-white/[0.06] flex items-start gap-3 opacity-80">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-100">Lead Discovered & AI Audited</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{new Date(lead.created_at).toLocaleString()}</p>
                  </div>
                </div>

                {/* 3. Pending/Queued Status Note */}
                {(lead.scheduled_for || lead.status === 'QUEUED') ? (
                  <div className="p-4 bg-white/[0.02] rounded-2xl ring-1 ring-amber-500/20 flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 mt-0.5">
                      <Clock className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-300">Queued for AI Generation & Dispatch</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        AI will draft and send Step {lead.follow_up_step} at: <br/>
                        <span className="text-amber-200 font-semibold">{lead.scheduled_for ? new Date(lead.scheduled_for).toLocaleString() : 'Scheduled by Worker'}</span>
                      </p>
                    </div>
                  </div>
                ) : lead.status === 'NEW' ? (
                  <div className="p-4 bg-white/[0.01] rounded-2xl ring-1 ring-white/[0.04] flex items-start gap-3 opacity-60">
                    <div className="p-2 rounded-xl bg-white/[0.04] text-slate-500 mt-0.5">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400">Email Pending Queue Flush</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">Click "Flush Daily Queue" above to calculate & schedule dispatch</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* TAB 4: FOLLOW-UPS */}
          {activeTab === 'followups' && (
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-slate-400 tracking-normal">Autonomous Follow-up Sequence</h3>
              
              <div className="space-y-4">
                {[1, 2, 3].map((stepNumber) => {
                  const log = realLogs.find((l: any) => l.event_type === 'EMAIL_SENT' && l.payload?.step === stepNumber);
                  const isQueuedNow = lead.follow_up_step === stepNumber && lead.status === 'QUEUED';
                  const isWaitingNow = lead.follow_up_step === stepNumber - 1 && lead.status === 'SENT';
                  const isLocked = !log && !isQueuedNow && !isWaitingNow;

                  return (
                    <div key={stepNumber} className={`p-5 rounded-2xl ring-1 ${log ? 'bg-purple-500/5 ring-purple-500/20' : isQueuedNow || isWaitingNow ? 'bg-amber-500/5 ring-amber-500/20' : 'bg-white/[0.01] ring-white/[0.04] opacity-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className={`text-sm font-semibold flex items-center gap-2 ${log ? 'text-purple-300' : isQueuedNow || isWaitingNow ? 'text-amber-300' : 'text-slate-500'}`}>
                          Step {stepNumber}
                          {log && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                          {isQueuedNow && <Clock className="w-3.5 h-3.5 animate-pulse" />}
                        </h4>
                        <span className="text-[10px] text-slate-500">
                          {log ? new Date(log.created_at).toLocaleString() : isQueuedNow ? 'Queued' : isWaitingNow ? 'Waiting' : 'Locked'}
                        </span>
                      </div>

                      {log ? (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-300 font-medium bg-black/40 p-2 rounded-lg ring-1 ring-white/5">
                            Subject: {log.payload?.subject}
                          </p>
                          <div className="p-3 bg-black/40 rounded-xl text-xs text-slate-300 whitespace-pre-wrap ring-1 ring-white/5 font-serif leading-relaxed">
                            {log.payload?.content}
                          </div>
                        </div>
                      ) : isQueuedNow || isWaitingNow ? (
                        <div className="p-4 bg-black/20 rounded-xl ring-1 ring-white/5 flex flex-col items-center justify-center text-center gap-2">
                          <Sparkles className="w-5 h-5 text-amber-500/50" />
                          <p className="text-xs text-slate-400">
                            AI hasn't written this yet. <br/>
                            It will dynamically draft and send this step {lead.scheduled_for ? `at ${new Date(lead.scheduled_for).toLocaleString()}` : 'soon'}.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-black/20 rounded-xl ring-1 ring-white/5 flex items-center justify-center">
                          <p className="text-xs text-slate-600 flex items-center gap-2">
                            Requires Step {stepNumber - 1} to be completed
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action Bar Footer */}
        <div className="p-6 border-t border-white/[0.06] bg-white/[0.01] flex items-center justify-between gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 bg-white/[0.05] hover:bg-white/[0.09] ring-1 ring-white/[0.08] disabled:opacity-50 text-slate-200 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Lead Changes'}
          </button>

          {lead.email && (
            <button
              onClick={handleSendTest}
              disabled={isSending}
              className="py-3 px-5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-950/40"
            >
              <Send className="w-4 h-4" /> {isSending ? 'Sending...' : 'Send Test Email'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
