'use client';

import React, { useState } from 'react';
import { useRepoStore } from '@/hooks/useRepoStore';
import { Header } from '@/components/Header';
import { RepoGrid } from '@/components/RepoGrid';
import { RepoWorkspace } from '@/components/RepoWorkspace';
import { AddRepoModal } from '@/components/AddRepoModal';
import { SettingsModal } from '@/components/SettingsModal';
import { CashierModal } from '@/components/CashierModal';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const {
    isLoaded,
    repos,
    activeRepo,
    settings,
    addRepo,
    updateRepo,
    deleteRepo,
    selectRepo,
    updateSettings,
    loadMessages,
    saveMessages,
    clearMessages,
    saveSnapshot,
    snapshots,
  } = useRepoStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCashierModalOpen, setIsCashierModalOpen] = useState(false);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        <p className="text-xs font-mono text-slate-400">Loading Next.js Expert...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      <Header
        activeRepo={activeRepo}
        onBackToGrid={() => selectRepo(null)}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenCashier={() => setIsCashierModalOpen(true)}
        hasPat={!!settings.githubPat}
      />

      <main className="flex-1 flex flex-col min-h-0">
        {activeRepo ? (
          <RepoWorkspace
            key={activeRepo.id}
            repo={activeRepo}
            settings={settings}
            onUpdateRepo={updateRepo}
            loadMessages={loadMessages}
            saveMessages={saveMessages}
            clearMessages={clearMessages}
            snapshot={snapshots[activeRepo.id] || null}
            saveSnapshot={saveSnapshot}
          />
        ) : (
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
            <RepoGrid
              repos={repos}
              onOpenRepo={(id) => selectRepo(id)}
              onDeleteRepo={deleteRepo}
              onOpenAddModal={() => setIsAddModalOpen(true)}
            />
          </div>
        )}
      </main>

      <AddRepoModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddRepo={addRepo}
        githubPat={settings.githubPat}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSave={updateSettings}
      />

      <CashierModal
        isOpen={isCashierModalOpen}
        onClose={() => setIsCashierModalOpen(false)}
        settings={settings}
        onSaveSettings={updateSettings}
      />

      <OfflineIndicator />
    </div>
  );
}
