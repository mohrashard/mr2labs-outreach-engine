"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Users, Mail, MessageSquareText, Activity, 
  Play, RefreshCw, CheckCircle, AlertTriangle, Layers, LogOut, ShieldCheck
} from 'lucide-react';
import Image from 'next/image';
import { OutreachLead } from '@/types/lead';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetailDrawer } from '@/components/leads/LeadDetailDrawer';
import { CampaignSetupForm } from '@/components/campaigns/CampaignSetupForm';
import { createClient } from '@/lib/supabase/client';
import { LiveLogs } from '@/components/dashboard/LiveLogs';

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

  const [nextCronTime, setNextCronTime] = useState('Calculating...');

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

    // Dynamically calculate next 09:00 UTC cron run in local timezone
    const date = new Date();
    date.setUTCHours(9, 0, 0, 0);
    if (date.getTime() < Date.now()) {
      date.setDate(date.getDate() + 1);
    }
    setNextCronTime(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }));

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
    <div className="min-h-screen bg-[#0a0a0c] text-slate-300 font-sans selection:bg-indigo-500/20 selection:text-indigo-200 pb-20 relative">
      
      {/* Ambient background soft veil */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[380px] bg-gradient-to-b from-indigo-950/[0.04] via-slate-900/[0.015] to-transparent blur-3xl pointer-events-none" />

      {/* Toast Alert */}
      {alert && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl ring-1 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-top duration-300 ${
          alert.type === 'success' 
            ? 'bg-[#0A1210]/90 ring-emerald-500/20 text-emerald-300' 
            : 'bg-[#180C10]/90 ring-rose-500/20 text-rose-300'
        }`}>
          {alert.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
          <span className="text-xs font-normal">{alert.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="border-b border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3.5">
            <Image 
              src="/mr-squared-logo.png" 
              alt="MR² Labs Logo" 
              width={34} 
              height={34} 
              className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/10 shadow-sm" 
            />
            <div>
              <h1 className="text-sm font-medium tracking-tight text-slate-200 flex items-center gap-2">
                Outreach Engine
                <span className="text-[10px] font-normal px-2 py-0.5 bg-indigo-500/10 text-indigo-300/90 rounded-full">
                  v2.0 Autonomous
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5 font-normal">Multi-provider discovery, AI auditing & Brevo dispatch</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {userEmail && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.02] text-slate-400 rounded-full text-xs font-normal">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
                <span className="truncate max-w-[160px]" title={userEmail}>Admin: {userEmail}</span>
              </div>
            )}

            <Link 
              href="/templates"
              className="px-3.5 py-2 hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 rounded-full font-normal text-xs transition-colors duration-200 flex items-center gap-2"
            >
              <Layers className="w-3.5 h-3.5 text-purple-400/80" />
              Templates
            </Link>
            <Link 
              href="/followups"
              className="px-3.5 py-2 hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 rounded-full font-normal text-xs transition-colors duration-200 flex items-center gap-2"
            >
              <Mail className="w-3.5 h-3.5 text-blue-400/80" />
              Follow-ups
            </Link>
            <a 
              href="#live-logs"
              className="px-3.5 py-2 hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 rounded-full font-normal text-xs transition-colors duration-200 flex items-center gap-2"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400/80" />
              Logs
            </a>
            
            <div className="flex flex-col items-end mr-2 ml-2">
              <span className="text-[10px] text-slate-400 font-medium">Next Queue Start</span>
              <span className="text-[10px] text-indigo-400 font-semibold">{nextCronTime}</span>
            </div>
            
            <button 
              onClick={handleRunScraper}
              disabled={isScraping}
              className="px-4 py-2 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-40 text-indigo-300 hover:text-indigo-200 rounded-full font-medium text-xs transition-all duration-200 flex items-center gap-2"
            >
              <Play className="w-3 h-3" />
              {isScraping ? 'Scraping...' : 'Run Scraper Now'}
            </button>
            <button 
              onClick={handleFlushQueue}
              disabled={isFlushing}
              className="px-3.5 py-2 hover:bg-white/[0.04] disabled:opacity-40 text-slate-400 hover:text-slate-200 rounded-full font-normal text-xs transition-colors duration-200 flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
              {isFlushing ? 'Flushing...' : 'Flush Daily Queue'}
            </button>
            <button 
              onClick={handleSignOut}
              className="px-3 py-2 hover:bg-rose-500/10 text-slate-400 hover:text-rose-300 rounded-full font-normal text-xs transition-colors duration-200 flex items-center gap-1.5"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400/80" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 pt-9 space-y-9 relative z-10">
        
        {/* Metric Cards Top Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="bg-white/[0.015] hover:bg-white/[0.03] ring-1 ring-white/[0.05] hover:ring-white/[0.1] rounded-2xl p-6 shadow-sm backdrop-blur-md transition-all duration-200 ease-out group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-normal text-slate-500 tracking-normal">Total Scraped</p>
                <h3 className="text-2xl font-medium tracking-tight text-slate-200 mt-1">{metrics.totalScraped}</h3>
              </div>
              <div className="p-2.5 bg-white/[0.02] ring-1 ring-white/[0.06] rounded-xl text-slate-400 group-hover:text-indigo-300 transition-colors duration-200">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-[11px] text-slate-500 font-normal">
              <span className="text-emerald-400/90 font-normal">+100%</span>
              <span className="ml-1 text-slate-500">active discovery</span>
            </div>
          </div>

          <div className="bg-white/[0.015] hover:bg-white/[0.03] ring-1 ring-white/[0.05] hover:ring-white/[0.1] rounded-2xl p-6 shadow-sm backdrop-blur-md transition-all duration-200 ease-out group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-normal text-slate-500 tracking-normal">Emails Sent Today</p>
                <h3 className="text-2xl font-medium tracking-tight text-slate-200 mt-1">{metrics.emailsSentToday}</h3>
              </div>
              <div className="p-2.5 bg-white/[0.02] ring-1 ring-white/[0.06] rounded-xl text-slate-400 group-hover:text-emerald-300 transition-colors duration-200">
                <Mail className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-[11px] text-slate-500 font-normal">
              <span>Limit: 20 per day</span>
            </div>
          </div>

          <div className="bg-white/[0.015] hover:bg-white/[0.03] ring-1 ring-white/[0.05] hover:ring-white/[0.1] rounded-2xl p-6 shadow-sm backdrop-blur-md transition-all duration-200 ease-out group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-normal text-slate-500 tracking-normal">Reply Rate</p>
                <h3 className="text-2xl font-medium tracking-tight text-slate-200 mt-1">{metrics.replyRate}</h3>
              </div>
              <div className="p-2.5 bg-white/[0.02] ring-1 ring-white/[0.06] rounded-xl text-slate-400 group-hover:text-purple-300 transition-colors duration-200">
                <MessageSquareText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-[11px] text-slate-500 font-normal">
              <span className="text-purple-300/80 font-normal">Brevo inbound</span>
              <span className="ml-1 text-slate-500">webhooks live</span>
            </div>
          </div>

          <div className="bg-white/[0.015] hover:bg-white/[0.03] ring-1 ring-white/[0.05] hover:ring-white/[0.1] rounded-2xl p-6 shadow-sm backdrop-blur-md transition-all duration-200 ease-out group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-normal text-slate-500 tracking-normal">Active Campaigns</p>
                <h3 className="text-2xl font-medium tracking-tight text-slate-200 mt-1">{metrics.activeCampaigns}</h3>
              </div>
              <div className="p-2.5 bg-white/[0.02] ring-1 ring-white/[0.06] rounded-xl text-slate-400 group-hover:text-cyan-300 transition-colors duration-200">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-[11px] text-slate-500 font-normal">
              <span>30-day auto expiry policy</span>
            </div>
          </div>

        </div>

        {/* Dashboard Main Grid: Setup Form + Clean Pipeline Table */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-9">
          
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
        
        {/* Live Scraper Logs */}
        <LiveLogs />

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
