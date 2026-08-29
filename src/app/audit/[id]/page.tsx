'use client';

import React, { useEffect, useState, use } from 'react';
import Image from 'next/image';
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

  // Form State
  const [nameInput, setNameInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPassing, setShowPassing] = useState(false);

  // Favicon error fallback state
  const [faviconErr, setFaviconErr] = useState(false);

  useEffect(() => {
    async function fetchAudit() {
      try {
        setLoading(true);
        const res = await fetch(`/api/audit/${leadId}`);
        if (!res.ok) {
          throw new Error('Failed to load audit report');
        }
        const json: AuditApiResponse = await res.json();
        setData(json);
        if (json.lead?.company_name) {
          setNameInput('');
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

      if (res.ok) {
        setSubmitted(true);
      } else {
        alert('Could not submit form. Please try again.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred submitting your request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-medium text-lg">Loading personalized audit report...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mb-4 text-2xl font-bold">
          !
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">Report Not Found</h1>
        <p className="text-slate-400 max-w-md mb-6">{error || 'This audit report link is missing or invalid.'}</p>
        <a href="/" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-all">
          Return to Home
        </a>
      </div>
    );
  }

  const { lead, issues, solutions } = data;
  const criticalCount = issues.critical.length;
  const moderateCount = issues.moderate.length;
  const passingCount = issues.passing.length;

  // Build top issues summary string for Section 5
  const topIssueTitles = [...issues.critical, ...issues.moderate]
    .slice(0, 2)
    .map((i) => i.title)
    .join(' + ');

  const bookingContext = topIssueTitles
    ? `Booking a call about: ${topIssueTitles} on ${lead.domain}`
    : `Booking a tech review call for ${lead.domain}`;

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lead.domain)}&sz=128`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              M²
            </div>
            <span className="font-semibold text-slate-200 tracking-tight">MR² Labs Outreach</span>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-1.5 rounded-full font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Verified Audit Report
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-16">
        {/* SECTION 1 — HERO */}
        <section className="text-center space-y-6 pt-4">
          <div className="inline-flex items-center justify-center p-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
            {!faviconErr ? (
              <img
                src={faviconUrl}
                alt={`${lead.company_name} favicon`}
                className="w-12 h-12 object-contain rounded-lg"
                onError={() => setFaviconErr(true)}
              />
            ) : (
              <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-lg flex items-center justify-center font-bold text-xl">
                {lead.company_name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="space-y-3 max-w-2xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
              We audited <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">{lead.company_name}</span>
            </h1>
            <p className="text-lg text-slate-400 font-normal">
              Here&apos;s what we found — and exactly how we&apos;d fix it.
            </p>
          </div>
        </section>

        {/* SECTION 2 — ISSUES FOUND */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h2 className="text-2xl font-bold text-slate-100">Audit Breakdown</h2>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md">🔴 {criticalCount} Critical</span>
              <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">🟡 {moderateCount} Moderate</span>
              <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">🟢 {passingCount} Passing</span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Critical Issues */}
            {issues.critical.length > 0 && (
              <div className="bg-slate-900/80 border border-red-500/30 rounded-2xl p-6 space-y-4 shadow-lg shadow-red-950/20">
                <div className="flex items-center gap-2 font-bold text-red-400 text-sm uppercase tracking-wider">
                  <span>🔴</span> Critical Priority ({issues.critical.length})
                </div>
                <div className="grid gap-3">
                  {issues.critical.map((issue) => (
                    <div key={issue.id} className="flex items-start gap-3 p-3.5 bg-slate-950/60 rounded-xl border border-red-500/10">
                      <div className="w-2 h-2 rounded-full bg-red-500 mt-2 shrink-0"></div>
                      <div>
                        <h4 className="font-semibold text-slate-100">{issue.title}</h4>
                        <p className="text-sm text-slate-400 mt-0.5">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Moderate Issues */}
            {issues.moderate.length > 0 && (
              <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 space-y-4 shadow-lg shadow-amber-950/20">
                <div className="flex items-center gap-2 font-bold text-amber-400 text-sm uppercase tracking-wider">
                  <span>🟡</span> Moderate Improvement ({issues.moderate.length})
                </div>
                <div className="grid gap-3">
                  {issues.moderate.map((issue) => (
                    <div key={issue.id} className="flex items-start gap-3 p-3.5 bg-slate-950/60 rounded-xl border border-amber-500/10">
                      <div className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0"></div>
                      <div>
                        <h4 className="font-semibold text-slate-100">{issue.title}</h4>
                        <p className="text-sm text-slate-400 mt-0.5">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Passing Checks (Collapsed by default) */}
            {issues.passing.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 transition-all">
                <button
                  onClick={() => setShowPassing(!showPassing)}
                  className="w-full flex items-center justify-between text-slate-400 hover:text-slate-200 text-sm font-semibold py-1"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-emerald-400">🟢</span> Passing Checks ({issues.passing.length})
                  </span>
                  <span>{showPassing ? '▲ Collapse' : '▼ Expand'}</span>
                </button>

                {showPassing && (
                  <div className="mt-4 grid gap-2 border-t border-slate-800/80 pt-4">
                    {issues.passing.map((issue) => (
                      <div key={issue.id} className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl text-xs text-slate-300">
                        <span className="font-medium">{issue.title}</span>
                        <span className="text-emerald-400 font-semibold">Verified ✓</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* SECTION 3 — WHAT WE'D BUILD */}
        <section className="space-y-6">
          <div className="space-y-1 border-b border-slate-800 pb-4">
            <h2 className="text-2xl font-bold text-slate-100">What We&apos;d Build</h2>
            <p className="text-sm text-slate-400">Mapped solution roadmap tailored specifically for {lead.company_name}.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {solutions.map((card) => (
              <div key={card.id} className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 transition-all rounded-2xl p-6 flex flex-col justify-between space-y-4 group">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                      {card.tag}
                    </span>
                    <span className="text-xs font-medium text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md">
                      ⏱ {card.estimated_days}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4 — THE FORM */}
        <section className="bg-gradient-to-b from-slate-900 to-indigo-950/40 border border-indigo-500/20 rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Request a Custom Video Breakdown</h2>
            <p className="text-sm text-slate-400">
              Confirm your contact details and let us know what you want us to prioritize in your 48-hour video walkthrough.
            </p>
          </div>

          {submitted ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                ✓
              </div>
              <h3 className="text-xl font-bold text-emerald-300">Loom Video Request Received!</h3>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                Our team is analyzing {lead.domain}. You will receive a personalized video walkthrough at <strong className="text-white">{lead.email}</strong> within 48 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Work Email (Pre-filled)
                  </label>
                  <input
                    type="email"
                    value={lead.email}
                    disabled
                    className="w-full bg-slate-950/40 border border-slate-800/60 rounded-xl px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Company
                  </label>
                  <input
                    type="text"
                    value={lead.company_name}
                    disabled
                    className="w-full bg-slate-950/40 border border-slate-800/60 rounded-xl px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Website Domain
                  </label>
                  <input
                    type="text"
                    value={lead.domain}
                    disabled
                    className="w-full bg-slate-950/40 border border-slate-800/60 rounded-xl px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Anything we missed or want to prioritize?
                </label>
                <textarea
                  rows={3}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="e.g. Can we focus on mobile live chat and DMARC first? We are launching a marketing campaign next week..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 text-base disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>Submit → Loom video within 48hrs</>
                )}
              </button>
            </form>
          )}
        </section>

        {/* SECTION 5 — BOOK A CALL */}
        <section className="space-y-6">
          <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-center space-y-1">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Direct Calendar Booking</span>
            <p className="text-base font-semibold text-slate-100">
              {bookingContext}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden min-h-[480px] flex flex-col items-center justify-center relative">
            <iframe
              src={`https://cal.com/rashard?metadata[domain]=${encodeURIComponent(lead.domain)}&metadata[leadId]=${lead.id}`}
              className="w-full h-[520px] rounded-2xl border-0"
              title="Book a Discovery Call"
            ></iframe>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 py-8 text-center text-xs text-slate-500">
        MR² Labs Outreach Engine &copy; {new Date().getFullYear()} — Engineering High Performance Digital Systems
      </footer>
    </div>
  );
}
