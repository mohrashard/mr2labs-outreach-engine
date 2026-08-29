"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Layers, Plus, Play, Pause, Trash2, Edit3, ArrowLeft, RefreshCw, 
  MapPin, Target, Calendar, Activity, CheckCircle, AlertTriangle, X, ShieldCheck
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  niche: string;
  location: string;
  daily_lead_limit: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
  created_at: string;
  total_leads?: number;
  new_leads?: number;
}

export default function CampaignManagerPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  
  // Modals & Action States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  
  // Form States
  const [formData, setFormData] = useState({
    name: '',
    niche: 'real estate',
    location: 'Houston, TX',
    daily_lead_limit: 20,
    end_date: ''
  });
  
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      if (res.ok && data.campaigns) {
        setCampaigns(data.campaigns);
      } else {
        showAlert('error', data.error || 'Failed to fetch campaigns');
      }
    } catch (err: any) {
      showAlert('error', err.message || 'Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.niche || !formData.location) {
      showAlert('error', 'Please fill in Name, Niche, and Target Location.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (res.ok) {
        showAlert('success', `Campaign "${data.name}" created successfully!`);
        setIsCreateOpen(false);
        setFormData({ name: '', niche: 'real estate', location: 'Houston, TX', daily_lead_limit: 20, end_date: '' });
        fetchCampaigns();
      } else {
        showAlert('error', data.error || 'Failed to create campaign');
      }
    } catch (err: any) {
      showAlert('error', err.message || 'Server error creating campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign) return;

    try {
      setSubmitting(true);
      const res = await fetch('/api/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCampaign.id,
          name: editingCampaign.name,
          niche: editingCampaign.niche,
          location: editingCampaign.location,
          daily_lead_limit: editingCampaign.daily_lead_limit,
          end_date: editingCampaign.end_date
        })
      });
      const data = await res.json();

      if (res.ok) {
        showAlert('success', `Campaign "${data.name}" updated successfully!`);
        setEditingCampaign(null);
        fetchCampaigns();
      } else {
        showAlert('error', data.error || 'Failed to update campaign');
      }
    } catch (err: any) {
      showAlert('error', err.message || 'Server error updating campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePause = async (campaign: Campaign) => {
    const nextState = !campaign.is_active;
    try {
      const res = await fetch('/api/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaign.id, is_active: nextState })
      });
      const data = await res.json();

      if (res.ok) {
        showAlert('success', `Campaign "${campaign.name}" is now ${nextState ? 'Active ▶️' : 'Paused ⏸️'}.`);
        setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, is_active: nextState } : c));
      } else {
        showAlert('error', data.error || 'Failed to update campaign status');
      }
    } catch (err: any) {
      showAlert('error', 'Error toggling campaign status');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (res.ok) {
        showAlert('success', 'Campaign deleted successfully.');
        setDeletingId(null);
        setCampaigns(prev => prev.filter(c => c.id !== id));
      } else {
        showAlert('error', data.error || 'Failed to delete campaign');
      }
    } catch (err: any) {
      showAlert('error', 'Error deleting campaign');
    }
  };

  const handleRunScraper = async (campaign: Campaign) => {
    try {
      setScrapingId(campaign.id);
      const res = await fetch('/api/campaigns/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id })
      });
      const data = await res.json();

      if (res.ok) {
        showAlert('success', data.message || `Scraper triggered for "${campaign.name}"!`);
      } else {
        showAlert('error', data.error || 'Failed to trigger scraper');
      }
    } catch (err: any) {
      showAlert('error', 'Error triggering campaign scraper');
    } finally {
      setScrapingId(null);
    }
  };

  const filteredCampaigns = campaigns.filter(c => {
    if (filter === 'active') return c.is_active;
    if (filter === 'paused') return !c.is_active;
    return true;
  });

  const totalActive = campaigns.filter(c => c.is_active).length;
  const totalPaused = campaigns.filter(c => !c.is_active).length;
  const totalDailyCap = campaigns.filter(c => c.is_active).reduce((acc, c) => acc + (c.daily_lead_limit || 20), 0);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* Background Subtle Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      {/* Top Header */}
      <header className="border-b border-white/[0.04] bg-[#07090e]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="p-2 bg-white/[0.03] hover:bg-white/[0.08] ring-1 ring-white/10 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 ring-1 ring-indigo-500/20 rounded-xl text-indigo-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-100 tracking-tight">Campaign Control Center</h1>
                <p className="text-xs text-slate-400">Manage, pause, trigger, and configure outreach campaigns</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-medium text-xs shadow-lg shadow-indigo-600/20 transition-all duration-200 flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              New Campaign
            </button>
          </div>
        </div>
      </header>

      {/* Toast Alert Banner */}
      {alert && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className={`px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-xl flex items-center gap-3 text-xs font-medium ${
            alert.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}>
            {alert.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{alert.message}</span>
            <button onClick={() => setAlert(null)} className="ml-2 text-slate-400 hover:text-slate-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-6 py-9 space-y-8 relative z-10">

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl p-5 backdrop-blur-md">
            <p className="text-xs text-slate-400">Total Campaigns</p>
            <h3 className="text-2xl font-medium text-slate-200 mt-1">{campaigns.length}</h3>
            <p className="text-[11px] text-slate-400 mt-2">Configured outreach targets</p>
          </div>

          <div className="bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl p-5 backdrop-blur-md">
            <p className="text-xs text-slate-400">Active Campaigns</p>
            <h3 className="text-2xl font-medium text-emerald-400 mt-1">{totalActive}</h3>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-emerald-400/90 font-medium">Running daily</span>
            </div>
          </div>

          <div className="bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl p-5 backdrop-blur-md">
            <p className="text-xs text-slate-400">Paused Campaigns</p>
            <h3 className="text-2xl font-medium text-amber-400 mt-1">{totalPaused}</h3>
            <p className="text-[11px] text-slate-400 mt-2">Temporarily stopped</p>
          </div>

          <div className="bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl p-5 backdrop-blur-md">
            <p className="text-xs text-slate-400">Active Daily Target Cap</p>
            <h3 className="text-2xl font-medium text-indigo-400 mt-1">{totalDailyCap} leads/day</h3>
            <p className="text-[11px] text-slate-400 mt-2">Combined daily fresh lead target</p>
          </div>
        </div>

        {/* Action Controls & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white/[0.015] ring-1 ring-white/[0.05] rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
              }`}
            >
              All ({campaigns.length})
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'active' ? 'bg-emerald-600/30 text-emerald-300 ring-1 ring-emerald-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
              }`}
            >
              Active ({totalActive})
            </button>
            <button
              onClick={() => setFilter('paused')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'paused' ? 'bg-amber-600/30 text-amber-300 ring-1 ring-amber-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
              }`}
            >
              Paused ({totalPaused})
            </button>
          </div>

          <button
            onClick={fetchCampaigns}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Campaign List Grid */}
        {loading ? (
          <div className="py-20 text-center text-slate-500 text-sm flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            Loading campaigns...
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="py-20 text-center bg-white/[0.01] ring-1 ring-white/[0.05] rounded-2xl p-8">
            <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-medium text-slate-300">No campaigns found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {filter === 'all' 
                ? 'Create your first campaign to begin targeting niches and capturing leads.' 
                : `No ${filter} campaigns currently exist.`}
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-medium inline-flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" /> Create Campaign
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCampaigns.map((campaign) => {
              const isExpired = campaign.end_date && new Date(campaign.end_date) < new Date();
              
              return (
                <div 
                  key={campaign.id}
                  className={`bg-white/[0.015] hover:bg-white/[0.03] ring-1 transition-all duration-200 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group ${
                    campaign.is_active ? 'ring-white/[0.07] hover:ring-indigo-500/30' : 'ring-white/[0.04] opacity-80'
                  }`}
                >
                  {/* Status Indicator Bar */}
                  <div className="flex items-center justify-between mb-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                      isExpired
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        : campaign.is_active
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isExpired ? 'bg-rose-400' : campaign.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`} />
                      {isExpired ? 'Expired' : campaign.is_active ? 'Active Running' : 'Paused'}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingCampaign(campaign)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
                        title="Edit Campaign"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingId(campaign.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete Campaign"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Campaign Title & Metadata */}
                  <div className="space-y-3 mb-6">
                    <h2 className="text-lg font-semibold text-slate-100 tracking-tight group-hover:text-indigo-300 transition-colors">
                      {campaign.name}
                    </h2>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/[0.03] text-slate-300 ring-1 ring-white/5">
                        <Target className="w-3 h-3 text-indigo-400 shrink-0" />
                        {campaign.niche}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/[0.03] text-slate-300 ring-1 ring-white/5">
                        <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                        {campaign.location}
                      </span>
                    </div>

                    {/* Stats & Progress */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-black/30 p-2.5 rounded-xl ring-1 ring-white/5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Daily Target Limit</p>
                        <p className="text-sm font-semibold text-slate-200 mt-0.5">{campaign.daily_lead_limit || 20} leads/day</p>
                      </div>
                      <div className="bg-black/30 p-2.5 rounded-xl ring-1 ring-white/5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total Scraped</p>
                        <p className="text-sm font-semibold text-indigo-400 mt-0.5">{campaign.total_leads || 0} leads</p>
                      </div>
                    </div>

                    {/* Expiry indicator */}
                    {campaign.end_date && (
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        Expires: {new Date(campaign.end_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {/* Campaign Action Buttons */}
                  <div className="flex items-center gap-2 pt-4 border-t border-white/[0.04]">
                    <button
                      onClick={() => handleTogglePause(campaign)}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        campaign.is_active
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/20'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/20'
                      }`}
                    >
                      {campaign.is_active ? (
                        <>
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" /> Resume
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleRunScraper(campaign)}
                      disabled={scrapingId === campaign.id}
                      className="flex-1 py-2 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/30 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${scrapingId === campaign.id ? 'animate-spin' : ''}`} />
                      {scrapingId === campaign.id ? 'Starting...' : 'Run Scraper'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* CREATE CAMPAIGN MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] ring-1 ring-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" /> Create New Outreach Campaign
              </h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Campaign Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Houston Real Estate Q3"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Target Niche</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. real estate"
                    value={formData.niche}
                    onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                    className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Target Location</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Houston, TX"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Daily Lead Target Limit</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.daily_lead_limit}
                    onChange={(e) => setFormData({ ...formData, daily_lead_limit: parseInt(e.target.value, 10) || 20 })}
                    className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CAMPAIGN MODAL */}
      {editingCampaign && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] ring-1 ring-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-400" /> Edit Campaign
              </h3>
              <button onClick={() => setEditingCampaign(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={editingCampaign.name}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                  className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Niche</label>
                  <input
                    type="text"
                    required
                    value={editingCampaign.niche}
                    onChange={(e) => setEditingCampaign({ ...editingCampaign, niche: e.target.value })}
                    className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                  <input
                    type="text"
                    required
                    value={editingCampaign.location}
                    onChange={(e) => setEditingCampaign({ ...editingCampaign, location: e.target.value })}
                    className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Daily Lead Limit</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={editingCampaign.daily_lead_limit}
                    onChange={(e) => setEditingCampaign({ ...editingCampaign, daily_lead_limit: parseInt(e.target.value, 10) || 20 })}
                    className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={editingCampaign.end_date ? editingCampaign.end_date.split('T')[0] : ''}
                    onChange={(e) => setEditingCampaign({ ...editingCampaign, end_date: e.target.value })}
                    className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] ring-1 ring-rose-500/20 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-semibold text-slate-100">Delete Campaign?</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Are you sure you want to permanently delete this campaign? Existing scraped leads associated with it will be preserved, but scraper execution will stop.
            </p>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium shadow-lg shadow-rose-600/30"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
