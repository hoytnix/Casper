'use client';

import React, { useState } from 'react';
import { X, GitBranch, Star, Lock, Globe, Loader2, Plus, AlertCircle } from 'lucide-react';
import { Repo } from '@/types';
import { parseRepoInput, fetchRepoMetadata } from '@/lib/github';

interface AddRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddRepo: (repo: Repo) => void;
  githubPat?: string;
}

export const AddRepoModal: React.FC<AddRepoModalProps> = ({
  isOpen,
  onClose,
  onAddRepo,
  githubPat,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    owner: string;
    repo: string;
    defaultBranch: string;
    description: string;
    stars: number;
    isPrivate: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const handleValidate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setPreview(null);

    const parsed = parseRepoInput(inputVal);
    if (!parsed) {
      setError('Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo) or owner/repo.');
      return;
    }

    setIsValidating(true);
    try {
      const meta = await fetchRepoMetadata(parsed.owner, parsed.repo, githubPat);
      setPreview(meta);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to validate repository');
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmAdd = () => {
    if (!preview) return;
    const newRepo: Repo = {
      id: `${preview.owner.toLowerCase()}-${preview.repo.toLowerCase()}`,
      owner: preview.owner,
      repo: preview.repo,
      branch: preview.defaultBranch,
      defaultBranch: preview.defaultBranch,
      description: preview.description,
      stars: preview.stars,
      lastSyncedAt: null,
      isPrivate: preview.isPrivate,
      excludedPatterns: [],
    };
    onAddRepo(newRepo);
    setInputVal('');
    setPreview(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-2xl glass-panel shadow-2xl border border-slate-700/80 p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-white">Add Next.js Repository</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleValidate} className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-200 block mb-1.5">
              Next.js Repository URL or Slug
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  setError(null);
                  setPreview(null);
                }}
                placeholder="https://github.com/vercel/next.js or owner/next-app"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition"
              />
              <button
                type="submit"
                disabled={isValidating || !inputVal.trim()}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition disabled:opacity-40 flex items-center gap-1.5"
              >
                {isValidating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                ) : (
                  <span>Verify</span>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {preview && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/40 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white font-mono">
                      {preview.owner}/{preview.repo}
                    </span>
                    {preview.isPrivate ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Lock className="w-2.5 h-2.5" /> Private
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Globe className="w-2.5 h-2.5" /> Public
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {preview.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-400 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-mono text-slate-300">{preview.defaultBranch}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                  <span>{preview.stars.toLocaleString()} stars</span>
                </div>
              </div>
            </div>
          )}
        </form>

        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
          >
            Cancel
          </button>
          <button
            onClick={preview ? handleConfirmAdd : () => handleValidate()}
            disabled={isValidating || !inputVal.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/30 transition disabled:opacity-40"
          >
            {isValidating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Checking GitHub...</span>
              </>
            ) : preview ? (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Workspace</span>
              </>
            ) : (
              <span>Verify &amp; Add</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
