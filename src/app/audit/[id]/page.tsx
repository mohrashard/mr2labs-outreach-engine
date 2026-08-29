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
  Video,
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
        const res = await fetch(`/api/audit/${leadId}?format=json`);
        if (!res.ok) {
          throw new Error('Failed to load audit report');
        }
        const json: AuditApiResponse = await res.json();
        setData(json);

        // Pre-fill name if missing and we can extract from email
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
                width={180}
                height={48}
                priority
                className="h-10 w-auto object-contain"
              />
            </a>
          </div>

          <div className="flex items-center gap-3">
            <a href="#request-loom" className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-slate-900 text-slate-300 text-sm font-medium rounded-md transition-colors border border-slate-800">
              <Video className="w-4 h-4" />
              <span>Request 48h Video</span>
            </a>
            <a href="#booking" className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-200 text-slate-950 text-sm font-medium rounded-md transition-colors">
              <Calendar className="w-3.5 h-3.5" />
              <span>Book Call</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-16">
        <section className="text-center space-y-6 pt-12 pb-8">
          <div className="inline-flex items-center gap-3 p-2 px-3 border border-slate-800 rounded-sm">
            {!faviconErr ? (
              <img
                src={faviconUrl}
                alt={`${lead.company_name} favicon`}
                className="w-8 h-8 object-contain"
                onError={() => setFaviconErr(true)}
              />
            ) : (
              <div className="w-8 h-8 bg-slate-800 text-slate-400 rounded-sm flex items-center justify-center font-bold text-sm">
                {lead.company_name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium text-slate-300">{lead.domain}</span>
          </div>

          <div className="space-y-6 max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-semibold text-slate-50 tracking-tight">
              We audited {lead.company_name}
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Here is what we discovered on your website, how it impacts your customer conversion, and the exact roadmap we would use to fix it.
            </p>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Audit Breakdown</h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>{criticalCount} Critical</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span>{moderateCount} Moderate</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>{passingCount} Verified</span>
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {issues.critical.length > 0 && (
              <div className="border border-slate-800 p-6 space-y-5">
                <div className="flex items-center gap-2 font-medium text-red-400 text-xs uppercase tracking-widest">
                  <AlertCircle className="w-4 h-4" />
                  <span>Critical Revenue & Security Risks ({issues.critical.length})</span>
                </div>
                <div className="grid gap-4">
                  {issues.critical.map((issue) => (
                    <div key={issue.id} className="flex items-start gap-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2"></div>
                      <div className="space-y-1">
                        <h3 className="font-medium text-slate-100">{issue.title}</h3>
                        <p className="text-sm text-slate-400">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {issues.moderate.length > 0 && (
              <div className="border border-slate-800 p-6 space-y-5">
                <div className="flex items-center gap-2 font-medium text-amber-400 text-xs uppercase tracking-widest">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Performance & Conversion Friction ({issues.moderate.length})</span>
                </div>
                <div className="grid gap-4">
                  {issues.moderate.map((issue) => (
                    <div key={issue.id} className="flex items-start gap-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2"></div>
                      <div className="space-y-1">
                        <h3 className="font-medium text-slate-100">{issue.title}</h3>
                        <p className="text-sm text-slate-400">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {issues.passing.length > 0 && (
              <div className="border border-slate-800 p-6 space-y-5">
                <div className="flex items-center gap-2 font-medium text-slate-400 text-xs uppercase tracking-widest">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Passing Checks ({issues.passing.length})</span>
                </div>
                <div className="grid gap-4">
                  {issues.passing.map((issue) => (
                    <div key={issue.id} className="flex items-center gap-4 opacity-60">
                      <CheckCircle2 className="w-4 h-4 text-slate-500 shrink-0" />
                      <div className="space-y-1">
                        <h3 className="font-medium text-slate-400 text-sm">{issue.title}</h3>
                        <p className="text-sm text-slate-400">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-8 pt-8">
          <div className="space-y-4 pb-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-50">What We'd Build For You</h2>
            <p className="text-base text-slate-400 max-w-2xl">
              If we partnered today, this is the exact execution roadmap we would use to resolve the friction points above.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {solutions.map((card) => (
              <div key={card.id} className="bg-slate-900/30 border border-slate-800 transition-colors hover:bg-slate-900/80 rounded-lg p-6 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium px-2 py-1 uppercase tracking-widest bg-slate-800 text-slate-300 rounded-sm">
                      {card.tag}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{card.estimated_days} turnaround</span>
                    </span>
                  </div>
                  <h3 className="text-lg font-medium text-slate-100">
                    {card.title}
                  </h3>
                  <div className="text-sm text-slate-300 space-y-2">
                    {card.description.split('\n').map((line, idx) => (
                      <p key={idx}>{line}</p>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => handleSelectSolution(card.title)}
                  className="w-full py-2.5 bg-transparent border border-slate-700 hover:border-slate-500 text-slate-300 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <span>Select Solution</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section id="request-loom" className="border border-slate-800 p-8 space-y-8">
          <div className="space-y-3">
            <h2 className="text-2xl font-medium text-slate-50">Request Your Custom Video Breakdown</h2>
            <p className="text-sm text-slate-400">
              Confirm your contact details and let us know what you want us to prioritize in your 48-hour video walkthrough.
            </p>
          </div>

          {submitted ? (
            <div className="border border-emerald-900 bg-emerald-950/20 rounded-sm p-6 text-center space-y-3">
              <h3 className="text-lg font-bold text-emerald-400">Video Request Received</h3>
              <p className="text-sm text-slate-300">
                Our team is analyzing {lead.domain}. You will receive your personalized video breakdown at {lead.email} within 48 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-xs font-medium text-slate-400 mb-2">
                  Your Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-slate-500 transition-colors placeholder:text-slate-600"
                  placeholder="e.g. John"
                />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Work Email</label>
                  <input
                    type="email"
                    value={lead.email}
                    disabled
                    className="w-full bg-slate-900 border border-slate-800 rounded-md px-4 py-3 text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="focus" className="block text-xs font-medium text-slate-400 mb-2">
                  What should we prioritize in the video?
                </label>
                <textarea
                  id="focus"
                  rows={4}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-md text-slate-200 text-sm focus:outline-none focus:border-slate-500 transition-colors placeholder:text-slate-600 resize-none"
                  placeholder={`E.g. Focus on our mobile checkout flow...`}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-white hover:bg-slate-200 text-slate-950 text-sm font-semibold rounded-md transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          )}
        </section>

        <section id="booking" className="space-y-6 pt-4">
          <div className="p-5 border border-slate-800 text-center">
            <p className="text-sm font-medium text-slate-200">
              {bookingContext}
            </p>
          </div>

          <div className="border border-slate-800 p-2 overflow-hidden min-h-[660px]">
            <iframe
              src={`https://calendly.com/mohrashard/30min?embed_domain=outreach.mr2labs.com&embed_type=Inline&background_color=0f172a&text_color=f8fafc&primary_color=ffffff&hide_event_type_details=1&hide_gdpr_banner=1`}
              className="w-full h-[650px]"
              title="Book a Discovery Call"
            ></iframe>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-60">
            <Image
              src="/mr-squared-logo.png"
              alt="MR² Labs Logo"
              width={100}
              height={26}
              className="h-6 w-auto object-contain grayscale"
            />
          </div>
          <p className="text-xs text-slate-500">Outreach Engine &copy; {new Date().getFullYear()} — High Performance Systems Engineering</p>
        </div>
      </footer>
    </div>
  );
}
