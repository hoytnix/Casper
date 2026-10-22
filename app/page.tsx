'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRepoStore } from '@/hooks/useRepoStore';
import { Header } from '@/components/Header';
import { RepoGrid } from '@/components/RepoGrid';
import { AddRepoModal } from '@/components/AddRepoModal';
import { SettingsModal } from '@/components/SettingsModal';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { Loader2 } from 'lucide-react';
import { Repo } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const {
    isLoaded,
    repos,
    settings,
    addRepo,
    deleteRepo,
    selectRepo,
    updateSettings,
  } = useRepoStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  if (!isLoaded) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 overflow-hidden">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        <p className="text-xs font-mono text-slate-400">Loading Casper... 👻</p>
      </div>
    );
  }

  const handleOpenRepo = (id: string) => {
    const repo = repos.find((r) => r.id === id);
    if (repo) {
      selectRepo(repo.id);
      router.push(`/chat/${repo.owner}/${repo.repo}`);
    }
  };

  const handleAddRepo = (newRepo: Repo) => {
    addRepo(newRepo);
    router.push(`/chat/${newRepo.owner}/${newRepo.repo}`);
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      <Header
        activeRepo={null}
        onBackToGrid={() => selectRepo(null)}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        hasPat={!!settings.githubPat}
      />

      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
          <RepoGrid
            repos={repos}
            onOpenRepo={handleOpenRepo}
            onDeleteRepo={deleteRepo}
            onOpenAddModal={() => setIsAddModalOpen(true)}
          />
        </div>
      </main>

      <AddRepoModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddRepo={handleAddRepo}
        githubPat={settings.githubPat}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSave={updateSettings}
      />

      <OfflineIndicator />
    </div>
  );
}
