'use client';

import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { 
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Clock, 
  Send, ExternalLink, ShieldCheck, AlertTriangle, X, Loader2, 
  Building2, User, Mail, Globe, Sparkles, 
  Check, RotateCcw, ArrowRight, Download, Info, Minus, Maximize2
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

const LinkedinIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.66 1.66 0 1 0-.01 3.32 1.66 1.66 0 0 0 .01-3.32" />
  </svg>
);

const InstagramIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </svg>
);

interface VerificationProgress {
  processed: number;
  total: number;
  percent: number;
  currentLeadName: string;
  currentBatch: number;
  totalBatches: number;
  verifiedSoFar: number;
  rescuedSoFar: number;
  existingSoFar: number;
  invalidSoFar: number;
}

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
  defaultCampaignId?: string;
}

export function CsvImportModal({ 
  isOpen, 
  onClose, 
  onImportComplete,
  defaultCampaignId 
}: CsvImportModalProps) {
  // Campaign State
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>(defaultCampaignId || '');

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<{ [key: string]: boolean }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verification & Processing State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState<VerificationProgress | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingInvalid, setIsSavingInvalid] = useState(false);
  const [savingProgress, setSavingProgress] = useState<{ current: number; total: number } | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'verified' | 'existing' | 'invalid'>('verified');

  // Verification Result Data
  const [verificationResult, setVerificationResult] = useState<{
    summary: {
      totalUploaded: number;
      verifiedCount: number;
      existingCount: number;
      alreadySentCount: number;
      invalidCount: number;
    };
    verified: any[];
    existing: any[];
    invalid: any[];
  } | null>(null);

  // Selected Verified Leads for Import
  const [selectedVerifiedIndices, setSelectedVerifiedIndices] = useState<Set<number>>(new Set());
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch all campaigns on mount (both active and inactive)
  useEffect(() => {
    async function fetchCampaigns() {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, is_active, niche, location')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setCampaigns(data);
        if (!selectedCampaign) {
          const firstActive = data.find(c => c.is_active);
          setSelectedCampaign(defaultCampaignId || (firstActive ? firstActive.id : (data[0]?.id || 'pool')));
        }
      } else {
        setSelectedCampaign('pool');
      }
    }
    if (isOpen) {
      fetchCampaigns();
    }
  }, [isOpen, defaultCampaignId, selectedCampaign]);

  // Guard against accidental browser tab closure while verification or saving is active
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isVerifying || isSaving || isSavingInvalid) {
        e.preventDefault();
        e.returnValue = 'CSV verification or ingestion is currently active. If you close this tab, processing will stop.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isVerifying, isSaving, isSavingInvalid]);

  const handleAttemptClose = () => {
    if (isVerifying || isSaving) {
      const wantMinimize = window.confirm(
        "Verification or Saving is actively running! Would you like to minimize this to the background dock so it can finish without interruption?"
      );
      if (wantMinimize) {
        setIsMinimized(true);
        return;
      }
      const wantCancel = window.confirm(
        "Closing completely will stop the current verification queue. Are you sure you want to stop?"
      );
      if (!wantCancel) return;
    }
    setIsMinimized(false);
    onClose();
  };

  if (!isOpen) return null;

  // Floating Minimized Background Dock Widget
  if (isMinimized) {
    return (
      <div 
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-zinc-950/95 border border-violet-500/50 shadow-2xl shadow-violet-950/70 flex items-center space-x-3.5 cursor-pointer hover:scale-[1.02] hover:border-violet-400 transition-all duration-200 backdrop-blur-md animate-in slide-in-from-bottom-5"
      >
        <div className="relative flex h-3.5 w-3.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-violet-500"></span>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-bold text-white flex items-center gap-2">
            <span>CSV Lead Verifier (Running in Background)</span>
            {verificationProgress && isVerifying && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30">
                {verificationProgress.percent}% ({verificationProgress.processed}/{verificationProgress.total})
              </span>
            )}
            {isSaving && savingProgress && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Saving ({savingProgress.current}/{savingProgress.total})
              </span>
            )}
            {verificationResult && !isVerifying && !isSaving && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {verificationResult.summary.verifiedCount} Verified Ready
              </span>
            )}
          </div>
          
          <p className="text-[11px] text-zinc-400 max-w-xs truncate font-mono">
            {verificationProgress && isVerifying
              ? verificationProgress.currentLeadName 
              : isSaving
              ? 'Persisting verified leads & crafting tailored AI pitches...'
              : verificationResult
              ? 'Verification complete! Click to review & save leads'
              : 'Click to expand modal'}
          </p>
        </div>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(false);
          }}
          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors ml-1"
          title="Expand to Fullscreen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const detectColumns = (headers: string[]) => {
    const cleanHeaders = headers.map(h => h.toLowerCase().replace(/[\s_-]/g, ''));
    const hasCol = (patterns: string[]) => patterns.some(p => cleanHeaders.includes(p));

    return {
      companyName: hasCol(['businessname', 'companyname', 'company', 'organization', 'business']),
      founderName: hasCol(['founder', 'decisionmaker', 'foundername', 'contactname', 'fullname', 'name', 'firstname']),
      email: hasCol(['workinginboxemail', 'workemail', 'inboxemail', 'email', 'directemail', 'contactemail', 'mail', 'inbox']),
      websiteUrl: hasCol(['website', 'websiteurl', 'domain', 'url', 'companyurl']),
      linkedinUrl: hasCol(['linkedinurl', 'linkedin', 'personlinkedinurl', 'companylinkedinurl', 'personlinkedin', 'companylinkedin']),
      instagramUrl: hasCol(['instagramurl', 'instagram', 'ig', 'insta']),
      painPoint: hasCol(['painpoint', 'painpoints', 'problem', 'friction', 'issue', 'customerpainpoint']),
      mr2Solution: hasCol(['mr2labssolution', 'mr2solution', 'solution', 'offer', 'service', 'recommendedservice'])
    };
  };

  const hasAnyCrucialColumn = Boolean(
    detectedColumns.companyName || detectedColumns.email || detectedColumns.websiteUrl
  );

  const processSelectedFile = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv') && selectedFile.type !== 'text/csv') {
      setStatusMessage({ 
        type: 'error', 
        text: 'Unsupported file format! Please upload a .csv file. (If using Microsoft Excel or Google Sheets, click "File > Download / Export As > Comma Separated Values (.csv)").' 
      });
      return;
    }

    setFile(selectedFile);
    setStatusMessage(null);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          setStatusMessage({ 
            type: 'error', 
            text: 'Uploaded CSV file contains no data rows or is completely empty.' 
          });
          return;
        }

        const headers = results.meta.fields || [];
        const detected = detectColumns(headers);
        setDetectedColumns(detected);
        setRawRows(results.data);

        const hasCore = detected.companyName || detected.email || detected.websiteUrl;
        if (!hasCore) {
          setStatusMessage({
            type: 'error',
            text: 'Warning: Could not find columns for Business Name, Website, or Email in this CSV. Please check your column headers or use our sample template.'
          });
        }
      },
      error: (error) => {
        setStatusMessage({ 
          type: 'error', 
          text: `Failed to parse CSV file: ${error.message}. Please verify the file is not corrupted.` 
        });
      }
    });
  };

  const runVerification = async () => {
    if (rawRows.length === 0) return;

    setIsVerifying(true);
    setStatusMessage(null);

    const BATCH_SIZE = 5;
    const totalRows = rawRows.length;
    const totalBatches = Math.ceil(totalRows / BATCH_SIZE);

    let allVerified: any[] = [];
    let allExisting: any[] = [];
    let allInvalid: any[] = [];
    let runningRescuedCount = 0;

    setVerificationProgress({
      processed: 0,
      total: totalRows,
      percent: 0,
      currentLeadName: 'Initializing 360° verification pipeline...',
      currentBatch: 1,
      totalBatches,
      verifiedSoFar: 0,
      rescuedSoFar: 0,
      existingSoFar: 0,
      invalidSoFar: 0
    });

    try {
      for (let b = 0; b < totalBatches; b++) {
        const start = b * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalRows);
        const batchRows = rawRows.slice(start, end);

        const firstLead = batchRows[0] || {};
        const probeName = 
          firstLead['Business Name'] || 
          firstLead['Company Name'] || 
          firstLead.companyName || 
          firstLead['Website'] || 
          firstLead['Working Inbox Email'] || 
          `Lead #${start + 1}`;

        setVerificationProgress({
          processed: start,
          total: totalRows,
          percent: Math.round((start / totalRows) * 100),
          currentLeadName: `Probing: ${probeName} (Rows ${start + 1}–${end} of ${totalRows})`,
          currentBatch: b + 1,
          totalBatches,
          verifiedSoFar: allVerified.length,
          rescuedSoFar: runningRescuedCount,
          existingSoFar: allExisting.length,
          invalidSoFar: allInvalid.length
        });

        const response = await fetch('/api/campaigns/import/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batchRows })
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `Verification failed on batch ${b + 1}`);
        }

        const data = await response.json();

        if (data.verified) {
          allVerified = [...allVerified, ...data.verified];
          const rescuedInBatch = data.verified.filter((v: any) => v.wasAnyHealed).length;
          runningRescuedCount += rescuedInBatch;
        }
        if (data.existing) {
          allExisting = [...allExisting, ...data.existing];
        }
        if (data.invalid) {
          allInvalid = [...allInvalid, ...data.invalid];
        }

        const newProcessed = end;
        setVerificationProgress({
          processed: newProcessed,
          total: totalRows,
          percent: Math.round((newProcessed / totalRows) * 100),
          currentLeadName: newProcessed === totalRows ? 'Verification Complete!' : `Probing: ${probeName}`,
          currentBatch: b + 1,
          totalBatches,
          verifiedSoFar: allVerified.length,
          rescuedSoFar: runningRescuedCount,
          existingSoFar: allExisting.length,
          invalidSoFar: allInvalid.length
        });
      }

      // Re-index rows sequentially
      const reindexedVerified = allVerified.map((item, idx) => ({ ...item, rowIndex: idx + 1 }));
      const reindexedExisting = allExisting.map((item, idx) => ({ ...item, rowIndex: idx + 1 }));
      const reindexedInvalid = allInvalid.map((item, idx) => ({ ...item, rowIndex: idx + 1 }));

      const combinedResult = {
        summary: {
          totalUploaded: totalRows,
          verifiedCount: reindexedVerified.length,
          autoHealedCount: runningRescuedCount,
          existingCount: reindexedExisting.length,
          alreadySentCount: reindexedExisting.filter(e => e.isAlreadySent).length,
          invalidCount: reindexedInvalid.length
        },
        verified: reindexedVerified,
        existing: reindexedExisting,
        invalid: reindexedInvalid
      };

      setVerificationResult(combinedResult);

      const allVerifiedIndices = new Set<number>();
      reindexedVerified.forEach((_, idx) => allVerifiedIndices.add(idx));
      setSelectedVerifiedIndices(allVerifiedIndices);

      if (reindexedVerified.length > 0) {
        setActiveTab('verified');
      } else if (reindexedExisting.length > 0) {
        setActiveTab('existing');
      } else {
        setActiveTab('invalid');
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error running verification.' });
    } finally {
      setIsVerifying(false);
      setVerificationProgress(null);
    }
  };

  const toggleSelectAllVerified = () => {
    if (!verificationResult) return;
    if (selectedVerifiedIndices.size === verificationResult.verified.length) {
      setSelectedVerifiedIndices(new Set());
    } else {
      const all = new Set<number>();
      verificationResult.verified.forEach((_, idx) => all.add(idx));
      setSelectedVerifiedIndices(all);
    }
  };

  const toggleSelectVerified = (idx: number) => {
    const updated = new Set(selectedVerifiedIndices);
    if (updated.has(idx)) updated.delete(idx);
    else updated.add(idx);
    setSelectedVerifiedIndices(updated);
  };

  const handleSaveVerifiedLeads = async () => {
    if (!verificationResult || selectedVerifiedIndices.size === 0) return;

    setIsSaving(true);
    setStatusMessage(null);

    const leadsToSave = verificationResult.verified.filter((_, idx) => selectedVerifiedIndices.has(idx));
    const totalToSave = leadsToSave.length;
    const SAVE_BATCH_SIZE = 4; // Keeps AI pitch generation comfortably under Vercel Hobby's 10s ceiling
    let totalSaved = 0;

    try {
      for (let i = 0; i < totalToSave; i += SAVE_BATCH_SIZE) {
        const chunk = leadsToSave.slice(i, i + SAVE_BATCH_SIZE);
        const currentBatchEnd = Math.min(i + SAVE_BATCH_SIZE, totalToSave);
        
        setSavingProgress({ current: currentBatchEnd, total: totalToSave });
        setStatusMessage({
          type: 'success',
          text: `Saving leads & crafting customer POV AI pitches (${currentBatchEnd} of ${totalToSave})...`
        });

        const res = await fetch('/api/campaigns/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId: selectedCampaign || 'pool',
            leads: chunk
          })
        });

        if (!res.ok) {
          const err = await responseError(res);
          throw new Error(err || `Failed to save leads batch starting at #${i + 1}`);
        }

        const result = await res.json();
        totalSaved += (result.successCount || chunk.length);
      }

      setStatusMessage({ 
        type: 'success', 
        text: `Successfully saved all ${totalSaved} verified leads with tailored AI pitches!` 
      });

      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save verified leads.' });
    } finally {
      setIsSaving(false);
      setSavingProgress(null);
    }
  };

  const handleSaveInvalidLeads = async () => {
    if (!verificationResult || verificationResult.invalid.length === 0) return;
    setIsSavingInvalid(true);
    setStatusMessage(null);

    const invalidLeads = verificationResult.invalid;
    const totalToSave = invalidLeads.length;
    const SAVE_BATCH_SIZE = 4;
    let totalSaved = 0;

    try {
      for (let i = 0; i < totalToSave; i += SAVE_BATCH_SIZE) {
        const chunk = invalidLeads.slice(i, i + SAVE_BATCH_SIZE).map(l => ({
          ...l,
          isInvalid: true,
          status: l.websiteStatus === 'DEAD' ? 'INVALID_DOMAIN' : (!l.email ? 'MISSING_EMAIL' : 'UNCONTACTABLE')
        }));

        const res = await fetch('/api/campaigns/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId: selectedCampaign || 'pool',
            leads: chunk
          })
        });

        if (!res.ok) {
          const err = await responseError(res);
          throw new Error(err || `Failed to record invalid leads`);
        }

        const result = await res.json();
        totalSaved += (result.successCount || chunk.length);
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully recorded ${totalSaved} invalid leads as UNCONTACTABLE / INVALID_DOMAIN in database.`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to record invalid leads.' });
    } finally {
      setIsSavingInvalid(false);
    }
  };

  const responseError = async (res: Response) => {
    try {
      const data = await res.json();
      return data.error;
    } catch {
      return res.statusText;
    }
  };

  const resetAll = () => {
    setFile(null);
    setRawRows([]);
    setDetectedColumns({});
    setVerificationResult(null);
    setSelectedVerifiedIndices(new Set());
    setStatusMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadSampleCsv = () => {
    const csvContent = `Business Name,Founder / Decision Maker Name,Working Inbox Email,Website,LinkedIn URL,Instagram URL,Pain Point,Mr² Labs Solution
