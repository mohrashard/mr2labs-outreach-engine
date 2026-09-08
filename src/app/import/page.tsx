'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Papa from 'papaparse';
import { 
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Clock, 
  ExternalLink, ShieldCheck, AlertTriangle, Loader2, 
  Building2, User, Mail, Globe, Sparkles, 
  Check, RotateCcw, ArrowRight, Download, Info, Search,
  ArrowLeft, Copy, CheckCheck, Layers, Activity
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import PauseSendingButton from '@/components/PauseSendingButton';

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

export default function CsvImportPage() {
  // Campaign State
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('pool');

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
  const [activeTab, setActiveTab] = useState<'verified' | 'existing' | 'invalid'>('verified');

  // Search filter within results
  const [tableSearch, setTableSearch] = useState('');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  // Verification Result Data
  const [verificationResult, setVerificationResult] = useState<{
    summary: {
      totalUploaded: number;
      verifiedCount: number;
      autoHealedCount: number;
      existingCount: number;
      alreadySentCount: number;
      invalidCount: number;
    };
    verified: any[];
    existing: any[];
    invalid: any[];
  } | null>(null);

  // Selected Verified Leads for Ingestion
  const [selectedVerifiedIndices, setSelectedVerifiedIndices] = useState<Set<number>>(new Set());
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch campaigns
  useEffect(() => {
    async function fetchCampaigns() {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, is_active, niche, location')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setCampaigns(data);
        const firstActive = data.find(c => c.is_active);
        setSelectedCampaign(firstActive ? firstActive.id : (data[0]?.id || 'pool'));
      } else {
        setSelectedCampaign('pool');
      }
    }
    fetchCampaigns();
  }, []);

  // Guard against browser close during active run
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isVerifying || isSaving || isSavingInvalid) {
        e.preventDefault();
        e.returnValue = 'CSV verification or ingestion is currently active. If you navigate away or close this tab, processing will stop.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isVerifying, isSaving, isSavingInvalid]);

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
        text: 'Unsupported file format! Please upload a .csv file. (If using Excel or Google Sheets, click "File > Download / Export As > CSV").' 
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
            text: 'Warning: Could not detect headers for Business Name, Website, or Email in this CSV. Please review your file headers or use our sample template.'
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

    const BATCH_SIZE = 5; // 5-lead micro-batching strictly prevents Vercel Hobby 10s timeouts
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
    const SAVE_BATCH_SIZE = 4; // Safe ceiling for AI pitch generation on Vercel Hobby tier
    let totalSaved = 0;

    try {
      for (let i = 0; i < totalToSave; i += SAVE_BATCH_SIZE) {
        const chunk = leadsToSave.slice(i, i + SAVE_BATCH_SIZE);
        const currentBatchEnd = Math.min(i + SAVE_BATCH_SIZE, totalToSave);
        
        setSavingProgress({ current: currentBatchEnd, total: totalToSave });
        setStatusMessage({
          type: 'success',
          text: `Persisting verified leads & crafting customer-POV AI pitches (${currentBatchEnd} of ${totalToSave})...`
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
        text: `Success! Successfully saved all ${totalSaved} verified leads with bespoke AI cold pitches! They are ready in the database.` 
      });
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
        text: `Recorded ${totalSaved} invalid leads as UNCONTACTABLE / INVALID_DOMAIN. Future scrapers will automatically skip them.`
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
    setTableSearch('');
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(text);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // Filtered Leads based on search
  const filteredVerified = useMemo(() => {
    if (!verificationResult) return [];
    if (!tableSearch.trim()) return verificationResult.verified;
    const term = tableSearch.toLowerCase();
    return verificationResult.verified.filter(l => 
      (l.companyName || '').toLowerCase().includes(term) ||
      (l.founderName || '').toLowerCase().includes(term) ||
      (l.email || '').toLowerCase().includes(term) ||
      (l.websiteUrl || '').toLowerCase().includes(term) ||
      (l.painPoint || '').toLowerCase().includes(term)
    );
  }, [verificationResult, tableSearch]);

  const filteredExisting = useMemo(() => {
    if (!verificationResult) return [];
    if (!tableSearch.trim()) return verificationResult.existing;
    const term = tableSearch.toLowerCase();
    return verificationResult.existing.filter(l => 
      (l.companyName || '').toLowerCase().includes(term) ||
      (l.email || '').toLowerCase().includes(term) ||
      (l.founderName || '').toLowerCase().includes(term)
    );
  }, [verificationResult, tableSearch]);

  const filteredInvalid = useMemo(() => {
    if (!verificationResult) return [];
    if (!tableSearch.trim()) return verificationResult.invalid;
    const term = tableSearch.toLowerCase();
    return verificationResult.invalid.filter(l => 
      (l.companyName || '').toLowerCase().includes(term) ||
      (l.email || '').toLowerCase().includes(term) ||
      (l.websiteUrl || '').toLowerCase().includes(term) ||
      (l.reason || '').toLowerCase().includes(term)
    );
  }, [verificationResult, tableSearch]);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-200 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 pb-24 relative">
      
      {/* Ambient background aura */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/3 w-[600px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 right-10 w-[450px] h-[450px] bg-violet-600/10 rounded-full blur-[140px]" />
      </div>

      {/* Top Header Navigation */}
      <header className="border-b border-white/[0.05] bg-[#07090e]/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-col md:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center gap-3.5">
            <Link 
              href="/"
              className="p-2 bg-white/[0.03] hover:bg-white/[0.08] ring-1 ring-white/10 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
              title="Return to Main Engine"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <Image 
              src="/mr-squared-logo.png" 
              alt="MR² Labs Logo" 
              width={34} 
              height={34} 
              className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/10 shadow-sm" 
            />

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
                  CSV Lead Intelligence & Verifier Desk
                </h1>
                <span className="text-[10px] font-medium px-2 py-0.5 bg-violet-500/10 text-violet-300 rounded-full border border-violet-500/20">
                  Full-Screen Workspace
                </span>
                <span className="hidden sm:inline-flex text-[10px] font-medium px-2 py-0.5 bg-emerald-500/10 text-emerald-300 rounded-full border border-emerald-500/20">
                  🛡️ Vercel Hobby Shielded
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Bulk CSV ingest, multi-tier deliverability verification, auto-healing & AI pitch generation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <PauseSendingButton />

            <Link 
              href="/dashboard/leads"
              className="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-full font-medium text-xs transition-colors duration-200 flex items-center gap-1.5 border border-emerald-500/20"
            >
              <span>🎯 Leads Desk</span>
            </Link>

            <Link 
              href="/campaigns"
              className="px-3.5 py-2 hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 rounded-full font-normal text-xs transition-colors duration-200 flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Campaigns</span>
            </Link>

            <Link 
              href="/startups"
              className="px-3.5 py-2 hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 rounded-full font-normal text-xs transition-colors duration-200 flex items-center gap-1.5"
            >
              <span>🚀 Startup Engine</span>
            </Link>

            <button
              onClick={downloadSampleCsv}
              className="px-3.5 py-2 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white rounded-full font-medium text-xs transition-colors flex items-center gap-1.5 border border-white/10"
              title="Download pre-formatted CSV template"
            >
              <Download className="w-3.5 h-3.5 text-violet-400" />
              <span>Sample CSV</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8 relative z-10">

        {/* Banner Alert Notification */}
        {statusMessage && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-medium backdrop-blur-xl shadow-xl animate-in fade-in slide-in-from-top-3 duration-200 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          }`}>
            <div className="flex items-center space-x-3">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>

            {statusMessage.type === 'success' && (
              <Link 
                href="/dashboard/leads"
                className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-semibold flex items-center gap-1 border border-emerald-500/30 transition-colors"
              >
                <span>Go to Leads Desk</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        )}

        {/* Campaign Target Selection & Settings Bar */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-white/[0.07] backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" />
              <span>Target Campaign Ingestion Destination</span>
            </label>
            <p className="text-xs text-slate-400">
              Verified leads will be assigned here with status <strong className="text-emerald-400">NEW</strong>. If a campaign is paused, leads remain safely stored in DB for future activation.
            </p>
          </div>

          <div className="flex flex-col sm:items-end">
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 text-white text-xs rounded-xl px-3.5 py-2.5 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 md:w-84 shadow-inner"
            >
              <option value="pool">📁 Default Lead Pool (Unassigned / General Ingestion)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.is_active ? '🟢 (Active)' : '⏸️ (Paused)'}
                </option>
              ))}
            </select>
            {selectedCampaign !== 'pool' && campaigns.find(c => c.id === selectedCampaign && !c.is_active) && (
              <span className="text-[11px] text-amber-400/90 mt-1.5 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Campaign is currently paused. Leads will be saved as <strong>NEW</strong> for future dispatch.</span>
              </span>
            )}
          </div>
        </div>

        {/* STEP 1: Upload & Schema Detection */}
        {!verificationResult && (
          <div className="space-y-6">
            
            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 relative overflow-hidden ${
                isDragging
                  ? 'border-violet-500 bg-violet-500/10 scale-[0.99] shadow-2xl shadow-violet-950/40'
                  : file
                  ? 'border-emerald-500/40 bg-emerald-950/10'
                  : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-900/40 shadow-xl'
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
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
                    <FileSpreadsheet className="w-7 h-7" />
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="text-base font-bold text-white">{file.name}</p>
                    <p className="text-xs text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB • <span className="text-emerald-400 font-semibold">{rawRows.length} rows parsed</span>
                    </p>
                  </div>
                  <span className="text-xs text-violet-400 hover:underline pt-1">Click to select a different CSV file</span>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-400 flex items-center justify-center border border-violet-500/20 shadow-lg shadow-violet-500/10">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Drag & drop your CSV file here, or browse local files</p>
                    <p className="text-xs text-slate-400 max-w-md mt-1">
                      Upload prospect lists with business names, emails, live domains, custom pain points, and target solutions.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadSampleCsv();
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs text-slate-300 font-medium transition-colors border border-zinc-700 shadow-sm cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-violet-400" />
                      <span>Download Sample CSV Template</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Schema Inspector & Tolerance Matrix */}
            {rawRows.length > 0 && (
              <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/[0.07] space-y-5 shadow-2xl backdrop-blur-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      <span>Detected Column Schema ({rawRows.length} total prospect rows)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Columns are auto-mapped into the verification engine and AI pitch generator.
                    </p>
                  </div>
                  <button
                    onClick={resetAll}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear File</span>
                  </button>
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
                        className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                          detected 
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
                            : 'bg-zinc-950/50 border-zinc-800 text-zinc-400'
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
                          <span className="text-[9px] text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded border border-violet-500/25 font-medium shrink-0 ml-1 flex items-center gap-1" title="Will be auto-discovered by AI from live website">
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
                          <span className="text-[9px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-medium shrink-0 ml-1">
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

                {/* Tolerance Notice Card */}
                {hasAnyCrucialColumn ? (
                  <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs text-slate-300 flex items-start gap-3">
                    <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <strong className="text-white">Intelligent Format Tolerance:</strong> Missing <span className="text-violet-300 font-medium">Founder Name</span> or <span className="text-violet-300 font-medium">Mr² Labs Solution</span> columns will NOT reject your leads! Our AI agent crawls the live domain to discover decision makers and generates bespoke customer-POV pitches automatically.
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Unrecognized Column Headers</span>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed">
                      We could not detect standard columns for <strong>Business Name</strong>, <strong>Website</strong>, or <strong>Email</strong> in this file. Download our sample template to see supported header names.
                    </p>
                  </div>
                )}

                {/* 360-Degree Waterfall Pillars */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-start gap-3 text-xs">
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block">Domain Probing</strong>
                      <span className="text-slate-400">Checks live DNS, HTTP 200 responses & redirects.</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-start gap-3 text-xs">
                    <LinkedinIcon className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block">Decision Maker Validation</strong>
                      <span className="text-slate-400">Validates active LinkedIn profiles & founder roles.</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-start gap-3 text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block">Deliverability Shield</strong>
                      <span className="text-slate-400">MX record & Verifalia validation to prevent bounces.</span>
                    </div>
                  </div>
                </div>

                {/* Live Micro-Batch Verification Load Bar */}
                {isVerifying && verificationProgress && (
                  <div className="p-6 rounded-2xl bg-zinc-950/90 border border-violet-500/40 shadow-2xl shadow-violet-950/40 space-y-4 animate-in fade-in duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-3">
                        <span className="relative flex h-3.5 w-3.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-violet-500"></span>
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <span>Verifying Inboxes & Probing Domains</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                              Batch {verificationProgress.currentBatch} of {verificationProgress.totalBatches}
                            </span>
                          </h4>
                          <p className="text-xs text-slate-400 truncate max-w-lg font-mono">
                            {verificationProgress.currentLeadName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-baseline sm:flex-col sm:items-end gap-2 sm:gap-0">
                        <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-emerald-400 font-mono">
                          {verificationProgress.percent}%
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          {verificationProgress.processed} of {verificationProgress.total} checked
                        </div>
                      </div>
                    </div>

                    {/* Gradient Progress Bar */}
                    <div className="w-full bg-zinc-800 rounded-full h-3.5 p-0.5 overflow-hidden border border-zinc-700/60 shadow-inner">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-violet-600 via-indigo-500 to-emerald-400 transition-all duration-300 ease-out relative overflow-hidden shadow-lg shadow-violet-500/40"
                        style={{ width: `${Math.max(verificationProgress.percent, 3)}%` }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      </div>
                    </div>

                    {/* Running Telemetry Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs font-mono">
                      <div className="px-3.5 py-2 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
                        <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified
                        </span>
                        <span className="font-bold text-emerald-300 text-sm">
                          {verificationProgress.verifiedSoFar}
                        </span>
                      </div>

                      <div className="px-3.5 py-2 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
                        <span className="text-amber-400 flex items-center gap-1.5 font-medium">
                          <Sparkles className="w-3.5 h-3.5" />
                          Rescued
                        </span>
                        <span className="font-bold text-amber-300 text-sm">
                          {verificationProgress.rescuedSoFar}
                        </span>
                      </div>

                      <div className="px-3.5 py-2 rounded-xl bg-indigo-950/30 border border-indigo-500/30 flex items-center justify-between">
                        <span className="text-indigo-400 flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          In Database
                        </span>
                        <span className="font-bold text-indigo-300 text-sm">
                          {verificationProgress.existingSoFar}
                        </span>
                      </div>

                      <div className="px-3.5 py-2 rounded-xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-between">
                        <span className="text-rose-400 flex items-center gap-1.5 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Excluded
                        </span>
                        <span className="font-bold text-rose-300 text-sm">
                          {verificationProgress.invalidSoFar}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Primary Action Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={runVerification}
                    disabled={isVerifying || rawRows.length === 0 || !hasAnyCrucialColumn}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white font-semibold text-sm flex items-center space-x-2 shadow-xl shadow-violet-600/25 transition-all cursor-pointer"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying Inboxes ({verificationProgress?.processed || 0}/{rawRows.length})...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify Inboxes & Probe Leads</span>
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </button>
                </div>

              </div>
            )}

          </div>
        )}

        {/* STEP 2: Full-Screen Leads Verification Desk */}
        {verificationResult && (
          <div className="space-y-6">

            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Card 1: Verified */}
              <div 
                onClick={() => setActiveTab('verified')}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  activeTab === 'verified'
                    ? 'bg-emerald-950/30 border-emerald-500/50 ring-1 ring-emerald-500/50 shadow-xl'
                    : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Verified & Deliverable
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {verificationResult.summary.verifiedCount}
                  </span>
                </div>
                <p className="text-2xl font-bold text-white">{verificationResult.summary.verifiedCount} Ready to Save</p>
                {verificationResult.summary.autoHealedCount > 0 ? (
                  <p className="text-xs text-amber-300 font-medium mt-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{verificationResult.summary.autoHealedCount} rescued & auto-healed!</span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">Real inboxes confirmed deliverable via DNS & Verifalia.</p>
                )}
              </div>

              {/* Card 2: Already in DB */}
              <div 
                onClick={() => setActiveTab('existing')}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  activeTab === 'existing'
                    ? 'bg-amber-950/30 border-amber-500/50 ring-1 ring-amber-500/50 shadow-xl'
                    : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Already in Database
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {verificationResult.summary.existingCount}
                  </span>
                </div>
                <p className="text-2xl font-bold text-white">{verificationResult.summary.alreadySentCount} Already Sent</p>
                <p className="text-xs text-slate-400 mt-1">Active outreach sequences & follow-ups tracked below.</p>
              </div>

              {/* Card 3: Invalid / Bounced */}
              <div 
                onClick={() => setActiveTab('invalid')}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  activeTab === 'invalid'
                    ? 'bg-rose-950/30 border-rose-500/50 ring-1 ring-rose-500/50 shadow-xl'
                    : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Invalid / No Inbox
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {verificationResult.summary.invalidCount}
                  </span>
                </div>
                <p className="text-2xl font-bold text-white">{verificationResult.summary.invalidCount} Excluded</p>
                <p className="text-xs text-slate-400 mt-1">Undeliverable or missing mailboxes. Excluded to protect sender reputation.</p>
              </div>

            </div>

            {/* Navigation Tabs & In-Table Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-3">
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveTab('verified')}
                  className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
                    activeTab === 'verified'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <span>🟢 Deliverable Leads</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-500/20 text-emerald-300">
                    {verificationResult.verified.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('existing')}
                  className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
                    activeTab === 'existing'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <span>🟡 In Pipeline / Sent</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500/20 text-amber-300">
                    {verificationResult.existing.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('invalid')}
                  className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
                    activeTab === 'invalid'
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <span>🔴 Excluded Leads</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-rose-500/20 text-rose-300">
                    {verificationResult.invalid.length}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search prospect table..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 text-white rounded-xl text-xs outline-none focus:border-violet-500 w-52 sm:w-64 placeholder:text-slate-500"
                  />
                </div>

                <button
                  onClick={resetAll}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Upload Another CSV</span>
                </button>
              </div>
            </div>

            {/* TAB 1: Verified Leads Full-Width Table */}
            {activeTab === 'verified' && (
              <div className="space-y-4">
                {filteredVerified.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 text-sm bg-zinc-900/20 rounded-2xl border border-zinc-800/60">
                    No deliverable leads matched your filter. Check the "Excluded" or "In Pipeline" tabs.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={selectedVerifiedIndices.size === verificationResult.verified.length}
                          onChange={toggleSelectAllVerified}
                          className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        />
                        <span className="font-medium">
                          Select All ({selectedVerifiedIndices.size} selected of {verificationResult.verified.length})
                        </span>
                      </div>
                      <span>Selected leads will be ingested into campaign with bespoke customer-POV AI cold email pitches.</span>
                    </div>

                    <div className="border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl bg-zinc-950/60 backdrop-blur-xl">
                      <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-zinc-900/90 text-slate-400 sticky top-0 uppercase tracking-wider font-semibold border-b border-zinc-800 backdrop-blur-md">
                            <tr>
                              <th className="p-3.5 w-10"></th>
                              <th className="p-3.5">Row</th>
                              <th className="p-3.5">Company & Live Website</th>
                              <th className="p-3.5">Verified Deliverable Mailbox</th>
                              <th className="p-3.5">Founder / Contact LinkedIn</th>
                              <th className="p-3.5">Pain Point & Mr² Offer</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60 font-medium">
                            {filteredVerified.map((lead, idx) => {
                              const originalIdx = lead.rowIndex - 1;
                              const isChecked = selectedVerifiedIndices.has(originalIdx);
                              return (
                                <tr 
                                  key={idx}
                                  className={`hover:bg-zinc-900/50 transition-colors ${isChecked ? 'bg-emerald-950/[0.08]' : ''}`}
                                >
                                  <td className="p-3.5">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleSelectVerified(originalIdx)}
                                      className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                    />
                                  </td>
                                  <td className="p-3.5 text-slate-500 text-[11px] font-mono">#{lead.rowIndex}</td>
                                  
                                  {/* Company & Live Domain */}
                                  <td className="p-3.5 font-semibold text-white">
                                    <div className="flex items-center gap-2">
                                      <span>{lead.companyName}</span>
                                      {lead.websiteUrl && (
                                        <a 
                                          href={lead.websiteUrl} 
                                          target="_blank" 
                                          rel="noreferrer" 
                                          className="text-slate-400 hover:text-white"
                                          title="Open live website"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="text-[10px] text-emerald-400 font-mono">
                                        {lead.websiteUrl ? new URL(lead.websiteUrl.startsWith('http') ? lead.websiteUrl : `https://${lead.websiteUrl}`).hostname.replace('www.', '') : '—'}
                                      </span>
                                      {lead.autoHealed?.domain && (
                                        <span className="text-[9px] text-amber-300 font-medium bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20">
                                          Auto-Resolved
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Deliverable Email */}
                                  <td className="p-3.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-emerald-300 text-xs font-bold">{lead.email}</span>
                                      <button 
                                        onClick={() => copyToClipboard(lead.email)}
                                        className="text-slate-500 hover:text-slate-300 transition-colors"
                                        title="Copy email"
                                      >
                                        {copiedEmail === lead.email ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1 mt-1">
                                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-semibold">
                                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                        <span>Real Mailbox</span>
                                      </span>
                                      {lead.autoHealed?.email && (
                                        <span className="text-[9px] text-amber-300 font-medium bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                          Rescued
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Founder & LinkedIn */}
                                  <td className="p-3.5">
                                    <div className="font-medium text-white text-xs">{lead.founderName || 'Decision Maker'}</div>
                                    {lead.linkedinUrl ? (
                                      <a 
                                        href={lead.linkedinUrl} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 mt-0.5"
                                      >
                                        <LinkedinIcon className="w-3 h-3" />
                                        <span>Verified Profile</span>
                                        <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    ) : (
                                      <span className="text-[10px] text-violet-300 bg-violet-500/10 px-1.5 py-0.2 rounded border border-violet-500/20 font-medium inline-block mt-0.5">
                                        AI Auto-Discovering
                                      </span>
                                    )}
                                  </td>

                                  {/* Custom Pain & Solution */}
                                  <td className="p-3.5 max-w-xs">
                                    {lead.painPoint && (
                                      <div className="text-[11px] text-slate-300 line-clamp-1 mb-0.5" title={lead.painPoint}>
                                        <strong className="text-slate-400">Pain:</strong> {lead.painPoint}
                                      </div>
                                    )}
                                    {lead.mr2Solution && (
                                      <div className="text-[11px] text-violet-300 line-clamp-1" title={lead.mr2Solution}>
                                        <strong className="text-violet-400">Offer:</strong> {lead.mr2Solution}
                                      </div>
                                    )}
                                    {!lead.painPoint && !lead.mr2Solution && (
                                      <span className="text-slate-500 italic text-[11px]">AI auto-tailored customer pitch</span>
                                    )}
                                  </td>

                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Ingestion & AI Pitch Generation Action Bar */}
                    <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-xl shadow-xl">
                      <div className="space-y-1">
                        <div className="text-xs text-slate-300">
                          <span className="font-bold text-emerald-400 text-sm">{selectedVerifiedIndices.size}</span> verified prospects selected for ingestion.
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Micro-batched in groups of 4 leads to guarantee smooth Vercel Hobby execution.
                        </p>
                      </div>

                      <button
                        onClick={handleSaveVerifiedLeads}
                        disabled={isSaving || selectedVerifiedIndices.size === 0}
                        className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white font-semibold text-sm flex items-center space-x-2 shadow-xl shadow-emerald-600/25 transition-all cursor-pointer shrink-0"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>
                              {savingProgress ? `Saving (${savingProgress.current}/${savingProgress.total})...` : 'Generating AI Pitches...'}
                            </span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Save {selectedVerifiedIndices.size} Verified Leads & Craft AI Pitches</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 2: Already in DB / Prior Outreach Table */}
            {activeTab === 'existing' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="leading-relaxed">
                    <strong>Prospects Already in Outreach Pipeline:</strong> These leads were previously discovered or imported. They are tracked with their live cold email sequence status, sent timestamp, and follow-up step below.
                  </div>
                </div>

                {filteredExisting.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 text-sm bg-zinc-900/20 rounded-2xl border border-zinc-800/60">
                    No matching pipeline leads found.
                  </div>
                ) : (
                  <div className="border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl bg-zinc-950/60 backdrop-blur-xl">
                    <div className="overflow-x-auto max-h-[500px]">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-zinc-900/90 text-slate-400 sticky top-0 uppercase tracking-wider font-semibold border-b border-zinc-800 backdrop-blur-md">
                          <tr>
                            <th className="p-3.5">Row</th>
                            <th className="p-3.5">Company & Contact</th>
                            <th className="p-3.5">Email Address</th>
                            <th className="p-3.5">Sequence Status</th>
                            <th className="p-3.5">Step #</th>
                            <th className="p-3.5">Last Contacted</th>
                            <th className="p-3.5">Cold Pitch Subject</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 font-medium">
                          {filteredExisting.map((lead, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/50 transition-colors">
                              <td className="p-3.5 text-slate-500 text-[11px] font-mono">#{lead.rowIndex}</td>
                              <td className="p-3.5 font-semibold text-white">
                                <div>{lead.companyName}</div>
                                <div className="text-[10px] text-slate-500 font-normal">{lead.founderName || 'Contact'}</div>
                              </td>
                              <td className="p-3.5 font-mono text-slate-300">{lead.email}</td>
                              <td className="p-3.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  lead.dbStatus === 'SENT' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                  lead.dbStatus === 'REPLIED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                  lead.dbStatus === 'QUEUED' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                                  'bg-zinc-800 text-zinc-300 border-zinc-700'
                                }`}>
                                  {lead.dbStatus}
                                </span>
                              </td>
                              <td className="p-3.5 text-slate-300 text-[11px]">{lead.followUpStepLabel}</td>
                              <td className="p-3.5">
                                <div className="text-slate-200 text-[11px]">{lead.relativeTime}</div>
                                {lead.sentAt && (
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {new Date(lead.sentAt).toLocaleDateString()}
                                  </div>
                                )}
                              </td>
                              <td className="p-3.5 max-w-xs truncate text-slate-400" title={lead.emailSubject || ''}>
                                {lead.emailSubject || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Invalid / Excluded Leads Table */}
            {activeTab === 'invalid' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                    <div className="leading-relaxed">
                      <strong>Undeliverable / Dead Mailboxes Excluded:</strong> These records failed domain DNS, had no valid mailbox, or had dead links. They are excluded from active campaigns to protect sender score.
                    </div>
                  </div>

                  {verificationResult.invalid.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSaveInvalidLeads}
                      disabled={isSavingInvalid}
                      className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shrink-0"
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

                {filteredInvalid.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 text-sm bg-zinc-900/20 rounded-2xl border border-zinc-800/60">
                    Zero invalid leads in this CSV! All uploaded inboxes are deliverable.
                  </div>
                ) : (
                  <div className="border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl bg-zinc-950/60 backdrop-blur-xl">
                    <div className="overflow-x-auto max-h-[500px]">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-zinc-900/90 text-slate-400 sticky top-0 uppercase tracking-wider font-semibold border-b border-zinc-800 backdrop-blur-md">
                          <tr>
                            <th className="p-3.5">Row</th>
                            <th className="p-3.5">Company & Contact</th>
                            <th className="p-3.5">Target Email / URL</th>
                            <th className="p-3.5">Domain Status</th>
                            <th className="p-3.5">LinkedIn Check</th>
                            <th className="p-3.5">Exclusion Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 font-medium">
                          {filteredInvalid.map((lead, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/50 transition-colors">
                              <td className="p-3.5 text-slate-500 text-[11px] font-mono">#{lead.rowIndex}</td>
                              <td className="p-3.5 font-semibold text-white">
                                <div>{lead.companyName}</div>
                                <div className="text-[10px] text-slate-500 font-normal">{lead.founderName || 'Unknown Contact'}</div>
                              </td>
                              <td className="p-3.5 font-mono text-slate-400">
                                {lead.email || lead.websiteUrl || '—'}
                              </td>
                              <td className="p-3.5">
                                {lead.websiteStatus === 'DEAD' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/20 font-semibold" title={lead.websiteError || 'Domain dead or DNS fail'}>
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
                              <td className="p-3.5">
                                {lead.linkedinStatus === 'NOT_FOUND' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/20 font-semibold">
                                    Profile 404
                                  </span>
                                ) : lead.linkedinStatus === 'INVALID_URL' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold">
                                    Invalid Link
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-[11px]">—</span>
                                )}
                              </td>
                              <td className="p-3.5 text-rose-400 text-[11px] font-medium">
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
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </main>

    </div>
  );
}
