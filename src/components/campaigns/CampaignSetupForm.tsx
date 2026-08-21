"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Play, ChevronDown, Check, Layers, Sparkles } from 'lucide-react';
import { PitchTemplate } from '@/types/database';

interface CampaignSetupFormProps {
  isScraping: boolean;
  onSubmit: (data: { campaignName: string; niche: string; location: string; startDate: string }) => Promise<void>;
}

export function CampaignSetupForm({ isScraping, onSubmit }: CampaignSetupFormProps) {
  const [campaignName, setCampaignName] = useState('');
  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  
  // Custom Dropdown State
  const [templates, setTemplates] = useState<PitchTemplate[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/templates');
        const data = await res.json();
        if (data.templates) {
          setTemplates(data.templates);
        }
      } catch (err) {
        console.error('Failed to load templates for campaign form:', err);
      }
    };
    fetchTemplates();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !niche) return;
    await onSubmit({ campaignName, niche, location, startDate });
    setCampaignName('');
    setNiche('');
    setLocation('');
    setStartDate('');
  };

  const handleSelectTemplate = (template: PitchTemplate) => {
    setNiche(template.niche_name);
    setIsOpen(false);
  };

  return (
    <div className="bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl p-6 shadow-xl shadow-black/20 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/[0.02] rounded-full blur-3xl pointer-events-none" />
      
      <div>
        <div className="flex items-center gap-3.5 mb-6">
          <div className="p-2.5 bg-white/[0.02] ring-1 ring-white/[0.06] rounded-xl text-slate-300">
            <Play className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-medium tracking-tight text-slate-200">Campaign Launcher</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Configure parameters & trigger scraper</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-normal text-slate-400 mb-1.5 tracking-normal">
              Campaign Name
            </label>
            <input 
              type="text" 
              required
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full bg-white/[0.03] hover:bg-white/[0.04] focus:bg-white/[0.05] focus:ring-1 focus:ring-indigo-400/30 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none transition-all duration-200 text-xs border border-transparent"
              placeholder="e.g. Q3 Real Estate Blitz"
            />
          </div>

          {/* Target Niche Dropdown from Pitch Templates */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-normal text-slate-400 mb-1.5 tracking-normal flex items-center justify-between">
              <span>Target Niche</span>
              <span className="text-[10px] text-purple-300/80 font-normal flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400/80" /> Templates Synced
              </span>
            </label>

            {/* Custom Dropdown Trigger Header */}
            <div 
              onClick={() => setIsOpen(!isOpen)}
              className={`w-full bg-white/[0.03] hover:bg-white/[0.04] focus:bg-white/[0.05] rounded-xl px-4 py-2.5 text-slate-200 text-xs cursor-pointer flex items-center justify-between transition-all duration-200 border border-transparent ${
                isOpen ? 'ring-1 ring-indigo-400/30 bg-white/[0.05]' : ''
              }`}
            >
              {niche ? (
                <span className="font-normal text-indigo-200 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-purple-400/80" />
                  {niche}
                </span>
              ) : (
                <span className="text-slate-600">Select or type a niche template...</span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`} />
            </div>

            {/* Custom Dropdown Menu */}
            {isOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-[#0E1017]/95 ring-1 ring-white/[0.08] rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 p-1.5">
                
                {/* Search / Manual Input Field */}
                <div className="p-2 border-b border-white/[0.04] bg-black/20">
                  <input 
                    type="text"
                    placeholder="Search or enter custom niche..."
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    className="w-full bg-white/[0.03] focus:ring-1 focus:ring-indigo-400/30 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none border border-transparent"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Templates Options List */}
                <div className="max-h-52 overflow-y-auto divide-y divide-white/[0.03] py-1">
                  {templates.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-500 text-center">
                      No pitch templates available. Type a custom niche above.
                    </div>
                  ) : (
                    templates.map((template) => {
                      const isSelected = niche.toLowerCase() === template.niche_name.toLowerCase();
                      return (
                        <div
                          key={template.id || template.niche_name}
                          onClick={() => handleSelectTemplate(template)}
                          className={`px-3.5 py-2.5 hover:bg-white/[0.04] cursor-pointer transition-colors flex items-center justify-between rounded-xl group ${
                            isSelected ? 'bg-indigo-500/10 text-indigo-200 font-normal' : 'text-slate-300'
                          }`}
                        >
                          <div className="space-y-0.5 pr-3">
                            <div className="text-xs font-medium text-slate-200 group-hover:text-indigo-300 transition-colors flex items-center gap-2">
                              {template.niche_name}
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-1">
                              {template.pain_points}
                            </p>
                          </div>

                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Bottom Footer Action */}
                <div className="p-2 border-t border-white/[0.04] text-center">
                  <a 
                    href="/templates" 
                    className="text-[11px] text-purple-300/80 hover:text-purple-200 font-normal inline-flex items-center gap-1"
                  >
                    + Manage & Create Pitch Templates
                  </a>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-normal text-slate-400 mb-1.5 tracking-normal">Location</label>
            <input 
              type="text" 
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-white/[0.03] hover:bg-white/[0.04] focus:bg-white/[0.05] focus:ring-1 focus:ring-indigo-400/30 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none transition-all duration-200 text-xs border border-transparent"
              placeholder="e.g. Miami, Florida"
            />
          </div>

          <div>
            <label className="block text-xs font-normal text-slate-400 mb-1.5 tracking-normal">Start Date</label>
            <input 
              type="date" 
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-white/[0.03] hover:bg-white/[0.04] focus:bg-white/[0.05] focus:ring-1 focus:ring-indigo-400/30 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-600 focus:outline-none transition-all duration-200 text-xs [color-scheme:dark] border border-transparent"
            />
          </div>

          {startDate && (
            <div className="p-3 bg-indigo-500/10 rounded-xl ring-1 ring-indigo-500/15 text-xs text-indigo-300 flex justify-between items-center animate-in fade-in duration-200">
              <span className="text-slate-400">Auto-expires:</span>
              <span className="font-medium bg-indigo-500/20 px-2 py-0.5 rounded-md text-indigo-200 text-[11px]">
                {new Date(new Date(startDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
              </span>
            </div>
          )}
          
          <button 
            type="submit"
            disabled={isScraping || !niche}
            className="w-full py-3 mt-4 bg-gradient-to-r from-indigo-500/90 to-indigo-600/90 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-40 text-white rounded-full font-medium shadow-md shadow-indigo-950/30 transition-all duration-200 ease-out flex items-center justify-center gap-2 text-xs"
          >
            <Play className="w-3.5 h-3.5" fill="currentColor" />
            {isScraping ? 'Deploying Scraper...' : 'Save & Discovery Scrape'}
          </button>
        </form>
      </div>
    </div>
  );
}
