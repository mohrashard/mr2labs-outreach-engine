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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPassing, setShowPassing] = useState(false);
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
          email: data.lead.email,
          contact_name: nameInput,
          priority_notes: notesInput,
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
    setNotesInput(`Please prioritize building: ${solutionTitle}`);
    const el = document.getElementById('request-loom');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen text-slate-100 flex flex-col items-center justify-center p-6" style={{ background: '#05070D' }}>
        <Image src="/mr-squared-logo.png" alt="MR² Labs" width={160} height={40} priority className="h-10 w-auto object-contain mb-8 opacity-80" />
        <div className="w-8 h-8 border border-indigo-500 border-t-transparent rounded-full animate-spin mb-5"></div>
        <p className="text-sm" style={{ color: '#8B95A8' }}>Preparing your audit report…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen text-slate-100 flex flex-col items-center justify-center p-6 text-center" style={{ background: '#05070D' }}>
        <Image src="/mr-squared-logo.png" alt="MR² Labs" width={140} height={36} className="h-8 w-auto object-contain mb-8 opacity-70" />
        <div className="w-12 h-12 flex items-center justify-center rounded-xl mb-5" style={{ background: '#1A0A0A', border: '1px solid #3B0000' }}>
          <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        <h1 className="text-xl font-semibold mb-2" style={{ color: '#F0F4FF' }}>Audit Report Not Found</h1>
        <p className="text-sm mb-6 max-w-sm" style={{ color: '#8B95A8' }}>{error || 'This link is missing or has expired.'}</p>
        <a href="https://mr2labs.com" className="px-5 py-2.5 text-sm font-medium rounded-lg transition-opacity hover:opacity-80" style={{ background: '#6366F1', color: '#fff' }}>
          Visit MR² Labs
        </a>
      </div>
    );
  }

  const { lead, issues, solutions } = data;
  const criticalCount = issues.critical.length;
  const moderateCount = issues.moderate.length;
  const passingCount = issues.passing.length;

  const topIssueTitles = [...issues.critical, ...issues.moderate]
    .slice(0, 2).map((i) => i.title).join(' + ');

  const bookingContext = topIssueTitles
    ? `Fixing: ${topIssueTitles} on ${lead.domain}`
    : `Strategy Call for ${lead.domain}`;

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lead.domain)}&sz=128`;

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <>
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .company-gradient {
          background: linear-gradient(135deg, #A855F7, #EC4899, #6366F1, #A855F7);
          background-size: 300% 300%;
          animation: gradientShift 5s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 600px;
          height: 300px;
          background: radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%);
          pointer-events: none;
        }
        .solution-card:hover {
          border-color: #2A3654 !important;
          background: #111827 !important;
        }
        .solution-card:hover .select-btn {
          border-color: #4B5A7A !important;
          color: #F0F4FF !important;
        }
        input:focus, textarea:focus {
          border-color: #2A3654 !important;
          outline: none;
        }
      `}</style>

      <div className="min-h-screen font-sans" style={{ background: '#05070D', color: '#F0F4FF' }}>

        {/* ── STICKY HEADER ── */}
        <header style={{ borderBottom: '1px solid #1C2537', background: 'rgba(5,7,13,0.85)', backdropFilter: 'blur(20px)' }} className="sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
            <a href="https://mr2labs.com" target="_blank" rel="noopener noreferrer" className="opacity-90 hover:opacity-100 transition-opacity">
              <Image src="/mr-squared-logo.png" alt="MR² Labs" width={180} height={48} priority className="h-9 w-auto object-contain" />
            </a>
            <div className="flex items-center gap-2">
              <a
                href="#request-loom"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ color: '#8B95A8', border: '1px solid #1C2537', background: 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#F0F4FF'; (e.currentTarget as HTMLElement).style.borderColor = '#2A3654'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#8B95A8'; (e.currentTarget as HTMLElement).style.borderColor = '#1C2537'; }}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Request 48h Video</span>
              </a>
              <a
                href="#booking"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-opacity hover:opacity-90"
                style={{ background: '#F0F4FF', color: '#05070D' }}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Book Call</span>
              </a>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-5 sm:px-8">

          {/* ── HERO ── */}
          <section className="relative text-center py-20 space-y-8">
            <div className="hero-glow" />

            {/* Domain pill */}
            <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg mx-auto" style={{ border: '1px solid #1C2537', background: '#0C1120' }}>
              {!faviconErr ? (
                <img src={faviconUrl} alt={`${lead.company_name}`} className="w-5 h-5 object-contain rounded-sm" onError={() => setFaviconErr(true)} />
              ) : (
                <div className="w-5 h-5 rounded-sm flex items-center justify-center text-xs font-bold" style={{ background: '#1C2537', color: '#8B95A8' }}>
                  {lead.company_name.charAt(0)}
                </div>
              )}
              <span className="text-xs font-medium" style={{ color: '#8B95A8' }}>{lead.domain}</span>
            </div>

            {/* Main headline */}
            <div className="space-y-4 relative">
              <p className="text-sm font-medium tracking-widest uppercase" style={{ color: '#4B5568' }}>
                Audit Report
              </p>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                We audited{' '}
                <span className="company-gradient">{lead.company_name}</span>
              </h1>
              <p className="text-base max-w-xl mx-auto leading-relaxed" style={{ color: '#8B95A8' }}>
                We spent time going through {lead.domain} — here's what stood out,
                what it's costing you, and exactly what we'd build to fix it.
              </p>
            </div>

            {/* Human credibility badge */}
            <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl mx-auto" style={{ border: '1px solid #1C2537', background: '#0C1120' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'linear-gradient(135deg, #6366F1, #A855F7)', color: '#fff' }}>
                R
              </div>
              <div className="text-left">
                <p className="text-xs font-medium" style={{ color: '#F0F4FF' }}>Reviewed by Rashard</p>
                <p className="text-xs" style={{ color: '#4B5568' }}>{today} · MR² Labs</p>
              </div>
              <div className="flex items-center gap-1 pl-2" style={{ borderLeft: '1px solid #1C2537' }}>
                <Shield className="w-3 h-3" style={{ color: '#10B981' }} />
                <span className="text-xs font-medium" style={{ color: '#10B981' }}>Verified</span>
              </div>
            </div>
          </section>

          {/* ── AUDIT BREAKDOWN ── */}
          <section className="space-y-5 pb-20">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5" style={{ borderBottom: '1px solid #1C2537' }}>
              <h2 className="text-lg font-semibold" style={{ color: '#F0F4FF' }}>Audit Breakdown</h2>
              <div className="flex items-center gap-3 text-xs font-medium">
                <span className="inline-flex items-center gap-1.5" style={{ color: '#EF4444' }}>
                  <AlertCircle className="w-3.5 h-3.5" />
                  {criticalCount} Critical
                </span>
                <span style={{ color: '#1C2537' }}>·</span>
                <span className="inline-flex items-center gap-1.5" style={{ color: '#F59E0B' }}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {moderateCount} Moderate
                </span>
                <span style={{ color: '#1C2537' }}>·</span>
                <span className="inline-flex items-center gap-1.5" style={{ color: '#10B981' }}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {passingCount} Passing
                </span>
              </div>
            </div>

            {/* Critical */}
            {issues.critical.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #3B1A1A', background: '#0E0808' }}>
                <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #3B1A1A', background: '#120A0A' }}>
                  <AlertCircle className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#EF4444' }}>
                    Critical — Revenue & Security Risks ({issues.critical.length})
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: '#1C0E0E' }}>
                  {issues.critical.map((issue) => (
                    <div key={issue.id} className="flex items-start gap-4 px-6 py-5" style={{ borderLeft: '3px solid #EF4444' }}>
                      <div className="space-y-1 min-w-0">
                        <h3 className="text-sm font-semibold" style={{ color: '#F0F4FF' }}>{issue.title}</h3>
                        <p className="text-sm leading-relaxed" style={{ color: '#8B95A8' }}>{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Moderate */}
            {issues.moderate.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #3B2A00', background: '#0E0C05' }}>
                <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #3B2A00', background: '#120F06' }}>
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#F59E0B' }}>
                    Moderate — Performance & Conversion ({issues.moderate.length})
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: '#1C1600' }}>
                  {issues.moderate.map((issue) => (
                    <div key={issue.id} className="flex items-start gap-4 px-6 py-5" style={{ borderLeft: '3px solid #F59E0B' }}>
                      <div className="space-y-1 min-w-0">
                        <h3 className="text-sm font-semibold" style={{ color: '#F0F4FF' }}>{issue.title}</h3>
                        <p className="text-sm leading-relaxed" style={{ color: '#8B95A8' }}>{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Passing — collapsible */}
            {issues.passing.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1C2537' }}>
                <button
                  onClick={() => setShowPassing(!showPassing)}
                  className="w-full px-6 py-4 flex items-center justify-between transition-colors"
                  style={{ background: showPassing ? '#0C1120' : 'transparent' }}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#10B981' }}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Passing Checks ({issues.passing.length})
                  </span>
                  <span className="text-xs" style={{ color: '#4B5568' }}>{showPassing ? 'Collapse' : 'Expand'}</span>
                </button>
                {showPassing && (
                  <div className="divide-y" style={{ borderColor: '#1C2537', borderTop: '1px solid #1C2537' }}>
                    {issues.passing.map((issue) => (
                      <div key={issue.id} className="flex items-start gap-4 px-6 py-4 opacity-60" style={{ borderLeft: '3px solid #10B981' }}>
                        <div className="space-y-1 min-w-0">
                          <h3 className="text-sm font-medium" style={{ color: '#8B95A8' }}>{issue.title}</h3>
                          <p className="text-xs leading-relaxed" style={{ color: '#4B5568' }}>{issue.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── WHAT WE'D BUILD ── */}
          <section className="pb-20 space-y-8">
            <div className="space-y-2 pb-2">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4B5568' }}>Execution Roadmap</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: '#F0F4FF' }}>
                What We'd Build for {lead.company_name}
              </h2>
              <p className="text-sm leading-relaxed max-w-xl" style={{ color: '#8B95A8' }}>
                Mapped specifically to the issues above. If we started today, this is the exact sequence.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {solutions.map((card) => (
                <div
                  key={card.id}
                  className="solution-card rounded-xl p-6 flex flex-col justify-between gap-6 transition-all duration-200 cursor-default"
                  style={{ border: '1px solid #1C2537', background: '#0C1120' }}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded"
                        style={{ background: '#1C2537', color: '#8B95A8', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                      >
                        {card.tag}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: '#4B5568' }}>
                        <Clock className="w-3 h-3" />
                        {card.estimated_days}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold leading-snug" style={{ color: '#F0F4FF' }}>{card.title}</h3>
                    <div className="text-sm leading-relaxed space-y-1.5" style={{ color: '#8B95A8' }}>
                      {card.description.split('\n').map((line, idx) => (
                        <p key={idx}>{line}</p>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleSelectSolution(card.title)}
                    className="select-btn w-full py-2.5 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all duration-200"
                    style={{ border: '1px solid #1C2537', color: '#8B95A8', background: 'transparent' }}
                  >
                    <span>Prioritize This</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ── LOOM REQUEST FORM ── */}
          <section id="request-loom" className="pb-20">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid #1C2537' }}
            >
              {/* Top accent bar */}
              <div style={{ height: '3px', background: 'linear-gradient(90deg, #6366F1, #A855F7, #EC4899)' }} />

              <div className="p-8 space-y-7" style={{ background: '#0C1120' }}>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366F1' }}>48-Hour Turnaround</p>
                  <h2 className="text-xl font-bold" style={{ color: '#F0F4FF' }}>
                    Want us to walk through this on video?
                  </h2>
                  <p className="text-sm leading-relaxed" style={{ color: '#8B95A8' }}>
                    We'll record a personal Loom for {lead.domain} — not a template, not an assistant.
                    Just Rashard walking through exactly what to fix and how. Lands in your inbox within 48 hours.
                  </p>
                </div>

                {submitted ? (
                  <div className="rounded-xl p-6 text-center space-y-2" style={{ border: '1px solid #064E3B', background: '#022C22' }}>
                    <CheckCircle2 className="w-8 h-8 mx-auto" style={{ color: '#10B981' }} />
                    <h3 className="text-base font-semibold" style={{ color: '#10B981' }}>Request received</h3>
                    <p className="text-sm" style={{ color: '#8B95A8' }}>
                      Your video breakdown for {lead.domain} will be at {lead.email} within 48 hours.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitForm} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      {/* Name — only editable field */}
                      <div className="space-y-2">
                        <label htmlFor="name" className="block text-xs font-medium" style={{ color: '#8B95A8' }}>
                          Your Name
                        </label>
                        <input
                          id="name"
                          type="text"
                          required
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          className="w-full px-4 py-3 text-sm rounded-lg transition-colors"
                          style={{
                            background: '#080C14',
                            border: '1px solid #1C2537',
                            color: '#F0F4FF',
                          }}
                          placeholder="Your name"
                        />
                      </div>

                      {/* Email — pre-filled, locked */}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium" style={{ color: '#8B95A8' }}>
                          Work Email
                        </label>
                        <input
                          type="email"
                          value={lead.email}
                          disabled
                          className="w-full px-4 py-3 text-sm rounded-lg cursor-not-allowed"
                          style={{ background: '#060A10', border: '1px solid #1C2537', color: '#4B5568' }}
                        />
                      </div>

                      {/* Company — locked */}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium" style={{ color: '#8B95A8' }}>Company</label>
                        <input
                          type="text"
                          value={lead.company_name}
                          disabled
                          className="w-full px-4 py-3 text-sm rounded-lg cursor-not-allowed"
                          style={{ background: '#060A10', border: '1px solid #1C2537', color: '#4B5568' }}
                        />
                      </div>

                      {/* Domain — locked */}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium" style={{ color: '#8B95A8' }}>Website</label>
                        <input
                          type="text"
                          value={lead.domain}
                          disabled
                          className="w-full px-4 py-3 text-sm rounded-lg cursor-not-allowed"
                          style={{ background: '#060A10', border: '1px solid #1C2537', color: '#4B5568' }}
                        />
                      </div>
                    </div>

                    {/* Priority notes */}
                    <div className="space-y-2">
                      <label htmlFor="focus" className="block text-xs font-medium" style={{ color: '#8B95A8' }}>
                        What should we focus on? <span style={{ color: '#4B5568' }}>(optional)</span>
                      </label>
                      <textarea
                        id="focus"
                        rows={3}
                        value={notesInput}
                        onChange={(e) => setNotesInput(e.target.value)}
                        className="w-full px-4 py-3 text-sm rounded-lg resize-none transition-colors"
                        style={{
                          background: '#080C14',
                          border: '1px solid #1C2537',
                          color: '#F0F4FF',
                        }}
                        placeholder={`e.g. Focus on the live chat gap — we're launching a campaign next week`}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3.5 text-sm font-semibold rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: '#F0F4FF', color: '#05070D' }}
                    >
                      {submitting ? 'Sending request…' : 'Send me the video breakdown →'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </section>

          {/* ── CALENDAR ── */}
          <section id="booking" className="pb-20 space-y-5">
            {/* Context banner */}
            <div className="rounded-xl px-5 py-4 text-center" style={{ border: '1px solid #1C2537', background: '#0C1120' }}>
              <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#6366F1' }}>
                Direct Strategy Call Booking
              </p>
              <p className="text-sm font-medium" style={{ color: '#F0F4FF' }}>{bookingContext}</p>
            </div>

            {/* Calendly embed — kept as-is per request */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1C2537' }}>
              <iframe
                src={`https://calendly.com/mohrashard/30min?embed_domain=outreach.mr2labs.com&embed_type=Inline&background_color=0f172a&text_color=f8fafc&primary_color=6366f1&hide_event_type_details=1&hide_gdpr_banner=1`}
                className="w-full"
                style={{ height: '650px', display: 'block' }}
                title="Book a Discovery Call"
              />
            </div>
          </section>

        </main>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: '1px solid #1C2537', background: '#05070D' }} className="py-8">
          <div className="max-w-4xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Image src="/mr-squared-logo.png" alt="MR² Labs" width={100} height={26} className="h-6 w-auto object-contain" style={{ opacity: 0.4, filter: 'grayscale(1)' }} />
            <p className="text-xs" style={{ color: '#4B5568' }}>
              Outreach Engine © {new Date().getFullYear()} · MR² Labs · High Performance Systems
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}