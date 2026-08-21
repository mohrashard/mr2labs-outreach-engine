"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowLeft, Plus, Edit3, Trash2, Save, X, Search, 
  Layers, CheckCircle, AlertTriangle, Sparkles, Zap, RefreshCw, Target
} from 'lucide-react';
import { PitchTemplate } from '@/types/database';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<PitchTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFallback, setIsFallback] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nicheName, setNicheName] = useState('');
  const [painPoints, setPainPoints] = useState('');
  const [mr2Solution, setMr2Solution] = useState('');

  // Toast Notification
  const [alert, setAlert] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      if (data.templates) {
        setTemplates(data.templates);
        setIsFallback(!!data.isFallback);
      }
    } catch (err) {
      console.error('Failed to load pitch templates:', err);
      showAlert('error', 'Failed to connect to Supabase pitch_templates table.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleResetForm = () => {
    setEditingId(null);
    setNicheName('');
    setPainPoints('');
    setMr2Solution('');
  };

  const handleStartEdit = (template: PitchTemplate) => {
    setEditingId(template.id || template.niche_name);
    setNicheName(template.niche_name);
    setPainPoints(template.pain_points);
    setMr2Solution(template.mr2_solution);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicheName.trim() || !painPoints.trim() || !mr2Solution.trim()) {
      showAlert('error', 'All form fields are required.');
      return;
    }

    setSaving(true);
    try {
      const endpoint = '/api/templates';
      const method = editingId ? 'PUT' : 'POST';
      
      const payload = {
        id: editingId && !editingId.includes(' ') ? editingId : undefined,
        niche_name: nicheName.trim(),
        pain_points: painPoints.trim(),
        mr2_solution: mr2Solution.trim()
      };

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showAlert('success', editingId ? `Template for "${nicheName}" updated!` : `New template "${nicheName}" created!`);
      handleResetForm();
      fetchTemplates();
    } catch (err: any) {
      showAlert('error', err.message || 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string | undefined, name: string) => {
    if (!confirm(`Are you sure you want to delete the pitch template for "${name}"?`)) {
      return;
    }

    try {
      if (id) {
        const res = await fetch(`/api/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      } else {
        await fetch(`/api/templates?niche_name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      }

      setTemplates(prev => prev.filter(t => t.niche_name !== name));
      showAlert('success', `Template for "${name}" removed.`);
    } catch (err: any) {
      showAlert('error', err.message || 'Failed to delete template.');
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.niche_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.pain_points.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.mr2_solution.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

      {/* Top Header Bar */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="p-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-2xl border border-white/10 transition-all flex items-center gap-2 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Link>
            <div className="flex items-center gap-3">
              <Image 
                src="/mr-squared-logo.png" 
                alt="MR² Labs Logo" 
                width={36} 
                height={36} 
                className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/20 shadow-sm" 
              />
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Template Manager
                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full">
                    Supabase Live
                  </span>
                </h1>
                <p className="text-xs text-gray-400">Hot-swap pitch angles & Pain/Solution pairs without touching codebase</p>
              </div>
            </div>
          </div>

          <button 
            onClick={fetchTemplates}
            disabled={loading}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-semibold text-xs border border-white/10 transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Matrix
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8">

        {/* Info Banner */}
        {isFallback && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-200 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">Supabase Table Sync Note</p>
              <p className="mt-0.5 text-amber-200/80">
                Displaying default built-in niche matrix. Run the Supabase SQL migration for <code className="text-amber-100 font-mono">pitch_templates</code> table to sync edits across devices.
              </p>
            </div>
          </div>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white/[0.02] border border-transparent border-t-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] rounded-3xl p-5 flex items-center gap-4">
            <div className="p-3 bg-zinc-900/50 border border-zinc-800/50 text-zinc-400 rounded-2xl">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Active Niches</p>
              <h4 className="text-2xl font-black text-zinc-200 mt-0.5">{templates.length}</h4>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-transparent border-t-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] rounded-3xl p-5 flex items-center gap-4">
            <div className="p-3 bg-zinc-900/50 border border-zinc-800/50 text-indigo-300/80 rounded-2xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-zinc-500">AI Prompt Engine</p>
              <h4 className="text-sm font-bold text-zinc-200 mt-0.5">Groq / GPT-OSS 20B</h4>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-transparent border-t-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] rounded-3xl p-5 flex items-center gap-4">
            <div className="p-3 bg-zinc-900/50 border border-zinc-800/50 text-zinc-400 rounded-2xl">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Pitch Injection</p>
              <h4 className="text-sm font-bold text-zinc-200 mt-0.5">1-Sentence Customized</h4>
            </div>
          </div>
        </div>

        {/* Two-Column Editor & Matrix Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
          
          {/* Form Column */}
          <div className="xl:col-span-1 bg-white/[0.02] border border-transparent border-t-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] rounded-3xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-zinc-900/50 border border-zinc-800/50 text-zinc-400 rounded-xl">
                  {editingId ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingId ? 'Edit Niche Template' : 'Add New Pitch Template'}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {editingId ? 'Modify existing pain points or solution' : 'Create dynamic angle for a new industry'}
                  </p>
                </div>
              </div>

              {editingId && (
                <button 
                  onClick={handleResetForm} 
                  className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-all"
                  title="Cancel Edit"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                  Niche / Industry Name
                </label>
                <input 
                  type="text"
                  placeholder="e.g. Law Firm, MedSpa, HVAC Contractor"
                  value={nicheName}
                  onChange={(e) => setNicheName(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all placeholder-zinc-700"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                  Target Pain Points
                </label>
                <textarea 
                  rows={3}
                  placeholder="e.g. Slow intake forms, poor mobile rendering, losing leads to aggregators."
                  value={painPoints}
                  onChange={(e) => setPainPoints(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all placeholder-zinc-700 resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                  MR² Solution Strategy
                </label>
                <textarea 
                  rows={3}
                  placeholder="e.g. MR² Labs builds sub-second Next.js client intake portals with automated lead routing."
                  value={mr2Solution}
                  onChange={(e) => setMr2Solution(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all placeholder-zinc-700 resize-none"
                  required
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : (editingId ? 'Save Changes' : 'Create Template')}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="px-4 py-3 bg-white/5 hover:bg-white/10 text-gray-300 font-semibold text-xs rounded-xl transition-all border border-white/10"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Cards Grid Column */}
          <div className="xl:col-span-2 space-y-5">
            
            {/* Search & Filter Header */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/[0.02] border border-transparent border-t-white/[0.05] rounded-3xl p-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  placeholder="Search templates by niche or pains..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/[0.03] border border-transparent rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all"
                />
              </div>

              <span className="text-xs text-zinc-500 font-medium self-end sm:self-center">
                Showing {filteredTemplates.length} of {templates.length} templates
              </span>
            </div>

            {/* Grid of Template Cards */}
            {loading ? (
              <div className="p-12 text-center bg-[#111116] border border-white/10 rounded-3xl">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-400">Loading pitch templates from Supabase...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="p-12 text-center bg-[#111116] border border-white/10 rounded-3xl space-y-3">
                <Layers className="w-10 h-10 text-gray-600 mx-auto" />
                <h4 className="text-base font-semibold text-white">No Templates Found</h4>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  {searchQuery ? `No templates matched "${searchQuery}". Try clearing your search.` : 'No templates currently present. Add a new niche pitch template using the form on the left.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredTemplates.map((template, idx) => (
                  <div 
                    key={template.id || idx}
                    className="bg-white/[0.02] hover:bg-white/[0.03] transition-colors rounded-3xl p-6 md:p-8 flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-5">
                      {/* Card Header */}
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 bg-white/[0.05] text-zinc-300 font-bold text-xs rounded-full">
                          {template.niche_name}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleStartEdit(template)}
                            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors"
                            title="Edit Template"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(template.id, template.niche_name)}
                            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors"
                            title="Delete Template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Pain Points */}
                      <div>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Target Pain Points</span>
                        <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                          {template.pain_points}
                        </p>
                      </div>

                      {/* Solution */}
                      <div>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">MR² Solution Strategy</span>
                        <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                          {template.mr2_solution}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-zinc-600">
                      <span>Injected into Groq prompt</span>
                      <span className="font-mono text-[10px] text-zinc-500">{template.id ? 'DB Synced' : 'Preset'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </main>
    </div>
  );
}
