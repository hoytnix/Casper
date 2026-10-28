'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { IngestionSnapshot, SourceFile } from '@/types';
import {
  applyFileDelta,
  downloadSourceFiles,
  fetchRepoDelta,
  fetchRepoTree,
  shouldIncludeFile,
} from '@/lib/github';

export type DeltaStatus = 'idle' | 'checking' | 'cached' | 'syncing' | 'outdated';

export interface RepoDeltaIdentity {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  excludedPatterns?: string[];
}

export interface UseRepoDeltaSyncDeps {
  repo: RepoDeltaIdentity;
  githubPat?: string;
  getSnapshot: () => IngestionSnapshot | null;
  saveSnapshot: (repoId: string, snapshot: IngestionSnapshot) => void;
  setDeltaStatus: (status: DeltaStatus) => void;
  setProgressMessage: (message: string) => void;
}

export interface PrepareCompileFilesInput {
  commitSha: string;
  snapshot: IngestionSnapshot | null;
}

export interface PrepareCompileFilesResult {
  activeFiles: SourceFile[];
}

// AST-aware incremental delta verification, extracted verbatim from
// RepoWorkspace: the on-open/branch background check (verifyOnOpen) and
// the in-compile fast-forward path (prepareCompileFiles). Both share the
// modified-file refresh below. Deps are mirror-read per call so the
// callbacks stay stable across branch switches.
export function useRepoDeltaSync(deps: UseRepoDeltaSyncDeps) {
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });

  const verifyOnOpen = useCallback(async (isCancelled: () => boolean) => {
    const { repo, githubPat, getSnapshot, saveSnapshot, setDeltaStatus } = depsRef.current;
    const snap = getSnapshot();
    if (!snap?.commitSha || !snap.files || snap.files.length === 0) {
      setDeltaStatus('idle');
      return;
    }

    setDeltaStatus('checking');
    try {
      const { sha: latestSha } = await fetchRepoTree(
        repo.owner,
        repo.repo,
        repo.branch,
        githubPat
      );

      if (isCancelled()) return;

      if (latestSha === snap.commitSha) {
        setDeltaStatus('cached');
        return;
      }

      // Remote commit is different: compare delta
      const delta = await fetchRepoDelta(
        repo.owner,
        repo.repo,
        snap.commitSha,
        latestSha,
        githubPat
      );

      if (isCancelled()) return;

      if (delta.isFastForward) {
        if (delta.modifiedFiles.length > 0) {
          setDeltaStatus('syncing');
          const freshModifiedFiles = await refreshModifiedFiles(
            repo,
            githubPat,
            delta.modifiedFiles.map((f) => ({ path: f.path, status: f.status }))
          );

          if (isCancelled()) return;

          const updatedFiles = applyFileDelta(
            snap.files,
            delta.modifiedFiles,
            freshModifiedFiles
          );
          const updatedSnapshot: IngestionSnapshot = {
            ...snap,
            commitSha: latestSha,
            files: updatedFiles,
            includedFilesCount: updatedFiles.length,
            timestamp: Date.now(),
          };
          saveSnapshot(repo.id, updatedSnapshot);
          setDeltaStatus('cached');
        } else {
          // Fast forward without source changes
          const updatedSnapshot: IngestionSnapshot = {
            ...snap,
            commitSha: latestSha,
            timestamp: Date.now(),
          };
          saveSnapshot(repo.id, updatedSnapshot);
          setDeltaStatus('cached');
        }
      } else {
        setDeltaStatus('outdated');
      }
    } catch (err) {
      console.warn('Delta background verification note:', err);
      if (!isCancelled()) setDeltaStatus('idle');
    }
  }, []);

  const prepareCompileFiles = useCallback(
    async (input: PrepareCompileFilesInput): Promise<PrepareCompileFilesResult> => {
      const { repo, githubPat, setDeltaStatus, setProgressMessage } = depsRef.current;
      const { commitSha, snapshot } = input;
      const currentCommitSha = snapshot?.commitSha;
      let activeFiles: SourceFile[] = snapshot?.files || [];

      if (currentCommitSha && activeFiles.length > 0) {
        if (currentCommitSha === commitSha) {
          // Exact match: 0 blob downloads required
          setProgressMessage(
            `Snapshot matches remote HEAD (${commitSha.slice(0, 7)}). Zero file downloads required.`
          );
          setDeltaStatus('cached');
        } else {
          // Commit SHA changed: query GitHub compare API for incremental delta
          setProgressMessage(
            `Comparing commits ${currentCommitSha.slice(0, 7)}...${commitSha.slice(0, 7)} for delta...`
          );

          const delta = await fetchRepoDelta(
            repo.owner,
            repo.repo,
            currentCommitSha,
            commitSha,
            githubPat
          );

          if (delta.isFastForward) {
            const modifiedEligible = delta.modifiedFiles.filter(
              (f) =>
                f.status !== 'removed' &&
                shouldIncludeFile(f.path, undefined, repo.excludedPatterns)
            );
            const modifiedPaths = modifiedEligible.map((f) => f.path);

            let freshModifiedFiles: SourceFile[] = [];
            if (modifiedPaths.length > 0) {
              setProgressMessage(
                `Incremental delta detected: fetching ${modifiedPaths.length} modified/added blobs only...`
              );
              freshModifiedFiles = await downloadSourceFiles(
                repo.owner,
                repo.repo,
                repo.branch,
                modifiedPaths.map((p) => ({ path: p, mode: '100644', type: 'blob' as const, sha: '', size: 0, url: '' })),
                githubPat
              );
            }

            activeFiles = applyFileDelta(activeFiles, delta.modifiedFiles, freshModifiedFiles);
            setDeltaStatus('cached');
          }
        }
      }

      return { activeFiles };
    },
    []
  );

  return { verifyOnOpen, prepareCompileFiles };
}

async function refreshModifiedFiles(
  repo: RepoDeltaIdentity,
  githubPat: string | undefined,
  modifiedFiles: { path: string; status: string }[]
): Promise<SourceFile[]> {
  const modifiedEligible = modifiedFiles.filter(
    (f) =>
      f.status !== 'removed' &&
      shouldIncludeFile(f.path, undefined, repo.excludedPatterns)
  );
  const modifiedPaths = modifiedEligible.map((f) => f.path);

  let freshModifiedFiles: SourceFile[] = [];
  if (modifiedPaths.length > 0) {
    freshModifiedFiles = await downloadSourceFiles(
      repo.owner,
      repo.repo,
      repo.branch,
      modifiedPaths.map((p) => ({ path: p, mode: '100644', type: 'blob' as const, sha: '', size: 0, url: '' })),
      githubPat
    );
  }
  return freshModifiedFiles;
}
