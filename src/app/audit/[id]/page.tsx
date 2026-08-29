'use client';

import React, { useEffect, useState, use } from 'react';
import Image from 'next/image';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Video,
  Shield,
  Activity,
  Terminal
} from 'lucide-react';
import { AuditIssue, SolutionCard, AuditData } from '@/types/audit';

interface LeadInfo {
  id: string;
  company_name: string;
  website_url: string;
  domain: string;
  email: string;
}

interface AuditApiResponse {
  success: boolean;
  lead: LeadInfo;
  audit_data: AuditData;
  issues: {
    critical: AuditIssue[];
    moderate: AuditIssue[];
    passing: AuditIssue[];
  };
  solutions: SolutionCard[];
  error?: string;
}

export default function AuditLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const leadId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AuditApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [selectedSolutions, setSelectedSolutions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [faviconErr, setFaviconErr] = useState(false);

  useEffect(() => {
    async function fetchAudit() {
      try {
        setLoading(true);
        const res = await fetch(`/api/audit/${leadId}?format=json`);
        if (!res.ok) throw new Error('Failed to load audit report');
        const json: AuditApiResponse = await res.json();
        setData(json);

        if (json.lead?.email) {
          setEmailInput(json.lead.email);
          const prefix = json.lead.email.split('@')[0];
          if (!['info', 'contact', 'hello', 'support', 'sales', 'admin', 'team'].includes(prefix.toLowerCase())) {
            setNameInput(prefix.charAt(0).toUpperCase() + prefix.slice(1));
          }
        }
      } catch (err: any) {
        setError(err.message || 'Audit report not found or expired.');
      } finally {
        setLoading(false);
      }
    }
    fetchAudit();
  }, [leadId]);

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.lead) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/audit/${leadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: data.lead.company_name,
          domain: data.lead.domain,
          email: emailInput || data.lead.email,
          contact_name: nameInput,
          priority_notes: selectedSolutions.length > 0
            ? `Priorities: ${selectedSolutions.join(', ')}\n\nNotes: ${notesInput}`
            : notesInput,
        }),
      });
      if (res.ok) setSubmitted(true);
      else alert('Could not submit request. Please try again.');
    } catch (err) {
      console.error(err);
      alert('An error occurred submitting your request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectSolution = (solutionTitle: string) => {
    setSelectedSolutions(prev => 
      prev.includes(solutionTitle)
        ? prev.filter(t => t !== solutionTitle)
        : [...prev, solutionTitle]
    );
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#030407] text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-6" />
        <p className="text-sm font-mono text-zinc-500 tracking-wider uppercase">Loading state</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] bg-[#030407] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <h1 className="text-2xl font-semibold mb-3 tracking-tight">Audit Not Found</h1>
        <p className="text-zinc-400 mb-8 max-w-sm mx-auto">{error || 'This report is missing or has expired.'}</p>
        <a href="https://mr2labs.com" className="px-6 py-3 bg-white text-black text-sm font-medium rounded-xl hover:bg-zinc-200 transition-colors">
          Return Home
        </a>
      </div>
    );
  }

  const { lead, issues, solutions } = data;
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lead.domain)}&sz=128`;
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const totalIssues = issues.critical.length + issues.moderate.length;
  const healthScore = Math.max(0, 100 - (issues.critical.length * 15) - (issues.moderate.length * 5));

  return (
    <div className="min-h-[100dvh] bg-[#030407] text-zinc-100 font-sans selection:bg-emerald-500/30 overflow-x-hidden relative">
      
      {/* Ambient Background Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-900/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/10 blur-[120px]" />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-white/[0.02] blur-[100px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.04] bg-[#030407]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/mr-squared-logo.png" alt="Mr² Labs" width={140} height={36} className="h-7 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex items-center gap-4">
            <a href="#booking" className="hidden md:block text-xs font-medium text-zinc-400 hover:text-white transition-colors">
              Book Call
            </a>
            <a href="#request-loom" className="h-8 px-4 inline-flex items-center justify-center text-xs font-medium bg-white text-black rounded-full hover:bg-zinc-200 transition-colors">
              Get Audit
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-24 px-6">
        <div className="max-w-7xl mx-auto space-y-32">
          
          {/* Hero Section */}
          <section className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center min-h-[60vh]">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm">
                {!faviconErr ? (
                  <img src={faviconUrl} alt={lead.company_name} className="w-4 h-4 rounded-sm" onError={() => setFaviconErr(true)} />
                ) : (
                  <div className="w-4 h-4 rounded-sm bg-white/10" />
                )}
                <span className="text-xs font-medium text-zinc-300">{lead.domain}</span>
                <div className="w-px h-3 bg-white/20" />
                <span className="text-xs font-mono text-emerald-400">Audited {today}</span>
              </div>
              
              <div className="space-y-6">
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight leading-[1.05] text-white">
                  Audit for <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">
                    {lead.company_name}
                  </span>
                </h1>
                <p className="text-lg text-zinc-400 max-w-xl leading-relaxed">
                  We ran a technical audit on your domain. Here is a clear view of performance gaps, structural risks, and our exact plan to resolve them.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <a href="#issues" className="h-12 px-6 inline-flex items-center justify-center gap-2 text-sm font-medium bg-white text-black rounded-xl hover:bg-zinc-200 transition-colors">
                  View Audit
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a href="#booking" className="h-12 px-6 inline-flex items-center justify-center gap-2 text-sm font-medium border border-white/10 bg-white/[0.02] rounded-xl hover:bg-white/[0.05] transition-colors">
                  <Calendar className="w-4 h-4 text-zinc-400" />
                  Book Call
                </a>
              </div>
            </div>

            {/* Hero Visual / Data Node Simulation */}
            <div className="relative h-[400px] md:h-[500px] rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.1)_0%,transparent_70%)]" />
              
              <div className="relative z-10 text-center space-y-2">
                <div className="text-[8rem] font-medium tracking-tighter leading-none text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-600">
                  {healthScore}
                </div>
                <p className="text-sm font-mono text-zinc-500 uppercase tracking-widest">Platform Health Score</p>
              </div>

              {/* Decorative data nodes */}
              <div className="absolute top-12 left-12 p-3 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md hidden sm:block">
                <div className="text-xs font-mono text-zinc-400 mb-1">Total Issues</div>
                <div className="text-xl font-medium text-white">{totalIssues}</div>
              </div>
              <div className="absolute bottom-12 right-12 p-3 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md hidden sm:block">
                <div className="text-xs font-mono text-zinc-400 mb-1">Critical Risks</div>
                <div className="text-xl font-medium text-red-400">{issues.critical.length}</div>
              </div>
              <div className="absolute bottom-12 left-12 w-32 h-px bg-gradient-to-r from-emerald-500/50 to-transparent" />
              <div className="absolute top-12 right-12 w-32 h-px bg-gradient-to-l from-indigo-500/50 to-transparent" />
              <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
              <div className="absolute bottom-1/3 right-1/4 w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.8)]" />
            </div>
          </section>

          {/* Issues Bento Grid */}
          <section id="issues" className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-3xl font-medium tracking-tight">Audit Results</h2>
                <p className="text-zinc-400 text-sm">Prioritized risks impacting performance and conversion.</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-zinc-300">{issues.critical.length} Critical</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-zinc-300">{issues.moderate.length} Moderate</span>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {issues.critical.map((issue, idx) => (
                <div key={`crit-${idx}`} className="group relative p-6 rounded-2xl border border-red-500/20 bg-red-500/[0.02] hover:bg-red-500/[0.04] transition-colors overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <AlertCircle className="w-5 h-5 text-red-500/50" />
                  </div>
                  <div className="space-y-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 text-[10px] font-mono text-red-400 uppercase tracking-wider">
                      Priority 1
                    </span>
                    <div>
                      <h3 className="text-base font-medium text-zinc-100 mb-2 leading-snug">{issue.title}</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed">{issue.description}</p>
                    </div>
                  </div>
                </div>
              ))}
              
              {issues.moderate.map((issue, idx) => (
                <div key={`mod-${idx}`} className="group relative p-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.02] hover:bg-amber-500/[0.04] transition-colors overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <AlertTriangle className="w-5 h-5 text-amber-500/50" />
                  </div>
                  <div className="space-y-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 text-[10px] font-mono text-amber-400 uppercase tracking-wider">
                      Priority 2
                    </span>
                    <div>
                      <h3 className="text-base font-medium text-zinc-100 mb-2 leading-snug">{issue.title}</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed">{issue.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Solutions / Roadmap */}
          <section className="space-y-8">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-3xl font-medium tracking-tight">How we'll fix it</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Our recommended plan to resolve these gaps. We do not just audit; we build the solutions.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {solutions.map((card, idx) => {
                const isSelected = selectedSolutions.includes(card.title);
                return (
                <div key={`sol-${idx}`} className={`group relative p-8 rounded-3xl border transition-all duration-300 overflow-hidden flex flex-col justify-between gap-8 ${isSelected ? 'border-emerald-500/50 bg-emerald-500/[0.02]' : 'border-white/10 bg-white/[0.02] hover:border-emerald-500/30'}`}>
                  <div className={`absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent transition-opacity duration-500 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                  
                  <div className="relative z-10 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-md border border-white/10 bg-black/50 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                        {card.tag}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
                        <Clock className="w-3.5 h-3.5" />
                        {card.estimated_days}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-medium text-white mb-3">{card.title}</h3>
                      <div className="text-sm text-zinc-400 leading-relaxed space-y-2">
                        {card.description.split('\n').map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectSolution(card.title)}
                    className={`relative z-10 w-full h-12 flex items-center justify-center gap-2 text-sm font-medium rounded-xl border transition-colors ${isSelected ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20' : 'border-white/10 bg-black text-white hover:bg-white hover:text-black'}`}
                  >
                    {isSelected ? 'Selected for priority' : 'Select for priority'}
                    {isSelected ? <CheckCircle2 className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              )})}
            </div>
          </section>

          {/* Action Area: Loom / Booking Split */}
          <section className="grid lg:grid-cols-2 gap-4">
            
            {/* Loom Form */}
            <div id="request-loom" className="p-8 rounded-3xl border border-white/10 bg-white/[0.02] relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none" />
              
              <div className="relative z-10 space-y-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-indigo-400 mb-2">
                    <Video className="w-4 h-4" />
                    <span className="text-[10px] font-mono uppercase tracking-wider">Video Walkthrough</span>
                  </div>
                  <h3 className="text-2xl font-medium text-white">Get your video audit</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    We will record a custom video auditing {lead.domain} in depth, delivered to your inbox within 48 hours.
                  </p>
                </div>

                {submitted ? (
                  <div className="p-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-center space-y-3 mt-8">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                    <div className="text-emerald-400 font-medium">Request Confirmed</div>
                    <p className="text-sm text-zinc-400">Your video will be sent to {lead.email}</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitForm} className="space-y-4 mt-8">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide">Name</label>
                        <input
                          type="text"
                          required
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          className="w-full h-11 px-4 bg-black border border-white/10 rounded-xl text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors"
                          placeholder="Your name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide">Email</label>
                        <input
                          type="email"
                          required
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          className="w-full h-11 px-4 bg-black border border-white/10 rounded-xl text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between pb-1">
                        <label className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide">Priority Notes (Optional)</label>
                        {selectedSolutions.length > 0 && (
                          <span className="text-[10px] font-mono text-emerald-400 uppercase">{selectedSolutions.length} selected</span>
                        )}
                      </div>
                      
                      {selectedSolutions.length > 0 && (
                        <div className="flex flex-wrap gap-2 pb-2">
                          {selectedSolutions.map(sol => (
                            <div key={sol} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              {sol}
                            </div>
                          ))}
                        </div>
                      )}

                      <textarea
                        rows={2}
                        value={notesInput}
                        onChange={(e) => setNotesInput(e.target.value)}
                        className="w-full p-4 bg-black border border-white/10 rounded-xl text-sm text-white focus:border-indigo-500 focus:outline-none transition-colors resize-none"
                        placeholder={selectedSolutions.length > 0 ? "Any additional context..." : "What should we focus on?"}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full h-12 inline-flex items-center justify-center gap-2 bg-white text-black text-sm font-medium rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 mt-2"
                    >
                      {submitting ? 'Sending request...' : 'Send Video Audit'}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Booking Embed */}
            <div id="booking" className="p-8 rounded-3xl border border-white/10 bg-white/[0.02] relative overflow-hidden flex flex-col">
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />
              
              <div className="relative z-10 flex-1 flex flex-col space-y-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-emerald-400 mb-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-[10px] font-mono uppercase tracking-wider">Strategy Call</span>
                  </div>
                  <h3 className="text-2xl font-medium text-white">Book a strategy call</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Skip the video and schedule a working session to review the plan.
                  </p>
                </div>

                <div className="flex-1 rounded-2xl border border-white/10 bg-black overflow-hidden relative min-h-[500px]">
                  <iframe
                    src={`${process.env.NEXT_PUBLIC_PORTFOLIO_URL || 'http://localhost:3000'}/book/${leadId}?embed=true${nameInput ? `&name=${encodeURIComponent(nameInput)}` : ''}${emailInput ? `&email=${encodeURIComponent(emailInput)}` : ''}${selectedSolutions.length > 0 ? `&notes=${encodeURIComponent(selectedSolutions.join(', '))}` : ''}`}
                    className="absolute inset-0 w-full h-full border-none"
                    title="Book a Discovery Call"
                  />
                </div>
              </div>
            </div>

          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] bg-[#030407] py-8 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
            <Image src="/mr-squared-logo.png" alt="Mr² Labs" width={100} height={26} className="h-5 w-auto object-contain" />
          </div>
          <p className="text-[11px] font-mono text-zinc-600 uppercase tracking-widest">
            Diagnostic Framework © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}