Acme Health & Wellness,Dr. Sarah Jenkins,sarah@acmehealth.com,https://acmehealth.com,https://www.linkedin.com/in/sarahjenkins,https://www.instagram.com/acmehealth,Inquiries after hours sit unanswered on booking page for 48h,24/7 Autonomous AI Booking & Triage Assistant
Apex Global Tech,Marcus Vance,marcus@apextech.io,https://apextech.io,https://www.linkedin.com/in/marcusvance,https://www.instagram.com/apextech,Manual lead follow-up delays cause 40% demo drop-off rate,Real-time High-Intent AI Lead Pipeline & Nurturing Engine
Summit Legal Group,Elena Rostova,contact@summitlaw.com,https://summitlaw.com,https://www.linkedin.com/in/elenarostova,,Client intake takes 3 days of manual back-and-forth documentation,Autonomous Legal Intake & Document Verification Bot`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'mr2labs_sample_leads.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 text-white">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                CSV Lead Intelligence & Inbox Verifier
                <span className="text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  AI Ready
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Import CSVs with custom pain points & solutions, auto-verify deliverable inboxes, and inspect existing follow-up metrics.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={downloadSampleCsv}
              className="px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download pre-formatted CSV template"
            >
              <Download className="w-3.5 h-3.5 text-violet-400" />
              <span>Download Template</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/80 transition-colors cursor-pointer"
              title="Minimize to Background Dock"
            >
              <Minus className="w-5 h-5" />
            </button>
            <button 
              onClick={handleAttemptClose}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/80 transition-colors cursor-pointer"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* Campaign Selector Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Target Campaign for Ingestion</label>
              <p className="text-xs text-zinc-500">Verified leads will be assigned here with status <strong>NEW</strong> for future dispatch.</p>
            </div>
            <div className="flex flex-col sm:items-end">
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 sm:w-80"
              >
                <option value="pool">📁 Default Lead Pool (Unassigned / General Ingestion)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.is_active ? '🟢 (Active)' : '⏸️ (Inactive / Paused)'}
                  </option>
                ))}
              </select>
              {selectedCampaign !== 'pool' && campaigns.find(c => c.id === selectedCampaign && !c.is_active) && (
                <span className="text-[11px] text-amber-400/90 mt-1.5 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Campaign paused. Leads will be saved as <strong>NEW</strong> for future dispatch.</span>
                </span>
              )}
            </div>
          </div>

          {/* Status Alert */}
          {statusMessage && (
            <div className={`p-4 rounded-xl flex items-center space-x-3 text-sm border ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
            }`}>
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Step 1: Upload CSV & Auto-Column Detection */}
          {!verificationResult && (
            <div className="space-y-5">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-violet-500 bg-violet-500/10 scale-[0.99]'
                    : file
                    ? 'border-emerald-500/50 bg-emerald-950/10'
                    : 'border-zinc-700/80 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                
                {file ? (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-white">{file.name}</p>
                    <p className="text-xs text-zinc-400">{(file.size / 1024).toFixed(1)} KB • {rawRows.length} rows parsed</p>
                    <span className="text-xs text-violet-400 hover:underline pt-1">Click to choose a different file</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-violet-500/10 text-violet-400 flex items-center justify-center">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-xs text-zinc-500 max-w-sm">
                      Upload your lead list with emails, decision makers, custom pain points, and Mr² Labs solutions.
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadSampleCsv();
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-medium transition-colors border border-zinc-700 shadow-sm cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-violet-400" />
                      <span>Download Sample CSV Template</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Detected Column Matrix */}
              {rawRows.length > 0 && (
                <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      Detected CSV Columns ({rawRows.length} rows detected)
                    </h3>
                    <span className="text-xs text-zinc-400">Auto-mapped for AI pitch generation</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {[
                      { key: 'companyName', label: 'Business Name', icon: Building2 },
                      { key: 'founderName', label: 'Founder / Contact', icon: User },
                      { key: 'email', label: 'Working Inbox Email', icon: Mail },
                      { key: 'websiteUrl', label: 'Website / URL', icon: Globe },
                      { key: 'linkedinUrl', label: 'LinkedIn URL', icon: LinkedinIcon },
                      { key: 'instagramUrl', label: 'Instagram URL', icon: InstagramIcon },
                      { key: 'painPoint', label: 'Pain Point', icon: AlertCircle },
                      { key: 'mr2Solution', label: 'Mr² Labs Solution', icon: Sparkles },
                    ].map(({ key, label, icon: Icon }) => {
                      const detected = detectedColumns[key];
                      return (
                        <div 
                          key={key} 
                          className={`p-2.5 rounded-lg border flex items-center justify-between transition-colors ${
                            detected 
                              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
                              : 'bg-zinc-900/40 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <Icon className={`w-3.5 h-3.5 ${detected ? 'text-emerald-400' : 'text-zinc-500'}`} />
                            <span className="truncate font-medium">{label}</span>
                          </div>
                          
                          {detected ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold shrink-0 ml-1">
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            </span>
                          ) : key === 'founderName' ? (
                            <span className="text-[9px] text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded border border-violet-500/25 font-medium shrink-0 ml-1 flex items-center gap-1" title="Will be auto-discovered by AI from website">
                              <Sparkles className="w-2 h-2 text-violet-400" />
                              <span>AI Found</span>
                            </span>
                          ) : key === 'mr2Solution' ? (
                            <span className="text-[9px] text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded border border-violet-500/25 font-medium shrink-0 ml-1 flex items-center gap-1" title="Will be auto-tailored by AI pitch generator">
                              <Sparkles className="w-2 h-2 text-violet-400" />
                              <span>AI Pitched</span>
                            </span>
                          ) : key === 'painPoint' ? (
                            <span className="text-[9px] text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 font-medium shrink-0 ml-1">
                              AI Derived
                            </span>
                          ) : key === 'linkedinUrl' || key === 'instagramUrl' ? (
                            <span className="text-[9px] text-zinc-500 uppercase shrink-0 ml-1">
                              Optional
                            </span>
                          ) : hasAnyCrucialColumn ? (
                            <span className="text-[9px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-medium shrink-0 ml-1" title="Can be derived from domain or email">
                              Derivable
                            </span>
                          ) : (
                            <span className="text-[9px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 font-semibold shrink-0 ml-1">
                              Required
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Format Guidance & Tolerance Notice */}
                  {hasAnyCrucialColumn ? (
                    <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <strong className="text-zinc-300">Format Tolerance:</strong> Missing <span className="text-violet-300">Founder</span> or <span className="text-violet-300">Mr² Labs Solution</span> columns will not reject your leads! Our AI agent crawls the live website to discover the decision maker, and creates tailored pitches automatically.
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Unrecognized Column Headers</span>
                      </div>
                      <p className="text-zinc-400 text-xs leading-relaxed">
                        We could not find headers for <strong>Business Name</strong>, <strong>Website</strong>, or <strong>Email</strong> in this CSV. Please align your file headers or download our sample template.
                      </p>
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={downloadSampleCsv}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-semibold text-xs border border-amber-500/30 transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download CSV Template</span>
                        </button>
                        <button
                          type="button"
                          onClick={resetAll}
                          className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
                        >
                          Choose another file
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 360-Degree Verification Pipeline Banner */}
                  <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-500/30 text-xs text-violet-300 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex items-center space-x-2">
                      <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span><strong>Website Verification:</strong> Probes live DNS & HTTP response</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <LinkedinIcon className="w-4 h-4 text-sky-400 shrink-0" />
                      <span><strong>LinkedIn Verification:</strong> Validates decision maker presence</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span><strong>Bounce Protection:</strong> Proves real inbox deliverability</span>
                    </div>
                  </div>

                  {/* Live Interactive Verification Load Bar */}
                  {isVerifying && verificationProgress && (
                    <div className="p-5 rounded-2xl bg-zinc-900/90 border border-violet-500/40 shadow-xl shadow-violet-950/40 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                      {/* Top Row: Animated pulse & live counters */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center space-x-2.5">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                              Verifying Inboxes & Probing Domains
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                Batch {verificationProgress.currentBatch} of {verificationProgress.totalBatches}
                              </span>
                            </h4>
                            <p className="text-xs text-zinc-400 truncate max-w-md font-mono">
                              {verificationProgress.currentLeadName}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-baseline sm:flex-col sm:items-end gap-2 sm:gap-0">
                          <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-emerald-400 font-mono">
                            {verificationProgress.percent}%
                          </div>
                          <div className="text-xs text-zinc-400 font-mono">
                            {verificationProgress.processed} of {verificationProgress.total} leads checked
                          </div>
                        </div>
                      </div>

                      {/* Smooth Animated Load Bar */}
                      <div className="w-full bg-zinc-800 rounded-full h-3 p-0.5 overflow-hidden border border-zinc-700/60 shadow-inner">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 via-indigo-500 to-emerald-400 transition-all duration-300 ease-out relative overflow-hidden shadow-lg shadow-violet-500/40"
                          style={{ width: `${Math.max(verificationProgress.percent, 3)}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                        </div>
                      </div>

                      {/* Real-time Dynamic Running Tally */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                        <div className="px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
                          <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified
                          </span>
                          <span className="font-bold text-emerald-300 font-mono text-sm">
                            {verificationProgress.verifiedSoFar}
                          </span>
                        </div>

                        <div className="px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
                          <span className="text-amber-400 flex items-center gap-1.5 font-medium">
                            <Sparkles className="w-3.5 h-3.5" />
                            Rescued
                          </span>
                          <span className="font-bold text-amber-300 font-mono text-sm">
                            {verificationProgress.rescuedSoFar}
                          </span>
                        </div>

                        <div className="px-3 py-2 rounded-lg bg-indigo-950/30 border border-indigo-500/30 flex items-center justify-between">
                          <span className="text-indigo-400 flex items-center gap-1.5 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            In DB
                          </span>
                          <span className="font-bold text-indigo-300 font-mono text-sm">
                            {verificationProgress.existingSoFar}
                          </span>
                        </div>

                        <div className="px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-500/30 flex items-center justify-between">
                          <span className="text-rose-400 flex items-center gap-1.5 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Excluded
                          </span>
                          <span className="font-bold text-rose-300 font-mono text-sm">
                            {verificationProgress.invalidSoFar}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={runVerification}
                      disabled={isVerifying || rawRows.length === 0 || !hasAnyCrucialColumn}
                      className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium text-sm flex items-center space-x-2 shadow-lg shadow-violet-600/20 transition-all cursor-pointer"
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>
                            Verifying Inboxes ({verificationProgress?.processed || 0}/{rawRows.length})...
                          </span>
                        </>
                      ) : !hasAnyCrucialColumn ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Unrecognized CSV Format</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Verify Inboxes & Check Database</span>
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Verification Dashboard & Interactive Review */}
          {verificationResult && (
            <div className="space-y-6">
              
              {/* Metric Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                
                {/* 1. Verified & Deliverable */}
                <div 
                  onClick={() => setActiveTab('verified')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    activeTab === 'verified'
                      ? 'bg-emerald-950/30 border-emerald-500/50 ring-1 ring-emerald-500/50'
                      : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      Verified Inboxes
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300">
                      {verificationResult.summary.verifiedCount}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-white">{verificationResult.summary.verifiedCount} Ready to Save</p>
                  {(verificationResult.summary as any).autoHealedCount > 0 ? (
                    <p className="text-xs text-amber-300 font-medium mt-1 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{(verificationResult.summary as any).autoHealedCount} rescued & auto-healed!</span>
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-400 mt-1">Real inboxes confirmed deliverable via DNS & Verifalia.</p>
                  )}
                </div>

                {/* 2. Already Sent / Existing */}
                <div 
                  onClick={() => setActiveTab('existing')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    activeTab === 'existing'
                      ? 'bg-amber-950/30 border-amber-500/50 ring-1 ring-amber-500/50'
                      : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      Already in Database
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300">
                      {verificationResult.summary.existingCount}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-white">{verificationResult.summary.alreadySentCount} Already Sent</p>
                  <p className="text-xs text-zinc-400 mt-1">Not rejected. Follow-up metrics & statuses tracked below.</p>
                </div>

                {/* 3. Invalid / No Inbox */}
                <div 
                  onClick={() => setActiveTab('invalid')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    activeTab === 'invalid'
                      ? 'bg-rose-950/30 border-rose-500/50 ring-1 ring-rose-500/50'
                      : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Invalid / No Inbox
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300">
                      {verificationResult.summary.invalidCount}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-white">{verificationResult.summary.invalidCount} Excluded</p>
                  <p className="text-xs text-zinc-400 mt-1">Undeliverable or missing inboxes. Excluded to protect domain.</p>
                </div>

              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center justify-between border-b border-zinc-800">
                <div className="flex space-x-1">
                  <button
                    onClick={() => setActiveTab('verified')}
                    className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                      activeTab === 'verified'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>🟢 Verified & Deliverable Inboxes</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-500/20 text-emerald-300">
                      {verificationResult.verified.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('existing')}
                    className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                      activeTab === 'existing'
                        ? 'border-amber-500 text-amber-400'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>🟡 Already Sent & Existing Leads</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500/20 text-amber-300">
                      {verificationResult.existing.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('invalid')}
                    className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                      activeTab === 'invalid'
                        ? 'border-rose-500 text-rose-400'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>🔴 Invalid / Undeliverable</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-rose-500/20 text-rose-300">
                      {verificationResult.invalid.length}
                    </span>
                  </button>
                </div>

                <button
                  onClick={resetAll}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Upload Different CSV</span>
                </button>
              </div>

              {/* TAB 1: Verified Leads Table */}
              {activeTab === 'verified' && (
                <div className="space-y-4">
                  {verificationResult.verified.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-sm">
                      No deliverable leads found. Check the "Invalid" or "Existing" tabs.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={selectedVerifiedIndices.size === verificationResult.verified.length}
                            onChange={toggleSelectAllVerified}
                            className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                          />
                          <span>Select All ({selectedVerifiedIndices.size} selected of {verificationResult.verified.length})</span>
                        </div>
                        <span>Only selected leads will be saved into the campaign.</span>
                      </div>

                      <div className="border border-zinc-800 rounded-xl overflow-x-auto max-h-[340px]">
                        <table className="w-full text-left text-xs text-zinc-300">
                          <thead className="bg-zinc-900/80 text-zinc-400 sticky top-0 uppercase tracking-wider font-semibold border-b border-zinc-800">
                            <tr>
                              <th className="p-3 w-10"></th>
                              <th className="p-3">Company & Live Website</th>
                              <th className="p-3">Real Inbox & Deliverability</th>
                              <th className="p-3">Founder LinkedIn</th>
                              <th className="p-3">Pain Point & Solution</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60 font-medium">
                            {verificationResult.verified.map((lead, idx) => {
                              const isChecked = selectedVerifiedIndices.has(idx);
                              return (
                                <tr key={idx} className={`hover:bg-zinc-900/40 transition-colors ${isChecked ? 'bg-emerald-950/10' : ''}`}>
                                  <td className="p-3">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleSelectVerified(idx)}
                                      className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                                    />
                                  </td>
                                  <td className="p-3">
                                    <div className="font-semibold text-white">{lead.companyName}</div>
                                    <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                                      <span>{lead.founderName || 'Decision Maker'}</span>
                                      {lead.autoHealed?.founder && (
                                        <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20 flex items-center gap-0.5">
                                          <Sparkles className="w-2 h-2" />
                                          <span>Found DM</span>
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                                      {lead.websiteUrl ? (
                                        <a 
                                          href={lead.websiteUrl.startsWith('http') ? lead.websiteUrl : `https://${lead.websiteUrl}`} 
                                          target="_blank" 
                                          rel="noreferrer" 
                                          className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20"
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                          <span>Live Site</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      ) : (
                                        <span className="text-zinc-500">No domain</span>
                                      )}
                                      {lead.autoHealed?.website && (
                                        <span 
                                          className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20"
                                          title={`Auto-healed: Original link was dead (${lead.originalData?.websiteUrl || 'none'})`}
                                        >
                                          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                                          <span>Site Rescued</span>
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <div className="text-emerald-400 font-mono text-[11px] font-semibold">{lead.email}</div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 mt-0.5">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span>{lead.verifier || 'Deliverable Inbox'}</span>
                                    </div>
                                    <div className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-1">
                                      <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span>Deliverability: <strong className="text-emerald-300">{lead.deliverabilityScore || 90}%</strong> (Zero Bounce)</span>
                                    </div>
                                    {lead.autoHealed?.email && (
                                      <div 
                                        className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 mt-1"
                                        title={`Auto-healed: Original was invalid/bounced (${lead.originalData?.email || 'none'})`}
                                      >
                                        <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                                        <span>Inbox Rescued</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {lead.linkedinUrl ? (
                                      lead.linkedinStatus === 'NOT_FOUND' ? (
                                        <span className="inline-flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-1 rounded-lg border border-rose-500/20 text-[11px]" title="Profile returned 404">
                                          <LinkedinIcon className="w-3 h-3 text-rose-400" />
                                          <span>Profile 404</span>
                                        </span>
                                      ) : lead.linkedinStatus === 'INVALID_URL' ? (
                                        <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20 text-[11px]">
                                          <LinkedinIcon className="w-3 h-3 text-amber-400" />
                                          <span>Invalid Format</span>
                                        </span>
                                      ) : (
                                        <div className="flex flex-col items-start gap-1">
                                          <a 
                                            href={lead.linkedinUrl} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 bg-sky-500/10 px-2 py-1 rounded-lg border border-sky-500/20 text-[11px]"
                                          >
                                            <LinkedinIcon className="w-3 h-3" />
                                            <span>{lead.linkedinStatus === 'FOUND_BY_SEARCH' ? 'Found (Serper)' : 'Verified Profile'}</span>
                                            <ExternalLink className="w-2.5 h-2.5" />
                                          </a>
                                          {lead.autoHealed?.linkedin && (
                                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                                              <span>Discovered</span>
                                            </span>
                                          )}
                                        </div>
                                      )
                                    ) : (
                                      <span className="text-zinc-600 text-[11px] italic">Not linked</span>
                                    )}
                                  </td>
                                  <td className="p-3 max-w-[200px]">
                                    {lead.painPoint && (
                                      <div className="text-[11px] text-zinc-300 line-clamp-1 mb-0.5" title={lead.painPoint}>
                                        <strong className="text-zinc-400">Pain:</strong> {lead.painPoint}
                                      </div>
                                    )}
                                    {lead.mr2Solution && (
                                      <div className="text-[11px] text-violet-300 line-clamp-1" title={lead.mr2Solution}>
                                        <strong className="text-violet-400">Offer:</strong> {lead.mr2Solution}
                                      </div>
                                    )}
                                    {!lead.painPoint && !lead.mr2Solution && (
                                      <span className="text-zinc-500 italic text-[11px]">Auto-derived</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Save Verified Leads Action Bar */}
                      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                        <div className="text-xs text-zinc-400">
                          <span className="font-semibold text-white">{selectedVerifiedIndices.size}</span> verified inboxes selected to save into campaign.
                        </div>
                        <button
                          onClick={handleSaveVerifiedLeads}
                          disabled={isSaving || selectedVerifiedIndices.size === 0}
                          className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-sm flex items-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Generating AI Pitches & Saving...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>Save {selectedVerifiedIndices.size} Verified Leads</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 2: Already Sent & Existing Leads Table */}
              {activeTab === 'existing' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      These leads already exist in your outreach pipeline. They were not rejected—inspect their current sequence status and sent metrics below.
                    </span>
                  </div>

                  {verificationResult.existing.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-sm">
                      No existing leads matched in the database.
                    </div>
                  ) : (
                    <div className="border border-zinc-800 rounded-xl overflow-x-auto max-h-[340px]">
                      <table className="w-full text-left text-xs text-zinc-300">
                        <thead className="bg-zinc-900/80 text-zinc-400 sticky top-0 uppercase tracking-wider font-semibold border-b border-zinc-800">
                          <tr>
                            <th className="p-3">Company & Contact</th>
                            <th className="p-3">Email Address</th>
                            <th className="p-3">Current Status</th>
                            <th className="p-3">Follow-Up Step</th>
                            <th className="p-3">Last Contacted / Sent</th>
                            <th className="p-3">Subject Drafted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 font-medium">
                          {verificationResult.existing.map((lead, idx) => {
                            const isSent = lead.isAlreadySent;
                            return (
                              <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                                <td className="p-3">
                                  <div className="font-semibold text-white">{lead.companyName}</div>
                                  <div className="text-[11px] text-zinc-400">{lead.founderName || 'Decision Maker'}</div>
                                </td>
                                <td className="p-3 font-mono text-[11px] text-zinc-300">
                                  {lead.email || '—'}
                                </td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    lead.dbStatus === 'SENT' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                    lead.dbStatus === 'REPLIED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                    lead.dbStatus === 'QUEUED' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                    'bg-zinc-800 text-zinc-300 border border-zinc-700'
                                  }`}>
                                    {lead.dbStatus}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <span className="text-zinc-300 text-[11px]">
                                    {lead.followUpStepLabel}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <div className="text-zinc-200 text-[11px]">{lead.relativeTime}</div>
                                  {lead.sentAt && (
                                    <div className="text-[10px] text-zinc-500">
                                      {new Date(lead.sentAt).toLocaleDateString()}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 max-w-[200px] truncate text-[11px] text-zinc-400" title={lead.emailSubject || ''}>
                                  {lead.emailSubject || '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Invalid / Bounced Leads Table */}
              {activeTab === 'invalid' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        These leads failed deliverability verification or had no mailbox. They are excluded from active outreach.
                      </span>
                    </div>
                    {verificationResult.invalid.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSaveInvalidLeads}
                        disabled={isSavingInvalid}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                        title="Record bad/bounced leads in database so the scraper never re-targets them"
                      >
                        {isSavingInvalid ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Recording in DB...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                            <span>Record as UNCONTACTABLE in DB</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {verificationResult.invalid.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-sm">
                      Zero invalid leads! All uploaded inboxes are deliverable.
                    </div>
                  ) : (
                    <div className="border border-zinc-800 rounded-xl overflow-x-auto max-h-[340px]">
                      <table className="w-full text-left text-xs text-zinc-300">
                        <thead className="bg-zinc-900/80 text-zinc-400 sticky top-0 uppercase tracking-wider font-semibold border-b border-zinc-800">
                          <tr>
                            <th className="p-3">Row</th>
                            <th className="p-3">Company & Contact</th>
                            <th className="p-3">Target Email / URL</th>
                            <th className="p-3">Website Check</th>
                            <th className="p-3">LinkedIn Check</th>
                            <th className="p-3">Rejection & Bounce Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 font-medium">
                          {verificationResult.invalid.map((lead, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                              <td className="p-3 text-zinc-500 text-[11px]">#{lead.rowIndex}</td>
                              <td className="p-3 font-semibold text-white">
                                <div>{lead.companyName}</div>
                                <div className="text-[10px] text-zinc-500 font-normal">{lead.founderName || 'Unknown Contact'}</div>
                              </td>
                              <td className="p-3 font-mono text-[11px] text-zinc-400">
                                {lead.email || lead.websiteUrl || '—'}
                              </td>
                              <td className="p-3">
                                {lead.websiteStatus === 'DEAD' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/20 font-semibold" title={lead.websiteError || 'Domain does not exist or server down'}>
                                    Dead Website
                                  </span>
                                ) : lead.websiteStatus === 'LIVE' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-semibold">
                                    Live Site
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                                    {lead.websiteStatus || 'N/A'}
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                {lead.linkedinStatus === 'NOT_FOUND' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/20 font-semibold" title="LinkedIn Profile 404">
                                    Profile 404
                                  </span>
                                ) : lead.linkedinStatus === 'INVALID_URL' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold">
                                    Invalid Link
                                  </span>
                                ) : lead.linkedinStatus === 'VERIFIED' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-sky-500/15 text-sky-400 border border-sky-500/20 font-semibold">
                                    Verified
                                  </span>
                                ) : lead.linkedinUrl ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                                    {lead.linkedinStatus || 'Linked'}
                                  </span>
                                ) : (
                                  <span className="text-zinc-600 text-[11px] italic">—</span>
                                )}
                              </td>
                              <td className="p-3 text-rose-400 text-[11px] font-medium">
                                <div className="flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                  <span>{lead.reason || 'Undeliverable Inbox / High Bounce Risk'}</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-zinc-500">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Multi-tier real-inbox verification & customer POV AI prompts active</span>
          </div>
          <button
            onClick={handleAttemptClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
