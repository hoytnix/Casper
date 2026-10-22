'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRepoStore } from '@/hooks/useRepoStore';
import { Header } from '@/components/Header';
import { RepoWorkspace } from '@/components/RepoWorkspace';
import { AddRepoModal } from '@/components/AddRepoModal';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { Loader2, AlertCircle } from 'lucide-react';
import { Repo } from '@/types';

export default function ChatRepoPage() {
  const params = useParams();
  const router = useRouter();
  const owner = typeof params.owner === 'string' ? params.owner : '';
  const repoName = typeof params.repo === 'string' ? params.repo : '';

  const {
    isLoaded,
    repos,
    settings,
    addRepo,
    updateRepo,
    selectRepo,
    loadMessages,
    saveMessages,
    clearMessages,
    saveSnapshot,
    snapshots,
  } = useRepoStore();

  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedRepo, setFetchedRepo] = useState<Repo | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const existingRepo = repos.find(
    (r) =>
      r.owner.toLowerCase() === owner.toLowerCase() &&
      r.repo.toLowerCase() === repoName.toLowerCase()
  );

  const activeRepo = existingRepo || fetchedRepo;

  useEffect(() => {
    if (!isLoaded) return;
    if (!owner || !repoName) {
      router.push('/');
      return;
    }

    if (existingRepo) {
      selectRepo(existingRepo.id);
      return;
    }

    let isCancelled = false;

    const fetchGitHubRepo = async () => {
      if (isCancelled) return;
      setIsFetching(true);
      setFetchError(null);

      try {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
        };
        if (settings.githubPat) {
          headers['Authorization'] = `Bearer ${settings.githubPat}`;
        }

        const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, { headers });
        if (!res.ok) {
          throw new Error(`Repository ${owner}/${repoName} not found or rate-limited (${res.status})`);
        }

        const data = await res.json();
        if (isCancelled) return;

        const newRepo: Repo = {
          id: `${data.owner.login}-${data.name}`.toLowerCase(),
          owner: data.owner.login,
          repo: data.name,
          branch: data.default_branch || 'main',
          defaultBranch: data.default_branch || 'main',
          description: data.description || 'Next.js repository loaded via permalink.',
          stars: data.stargazers_count || 0,
          lastSyncedAt: null,
          isPrivate: data.private || false,
          excludedPatterns: ['examples/', 'test/', '*.spec.ts'],
        };

        addRepo(newRepo);
        setFetchedRepo(newRepo);
        selectRepo(newRepo.id);
      } catch (err) {
        if (!isCancelled) {
          setFetchError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!isCancelled) {
          setIsFetching(false);
        }
      }
    };

    fetchGitHubRepo();

    return () => {
      isCancelled = true;
    };
  }, [isLoaded, owner, repoName, existingRepo, settings.githubPat, router, addRepo, selectRepo]);

  if (!isLoaded || (isFetching && !activeRepo)) {
    return (
      <div className="h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-3 overflow-hidden">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        <p className="text-xs font-mono text-slate-400">
          Resolving repository <span className="text-white font-bold">{owner}/{repoName}</span> from GitHub...
        </p>
      </div>
    );
  }

  if (fetchError || !activeRepo) {
    return (
      <div className="h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 p-6 overflow-hidden">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-white">Repository Not Found</h2>
          <p className="text-xs text-slate-400 font-mono">{fetchError || `Could not resolve ${owner}/${repoName}`}</p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition"
        >
          Return to Repositories
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      <Header
        activeRepo={activeRepo}
        onBackToGrid={() => {
          selectRepo(null);
          router.push('/');
        }}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        hasPat={!!settings.githubPat}
      />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
      </main>

      <AddRepoModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddRepo={addRepo}
        githubPat={settings.githubPat}
      />

      <OfflineIndicator />
    </div>
  );
}
