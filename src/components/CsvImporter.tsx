'use client';

import React, { useState } from 'react';
import { FileSpreadsheet, Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';
import { CsvImportModal } from '@/components/campaigns/CsvImportModal';

export default function CsvImporter({ defaultCampaignId }: { defaultCampaignId?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="w-full max-w-2xl bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center border border-violet-500/30 shadow-lg shadow-violet-500/10">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                CSV Lead Intelligence & Verifier
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                  New
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Upload CSV lists with custom pain points & solutions to auto-verify real inboxes.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5 text-xs text-zinc-400">
          <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Verifies real inboxes via DNS MX & Verifalia</span>
          </div>
          <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
            <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
            <span>Checks database & tracks follow-up metrics</span>
          </div>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-lg shadow-violet-600/25 transition-all cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Open CSV Import & Verification Wizard</span>
          <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      </div>

      <CsvImportModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        defaultCampaignId={defaultCampaignId}
      />
    </>
  );
}
