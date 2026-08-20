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
    <div className="bg-[#111116] border border-white/10 rounded-3xl p-7 shadow-2xl relative overflow-hidden flex flex-col justify-between">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-white">
            <Play className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Campaign Launcher</h2>
            <p className="text-xs text-gray-400">Configure parameters & trigger scraper</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Campaign Name
            </label>
            <input 
              type="text" 
              required
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
              placeholder="e.g. Q3 Real Estate Blitz"
            />
          </div>

          {/* Target Niche Dropdown from Pitch Templates */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center justify-between">
              <span>Target Niche</span>
              <span className="text-[10px] text-purple-400 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Pitch Templates Synced
              </span>
            </label>

            {/* Custom Dropdown Trigger Header */}
            <div 
              onClick={() => setIsOpen(!isOpen)}
              className={`w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm cursor-pointer flex items-center justify-between transition-all hover:border-indigo-500/40 ${
                isOpen ? 'ring-2 ring-indigo-500/50 border-indigo-500' : ''
              }`}
            >
              {niche ? (
                <span className="font-medium text-indigo-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  {niche}
                </span>
              ) : (
                <span className="text-gray-500">Select or type a niche template...</span>
              )}
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`} />
            </div>

            {/* Custom Dropdown Menu */}
            {isOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-[#16161d] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
                
                {/* Search / Manual Input Field */}
                <div className="p-3 border-b border-white/10 bg-black/40">
                  <input 
                    type="text"
                    placeholder="Search or enter custom niche..."
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    className="w-full bg-[#20202b] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Templates Options List */}
                <div className="max-h-56 overflow-y-auto divide-y divide-white/5 py-1">
                  {templates.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-gray-500 text-center">
                      No pitch templates available. Type a custom niche above.
                    </div>
                  ) : (
                    templates.map((template) => {
                      const isSelected = niche.toLowerCase() === template.niche_name.toLowerCase();
                      return (
                        <div
                          key={template.id || template.niche_name}
                          onClick={() => handleSelectTemplate(template)}
                          className={`px-4 py-3 hover:bg-indigo-600/15 cursor-pointer transition-colors flex items-center justify-between group ${
                            isSelected ? 'bg-indigo-500/15 text-indigo-200 font-semibold' : 'text-gray-300'
                          }`}
                        >
                          <div className="space-y-0.5 pr-3">
                            <div className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors flex items-center gap-2">
                              {template.niche_name}
                            </div>
                            <p className="text-[11px] text-gray-400 line-clamp-1">
                              {template.pain_points}
                            </p>
                          </div>

                          {isSelected && (
                            <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Bottom Footer Action */}
                <div className="p-2 border-t border-white/10 bg-black/30 text-center">
                  <a 
                    href="/templates" 
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold inline-flex items-center gap-1"
                  >
                    + Manage & Create Pitch Templates
                  </a>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Location</label>
            <input 
              type="text" 
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
              placeholder="e.g. Miami, Florida"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Start Date</label>
            <input 
              type="date" 
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm [color-scheme:dark]"
            />
          </div>

          {startDate && (
            <div className="p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-sm text-indigo-200 flex justify-between items-center animate-in fade-in zoom-in duration-300">
              <span>Auto-expires:</span>
              <span className="font-bold bg-indigo-500/20 px-2 py-1 rounded-md">
                {new Date(new Date(startDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
              </span>
            </div>
          )}
          
          <button 
            type="submit"
            disabled={isScraping || !niche}
            className="w-full py-3.5 mt-4 bg-white hover:bg-gray-200 disabled:opacity-50 text-black rounded-xl font-bold shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" fill="currentColor" />
            {isScraping ? 'Deploying Scraper...' : 'Save & Discovery Scrape'}
          </button>
        </form>
      </div>
    </div>
  );
}
