'use client';

import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { UploadCloud, FileType, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function CsvImporter() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchCampaigns() {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setCampaigns(data);
        if (data.length > 0) {
          setSelectedCampaign(data[0].id);
        }
      }
    }
    fetchCampaigns();
  }, []);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv')) {
      setFile(selectedFile);
      setStatus({ type: 'idle', message: '' });
    } else {
      setStatus({ type: 'error', message: 'Please upload a valid CSV file.' });
    }
  };

  const findValue = (row: any, possibleKeys: string[]) => {
    const key = Object.keys(row).find(k => possibleKeys.some(pk => pk.toLowerCase() === k.toLowerCase()));
    return key ? row[key] : null;
  };

  const processFile = () => {
    if (!file || !selectedCampaign) return;

    setIsProcessing(true);
    setStatus({ type: 'idle', message: '' });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const mappedData = results.data.map((row: any) => {
            const websiteUrl = findValue(row, ['Website', 'Company Website', 'Domain', 'URL']);
            const companyName = findValue(row, ['Company', 'Company Name', 'Organization']);
            const firstName = findValue(row, ['First Name']);
            const lastName = findValue(row, ['Last Name']);
            let founderName = findValue(row, ['Full Name']);
            
            if (!founderName && (firstName || lastName)) {
              founderName = `${firstName || ''} ${lastName || ''}`.trim();
            }

            const linkedinUrl = findValue(row, ['Company Linkedin Url', 'Person Linkedin Url', 'Linkedin']);

            return {
              websiteUrl,
              companyName,
              founderName,
              linkedinUrl,
              rawData: row // Store the rest just in case
            };
          }).filter(item => item.websiteUrl); // Only keep rows with at least a website URL

          if (mappedData.length === 0) {
            setStatus({ type: 'error', message: 'No valid rows found. Ensure CSV has Website/URL column.' });
            setIsProcessing(false);
            return;
          }

          const response = await fetch('/api/campaigns/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              campaignId: selectedCampaign,
              leads: mappedData
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to import data');
          }

          setStatus({ type: 'success', message: `Successfully imported ${mappedData.length} domains into pipeline.` });
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error: any) {
          setStatus({ type: 'error', message: error.message || 'An error occurred during processing.' });
        } finally {
          setIsProcessing(false);
        }
      },
      error: (error) => {
        setStatus({ type: 'error', message: `CSV Parse Error: ${error.message}` });
        setIsProcessing(false);
      }
    });
  };

  return (
    <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">CSV Bulk Import</h2>
        <p className="text-zinc-400 text-sm">Upload pre-filtered domains to bypass Phase 1 discovery and go straight into the enrichment pipeline.</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Target Campaign</label>
          <select
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            disabled={isProcessing || campaigns.length === 0}
          >
            {campaigns.length === 0 ? (
              <option value="">No active campaigns found</option>
            ) : (
              campaigns.map(campaign => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-all cursor-pointer ${
            isDragging 
              ? 'border-blue-500 bg-blue-500/10' 
              : file 
                ? 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800' 
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900'
          } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileInput}
          />
          
          {file ? (
            <div className="flex flex-col items-center space-y-3">
              <div className="p-3 bg-blue-500/10 rounded-full text-blue-400">
                <FileType className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white">{file.name}</p>
                <p className="text-xs text-zinc-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-3 text-center">
              <div className="p-3 bg-zinc-800 rounded-full text-zinc-400 group-hover:text-zinc-300">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Click or drag CSV to upload</p>
                <p className="text-xs text-zinc-500 mt-1">Supports Apollo, ZoomInfo, or Prospeo exports</p>
              </div>
            </div>
          )}
        </div>

        {status.message && (
          <div className={`p-4 rounded-lg flex items-start space-x-3 text-sm ${
            status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
            status.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : ''
          }`}>
            {status.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <p>{status.message}</p>
          </div>
        )}

        <button
          onClick={processFile}
          disabled={!file || !selectedCampaign || isProcessing}
          className="w-full flex items-center justify-center space-x-2 bg-white text-black hover:bg-zinc-200 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Running Deep Enrichment & AI...</span>
            </>
          ) : (
            <span>Import & Start Processing</span>
          )}
        </button>
      </div>
    </div>
  );
}
