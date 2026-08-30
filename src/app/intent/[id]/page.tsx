'use client';

import React, { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle2, Video, XCircle, ChevronRight, Loader2 } from 'lucide-react';

export default function IntentSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const leadId = resolvedParams.id;
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleIntent = async (intent: 'fix' | 'nurture' | 'pass') => {
    setLoading(intent);
    try {
      const res = await fetch('/api/track-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, intent })
      });
      
      const { redirectUrl } = await res.json();
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        router.push('https://mr2labs.com');
      }
    } catch (err) {
      console.error(err);
      if (intent === 'fix') router.push(`/audit/${leadId}#booking`);
      else if (intent === 'nurture') router.push(`/audit/${leadId}#request-loom`);
      else router.push('https://mr2labs.com');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#030407] text-zinc-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 z-0 pointer-events-none">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-900/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-12 flex justify-center">
          <Image src="/mr-squared-logo.png" alt="Mr² Labs" width={140} height={36} className="h-8 w-auto opacity-90" />
        </div>

        <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-medium text-white mb-3 tracking-tight">How would you like to proceed?</h1>
            <p className="text-zinc-400 text-sm">Select an option below to handle your audit findings.</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleIntent('fix')}
              disabled={loading !== null}
              className="w-full group relative flex items-center justify-between p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.08] transition-all disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  {loading === 'fix' ? <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                </div>
                <div className="text-left">
                  <div className="text-emerald-50 font-medium mb-0.5">I want Mr² Labs to fix this</div>
                  <div className="text-xs text-emerald-500/70">Book a strategy call to review the plan</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-emerald-500/50 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => handleIntent('nurture')}
              disabled={loading !== null}
              className="w-full group relative flex items-center justify-between p-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] hover:bg-amber-500/[0.08] transition-all disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  {loading === 'nurture' ? <Loader2 className="w-5 h-5 text-amber-500 animate-spin" /> : <Video className="w-5 h-5 text-amber-500" />}
                </div>
                <div className="text-left">
                  <div className="text-amber-50 font-medium mb-0.5">Send over a Loom breakdown</div>
                  <div className="text-xs text-amber-500/70">So my internal team can fix it</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-500/50 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => handleIntent('pass')}
              disabled={loading !== null}
              className="w-full group relative flex items-center justify-between p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] transition-all disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                  {loading === 'pass' ? <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" /> : <XCircle className="w-5 h-5 text-zinc-400" />}
                </div>
                <div className="text-left">
                  <div className="text-zinc-300 font-medium mb-0.5">Not a priority right now</div>
                  <div className="text-xs text-zinc-500">I'll review it later</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-500/50 group-hover:text-zinc-400 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
