"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Users, Mail, MessageSquareText, Activity, 
  Play, RefreshCw, CheckCircle, AlertTriangle, Layers, LogOut, ShieldCheck
} from 'lucide-react';
import { OutreachLead } from '@/types/lead';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetailDrawer } from '@/components/leads/LeadDetailDrawer';
import { CampaignSetupForm } from '@/components/campaigns/CampaignSetupForm';
import { createClient } from '@/lib/supabase/client';

export default function AdminDashboard() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);

  // Live Data State
  const [metrics, setMetrics] = useState({
    activeCampaigns: 0,
    totalScraped: 0,
    emailsSentToday: 0,
    replyRate: '0%'
  });
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  
  // Alert State
  const [alert, setAlert] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.metrics) setMetrics(data.metrics);
      if (data.leads) setLeads(data.leads);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) {
          setUserEmail(user.email);
        }
      } catch (err) {
        console.error('Error fetching auth user:', err);
      }
    };
    fetchUser();
    fetchData();
  }, []);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleCreateCampaign = async (formData: { campaignName: string; niche: string; location: string; startDate: string }) => {
    setIsScraping(true);
    try {
      const start = new Date(formData.startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 30);
      
      const campRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.campaignName,
          niche: formData.niche,
          location: formData.location,
          start_date: start.toISOString(),
          end_date: end.toISOString()
        })
      });
      const campaign = await campRes.json();
      if (campaign.error) throw new Error(campaign.error);

      showAlert('success', `Campaign created! Running discovery scraper for ${formData.niche}...`);

      const scrapeRes = await fetch('/api/campaigns/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, niche: formData.niche, location: formData.location })
      });
      const scrapeData = await scrapeRes.json();
      if (scrapeData.error) throw new Error(scrapeData.error);
      
      showAlert('success', `Scraping complete. Processed ${scrapeData.processedCount || scrapeData.enqueuedCount} leads.`);
      fetchData();
    } catch (err: any) {
      showAlert('error', err.message);
    } finally {
      setIsScraping(false);
    }
  };

  const handleRunScraper = async () => {
    setIsScraping(true);
    try {
      const res = await fetch('/api/campaigns/scrape', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showAlert('success', `Scrape initiated! Processed/Enqueued leads successfully.`);
      fetchData();
    } catch (err: any) {
      showAlert('error', err.message);
    } finally {
      setIsScraping(false);
    }
  };

  const handleFlushQueue = async () => {
    setIsFlushing(true);
    try {
      const res = await fetch('/api/cron/daily-outreach', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'mr2labs_cron_secret_key_2026'}`
        }
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showAlert('success', `Queue flushed! Enqueued ${data.enqueuedJobs} emails to Brevo.`);
      fetchData();
    } catch (err: any) {
      showAlert('error', err.message);
    } finally {
      setIsFlushing(false);
    }
  };

  const handleUpdateLead = async (updatedLead: OutreachLead) => {
    try {
      const res = await fetch('/api/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedLead)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setSelectedLead(updatedLead);
      setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
      showAlert('success', 'Lead details updated successfully.');
    } catch (err: any) {
      showAlert('error', err.message);
    }
  };

  const handleSendTestEmail = async (lead: OutreachLead) => {
    try {
      showAlert('success', `Sending test cold email for ${lead.company_name}...`);
      const res = await fetch('/api/cron/daily-outreach', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'mr2labs_cron_secret_key_2026'}`
        }
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showAlert('success', `Test email dispatched to ${lead.email}`);
      fetchData();
    } catch (err: any) {
      showAlert('error', err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-gray-100 font-sans selection:bg-indigo-500 selection:text-white pb-20">
      
      {/* Toast Alert */}
      {alert && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in slide-in-from-top duration-300 ${
          alert.type === 'success' 
            ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-200' 
            : 'bg-rose-950/80 border-rose-500/30 text-rose-200'
        }`}>
          {alert.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
          <span className="text-sm font-medium">{alert.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center font-black text-black text-lg shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              MR²
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Outreach Engine
                <span className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  v2.0 Autonomous
                </span>
              </h1>
              <p className="text-xs text-gray-400">Multi-provider discovery, AI auditing & Brevo dispatch</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {userEmail && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate max-w-[160px]" title={userEmail}>Admin: {userEmail}</span>
              </div>
            )}

            <Link 
              href="/templates"
              className="px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/30 rounded-xl font-semibold text-xs transition-all flex items-center gap-2"
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              Template Builder
            </Link>
            <button 
              onClick={handleRunScraper}
              disabled={isScraping}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              <Play className="w-3.5 h-3.5" />
              {isScraping ? 'Scraping...' : 'Run Scraper Now'}
            </button>
            <button 
              onClick={handleFlushQueue}
              disabled={isFlushing}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-all flex items-center gap-2 border border-white/10"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
              {isFlushing ? 'Flushing...' : 'Flush Daily Queue'}
            </button>
            <button 
              onClick={handleSignOut}
              className="px-3 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8">
        
        {/* Metric Cards Top Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-[#111116] border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/50 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Scraped</p>
                <h3 className="text-3xl font-black text-white mt-1">{metrics.totalScraped}</h3>
              </div>
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-indigo-400">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-xs text-emerald-400 font-medium">
              <span>+100% active discovery</span>
            </div>
          </div>

          <div className="bg-[#111116] border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-emerald-500/50 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Emails Sent Today</p>
                <h3 className="text-3xl font-black text-white mt-1">{metrics.emailsSentToday}</h3>
              </div>
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-emerald-400">
                <Mail className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-xs text-gray-400 font-medium">
              <span>Limit: 20 per day</span>
            </div>
          </div>

          <div className="bg-[#111116] border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-purple-500/50 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Reply Rate</p>
                <h3 className="text-3xl font-black text-white mt-1">{metrics.replyRate}</h3>
              </div>
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-purple-400">
                <MessageSquareText className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-xs text-purple-400 font-medium">
              <span>Brevo inbound webhooks live</span>
            </div>
          </div>

          <div className="bg-[#111116] border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-cyan-500/50 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Active Campaigns</p>
                <h3 className="text-3xl font-black text-white mt-1">{metrics.activeCampaigns}</h3>
              </div>
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-cyan-400">
                <Activity className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-xs text-cyan-400 font-medium">
              <span>30-day auto expiry policy</span>
            </div>
          </div>
        </div>

        {/* Dashboard Main Grid: Setup Form + Clean Pipeline Table */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Campaign Launcher Form */}
          <div className="xl:col-span-1">
            <CampaignSetupForm 
              isScraping={isScraping} 
              onSubmit={handleCreateCampaign} 
            />
          </div>

          {/* Clean Scraped Leads Table */}
          <div className="xl:col-span-2">
            <LeadsTable 
              leads={leads} 
              onSelectLead={(lead) => setSelectedLead(lead)} 
            />
          </div>
        </div>

      </main>

      {/* Slide-over Detail Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdateLead={handleUpdateLead}
        onSendTestEmail={handleSendTestEmail}
      />

    </div>
  );
}
