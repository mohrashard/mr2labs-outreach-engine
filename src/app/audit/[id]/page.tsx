'use client';

import React, { useEffect, useState, use } from 'react';
import Image from 'next/image';
import {
  Zap,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Check,
  ArrowRight,
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
        alert('Could not submit request. Please try again.');
      }
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
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="relative mb-6">
          <Image
            src="/mr-squared-logo.png"
            alt="MR² Labs"
            width={160}
            height={40}
            priority
            className="h-10 w-auto object-contain animate-pulse"
          />
        </div>
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-medium text-sm">Preparing diagnostic audit report...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <Image
          src="/mr-squared-logo.png"
          alt="MR² Labs"
          width={140}
          height={36}
          className="h-8 w-auto object-contain mb-8"
        />
        <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">Audit Report Not Found</h1>
        <p className="text-slate-400 max-w-md mb-6">{error || 'This audit report link is missing or expired.'}</p>
        <a href="https://mr2labs.com" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold text-sm transition-all">
          Visit MR² Labs Homepage
        </a>
      </div>
    );
  }

  const { lead, issues, solutions } = data;
  const criticalCount = issues.critical.length;
  const moderateCount = issues.moderate.length;
  const passingCount = issues.passing.length;

  const topIssueTitles = [...issues.critical, ...issues.moderate]
    .slice(0, 2)
    .map((i) => i.title)
    .join(' + ');

  const bookingContext = topIssueTitles
    ? `Fixing: ${topIssueTitles} on ${lead.domain}`
    : `Strategy Call for ${lead.domain}`;

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lead.domain)}&sz=128`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Sticky Header with Permanent CTAs */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="https://mr2labs.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <Image
                src="/mr-squared-logo.png"
                alt="MR² Labs Logo"
                width={140}
                height={36}
                priority
                className="h-8 w-auto object-contain"
              />
            </a>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="#request-loom"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>Request 48h Video</span>
            </a>
            <a
              href="#booking"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all"
            >
              <Calendar className="w-3.5 h-3.5 text-white" />
              <span>Book Call</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-16">
        {/* SECTION 1 — HERO */}
        <section className="text-center space-y-6 pt-2">
          <div className="inline-flex items-center gap-3 p-2.5 px-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl">
            {!faviconErr ? (
              <img
                src={faviconUrl}
                alt={`${lead.company_name} favicon`}
                className="w-8 h-8 object-contain rounded-md"
                onError={() => setFaviconErr(true)}
              />
            ) : (
              <div className="w-8 h-8 bg-indigo-600/20 text-indigo-400 rounded-md flex items-center justify-center font-bold text-sm">
                {lead.company_name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-semibold text-slate-300">{lead.domain}</span>
          </div>

          <div className="space-y-4 max-w-3xl mx-auto">
            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
              We audited <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">{lead.company_name}</span>
            </h1>
            <p className="text-base sm:text-lg text-slate-400 font-normal max-w-2xl mx-auto">
              Here is what we discovered on your website, how it impacts your customer conversion, and the exact roadmap we would use to fix it.
            </p>
          </div>

          {/* Hero CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <a
              href="#request-loom"
              className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl shadow-xl shadow-indigo-600/20 transition-all text-sm flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 text-white" />
              <span>Request 48-Hour Video Walkthrough</span>
            </a>
            <a
              href="#booking"
              className="w-full sm:w-auto px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold rounded-xl transition-all text-sm flex items-center justify-center gap-2"
            >
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span>Book 15-Min Strategy Call</span>
            </a>
          </div>
        </section>

        {/* SECTION 2 — ISSUES FOUND */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Audit Breakdown</h2>
              <p className="text-xs text-slate-400 mt-0.5">Automated technical scan results for {lead.domain}</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md">
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                <span>{criticalCount} Critical</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>{moderateCount} Moderate</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{passingCount} Verified</span>
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Critical Issues */}
            {issues.critical.length > 0 && (
              <div className="bg-slate-900/90 border border-red-500/30 rounded-2xl p-5 sm:p-6 space-y-4 shadow-lg shadow-red-950/20">
                <div className="flex items-center gap-2 font-bold text-red-400 text-xs uppercase tracking-wider">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span>Critical Revenue & Security Risks ({issues.critical.length})</span>
                </div>
                <div className="grid gap-3">
                  {issues.critical.map((issue) => (
                    <div key={issue.id} className="flex items-start gap-3.5 p-4 bg-slate-950/80 rounded-xl border border-red-500/10">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 mt-1.5 shrink-0"></div>
                      <div className="space-y-1">
                        <h3 className="font-semibold text-slate-100 text-sm sm:text-base">{issue.title}</h3>
                        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Moderate Issues */}
            {issues.moderate.length > 0 && (
              <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-5 sm:p-6 space-y-4 shadow-lg shadow-amber-950/20">
                <div className="flex items-center gap-2 font-bold text-amber-400 text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Performance & Conversion Friction ({issues.moderate.length})</span>
                </div>
                <div className="grid gap-3">
                  {issues.moderate.map((issue) => (
                    <div key={issue.id} className="flex items-start gap-3.5 p-4 bg-slate-950/80 rounded-xl border border-amber-500/10">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 mt-1.5 shrink-0"></div>
                      <div className="space-y-1">
                        <h3 className="font-semibold text-slate-100 text-sm sm:text-base">{issue.title}</h3>
                        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Passing Checks */}
            {issues.passing.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 transition-all">
                <button
                  onClick={() => setShowPassing(!showPassing)}
                  className="w-full flex items-center justify-between text-slate-400 hover:text-slate-200 text-xs font-semibold py-1 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Passing & Verified Systems ({issues.passing.length})</span>
                  </span>
                  <span className="flex items-center gap-1">
                    {showPassing ? (
                      <>
                        <span>Hide</span>
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      </>
                    ) : (
                      <>
                        <span>View Verified Items</span>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </>
                    )}
                  </span>
                </button>

                {showPassing && (
                  <div className="mt-4 grid gap-2 border-t border-slate-800/80 pt-4">
                    {issues.passing.map((issue) => (
                      <div key={issue.id} className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl text-xs text-slate-300">
                        <span className="font-medium">{issue.title}</span>
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Verified</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mid-Page Scroll CTA Banner */}
            <div className="p-5 bg-gradient-to-r from-indigo-950/60 to-purple-950/40 border border-indigo-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-slate-100 text-sm sm:text-base">Want MR² Labs to resolve these findings for {lead.company_name}?</h4>
                <p className="text-xs text-slate-400 mt-0.5">Our engineering team fixes these bottlenecks within 3 days.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                <a
                  href="#request-loom"
                  className="flex-1 sm:flex-none text-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Request Video</span>
                </a>
                <a
                  href="#booking"
                  className="flex-1 sm:flex-none text-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Schedule Call</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 — WHAT WE'D BUILD */}
        <section className="space-y-6">
          <div className="space-y-1 border-b border-slate-800 pb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Engineering Solution Roadmap</h2>
            <p className="text-xs text-slate-400">Custom build proposals tailored specifically for {lead.company_name}.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {solutions.map((card) => (
              <div key={card.id} className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 transition-all rounded-2xl p-6 flex flex-col justify-between space-y-4 group">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                      {card.tag}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{card.estimated_days} turnaround</span>
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {card.description}
                  </p>
                </div>

                <button
                  onClick={() => handleSelectSolution(card.title)}
                  className="w-full py-2.5 bg-slate-950 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-800 hover:border-indigo-500 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer group"
                >
                  <span>Select Solution</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Roadmap Scroll CTA Banner */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <span className="text-xs text-slate-400">
              Have custom architecture requirements for {lead.domain}?
            </span>
            <a
              href="#booking"
              className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-bold transition-all shrink-0 inline-flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span>Book Strategy Call With Engineering Team</span>
            </a>
          </div>
        </section>

        {/* SECTION 4 — THE FORM */}
        <section id="request-loom" className="bg-gradient-to-b from-slate-900 to-indigo-950/40 border border-indigo-500/20 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>48-Hour Response Guarantee</span>
            </div>
            <h2 className="text-2xl font-bold text-white">Request Your Custom Video Breakdown</h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Confirm your contact details and let us know what you want us to prioritize in your 48-hour video walkthrough.
            </p>
          </div>

          {submitted ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-emerald-300">Video Request Received</h3>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                Our team is analyzing {lead.domain}. You will receive your personalized video breakdown at <strong className="text-white">{lead.email}</strong> within 48 hours.
              </p>
              <div className="pt-2">
                <a
                  href="#booking"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all"
                >
                  <span>Need immediate help? Book a live call</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
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
                    placeholder="Enter your full name"
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
                  Specific focus or priority request?
                </label>
                <textarea
                  rows={3}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="e.g. Please focus on mobile live chat integration and email security first..."
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
                  <>
                    <span>Submit Request</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </section>

        {/* SECTION 5 — BOOK A CALL */}
        <section id="booking" className="space-y-6">
          <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-center space-y-1">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Direct Strategy Call Booking</span>
            <p className="text-sm sm:text-base font-semibold text-slate-100">
              {bookingContext}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-2 shadow-2xl overflow-hidden min-h-[660px] flex flex-col items-center justify-center relative">
            <iframe
              src={`https://calendly.com/mohrashard/30min?embed_domain=outreach.mr2labs.com&embed_type=Inline&background_color=0f172a&text_color=f8fafc&primary_color=6366f1`}
              className="w-full h-[650px] rounded-2xl border-0"
              title="Book a Discovery Call"
            ></iframe>
          </div>
        </section>
      </main>

      {/* Footer with MR² Labs Branding */}
      <footer className="border-t border-slate-800/80 py-10 bg-slate-950 text-center text-xs text-slate-500 space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Image
            src="/mr-squared-logo.png"
            alt="MR² Labs"
            width={120}
            height={30}
            className="h-6 w-auto object-contain opacity-80"
          />
        </div>
        <p>MR² Labs Outreach Engine &copy; {new Date().getFullYear()} — High Performance Systems Engineering</p>
      </footer>
    </div>
  );
}
