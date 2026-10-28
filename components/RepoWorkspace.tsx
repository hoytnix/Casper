'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type {
  Repo,
  ChatMessage,
  ImageAttachment,
  IngestionProgress,
  IngestionSnapshot,
  AppSettings,
  ExplorationStep,
  SourceFile,
  IngestionMode,
  DetectedFramework,
} from '@/types';
import {
  chatImagesSchema,
  estimateImagesTokens,
  sumImageBytes,
} from '@/lib/image-attachments';
import { ContextInspector } from './ContextInspector';
import { ChatCompiler } from './ChatCompiler';
import { WorkspaceHeader } from './WorkspaceHeader';
import {
  fetchRepoBranches,
  fetchRepoTree,
  shouldIncludeFile,
  downloadSourceFiles,
} from '@/lib/github';
import { warmUpLocalContextRouter, routeNextJsContext } from '@/lib/local-context-router';
import { detectRepositoryFramework } from '@/lib/framework-detector';
import { replaceAssistantContent } from '@/lib/utils';
import { normalizeThinkingLevel, normalizeThinkingSummaries } from '@/lib/thinking-levels';
import { normalizeSearchContextSize } from '@/lib/search-grounding';
import { useRepoDeltaSync } from '@/hooks/useRepoDeltaSync';
import { useCompileStream } from '@/hooks/useCompileStream';

interface RepoWorkspaceProps {
  repo: Repo;
  settings: AppSettings;
  onUpdateRepo: (id: string, updates: Partial<Repo>) => void;
  loadMessages: (repoId: string) => ChatMessage[];
  saveMessages: (repoId: string, messages: ChatMessage[]) => void;
  clearMessages: (repoId: string) => void;
  snapshot: IngestionSnapshot | null;
  saveSnapshot: (repoId: string, snapshot: IngestionSnapshot) => void;
}

export const RepoWorkspace: React.FC<RepoWorkspaceProps> = ({
  repo,
  settings,
  onUpdateRepo,
  loadMessages,
  saveMessages,
  clearMessages,
  snapshot,
  saveSnapshot,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(repo.id));
  const [branches, setBranches] = useState<string[]>([repo.branch]);
  const [isBranchLoading, setIsBranchLoading] = useState(true);
  const [mode, setMode] = useState<IngestionMode>(
    repo.preferredMode || settings.defaultMode || 'agentic'
  );
  const [deltaStatus, setDeltaStatus] = useState<
    'idle' | 'checking' | 'cached' | 'syncing' | 'outdated'
  >(snapshot?.commitSha ? 'cached' : 'idle');

  const [progress, setProgress] = useState<IngestionProgress>({
    step: 'idle',
    message: 'Ready',
  });

  // Detected framework badge: persisted classification first, live detection fallback
  const detectedFramework = useMemo(() => {
    if (repo.detectedFramework) return repo.detectedFramework;
    if (snapshot?.detectedFramework) return snapshot.detectedFramework;
    if (snapshot?.files && snapshot.files.length > 0) {
      const treePaths = (snapshot.treeListing || '')
        .split('\n')
        .map((l) => l.replace(/^@\[\//, '').replace(/\]$/, '').trim())
        .filter((p) => p.length > 0);
      return detectRepositoryFramework(snapshot.files, treePaths);
    }
    return 'unknown' as const;
  }, [repo.detectedFramework, snapshot]);

  // Fetch branches on mount and pre-warm local AI context router
  useEffect(() => {
    let isMounted = true;
    fetchRepoBranches(repo.owner, repo.repo, settings.githubPat)
      .then((bList) => {
        if (!isMounted) return;
        if (bList.length > 0) {
          setBranches(Array.from(new Set([repo.branch, ...bList])));
        }
      })
      .catch((e) => console.warn('Could not load branches:', e))
      .finally(() => {
        if (isMounted) setIsBranchLoading(false);
      });

    // Pre-warm local AI router if snapshot files exist.
    // Suggestion directives reuse these warmed Nano/Arctic engines client-side
    // (ChatCompiler calls generateSuggestedDirectives locally — no server
    // /api/compile fetch, no API cost, offline-safe). Fire-and-forget: no
    // blocking await. No wrangler binding sync needed (N/A, local-only).
    // Deferred to idle: mount-time embedding saturated the main thread and
    // overlapped first keystrokes (the multi-second input-delay outlier in
    // INP traces), so it must never run inside the mount commit.
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    if (snapshot && snapshot.files && snapshot.files.length > 0) {
      const warmupFiles = snapshot.files;
      const warmupKey = `${repo.owner}/${repo.repo}-${repo.branch}`;
      const warmupEngine = settings.routerEngine || 'auto';
      const runWarmup = () => {
        if (!isMounted) return;
        warmUpLocalContextRouter(warmupFiles, warmupKey, warmupEngine).catch((e) =>
          console.warn('Local router pre-warm note:', e)
        );
      };
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      };
      if (typeof w.requestIdleCallback === 'function') {
        idleHandle = w.requestIdleCallback(runWarmup, { timeout: 3000 });
      } else {
        timeoutHandle = setTimeout(runWarmup, 1500);
      }
    }

    return () => {
      isMounted = false;
      if (idleHandle !== null) {
        const w = window as Window & { cancelIdleCallback?: (handle: number) => void };
        if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    };
  }, [repo.owner, repo.repo, settings.githubPat, repo.branch, settings.routerEngine, snapshot]);

  const { verifyOnOpen, prepareCompileFiles } = useRepoDeltaSync({
    repo,
    githubPat: settings.githubPat,
    getSnapshot: () => snapshot,
    saveSnapshot,
    setDeltaStatus,
    setProgressMessage: (message) => setProgress((prev) => ({ ...prev, message })),
  });

  const { claimOwnership, isOwned, release, runStream } = useCompileStream({
    setMessages,
    setProgress,
    saveMessages,
    saveSnapshot,
    onUpdateRepo,
  });

  // AST-Aware Incremental Delta Verification on Repo Open or Branch Selection
  useEffect(() => {
    let isCancelled = false;
    verifyOnOpen(() => isCancelled);
    return () => {
      isCancelled = true;
    };
  }, [repo.id, repo.owner, repo.repo, repo.branch, settings.githubPat, repo.excludedPatterns, verifyOnOpen]);

  // Handle branch switch
  const handleBranchChange = (newBranch: string) => {
    onUpdateRepo(repo.id, { branch: newBranch });
  };

  // Toggle Mode
  const handleToggleMode = (newMode: IngestionMode) => {
    setMode(newMode);
    onUpdateRepo(repo.id, { preferredMode: newMode });
  };

  // Handle exclude pattern updates
  const handleUpdateExcludes = (newExcludes: string[]) => {
    onUpdateRepo(repo.id, { excludedPatterns: newExcludes });
  };

  // Live Ingestion & Compilation Pipeline (Agentic or Full)
  const handleCompilePrompt = async (promptText: string, images: ImageAttachment[] = []) => {
    let currentAssistantMsgId: string | null = null;
    // Client-side image validation first: reject before any state or network.
    const imageCheck = chatImagesSchema.safeParse(images);
    if (!imageCheck.success) {
      setProgress({
        step: 'error',
        message: 'Compilation failed',
        error: `Attached images exceed limits (max 4, 5MB each, 7MB total).`,
      });
      return;
    }
    const compileId = await claimOwnership();
    const validImages = imageCheck.data;
    const imageTokens = estimateImagesTokens(validImages);
    const imageBytesTotal = sumImageBytes(validImages);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptText,
      timestamp: Date.now(),
      ...(validImages.length > 0 ? { images: validImages, imageTokensCount: imageTokens } : {}),
    };

    const updatedMessagesWithUser = [...messages, userMsg];
    setMessages(updatedMessagesWithUser);
    saveMessages(repo.id, updatedMessagesWithUser);

    try {
      // Step 1: Fetch Latest Git Tree
      setProgress({
        step: 'fetching_tree',
        message: 'Fetching latest commit tree skeleton from GitHub...',
        compileId,
      });

      const { sha: commitSha, tree } = await fetchRepoTree(
        repo.owner,
        repo.repo,
        repo.branch,
        settings.githubPat
      );

      // Filter tree entries
      const eligibleTreeItems = tree.filter(
        (item) =>
          item.type === 'blob' &&
          shouldIncludeFile(item.path, item.size, repo.excludedPatterns)
      );

      if (eligibleTreeItems.length === 0) {
        throw new Error(
          'No eligible source files found in the repository after applying filters.'
        );
      }

      const allBlobPaths = eligibleTreeItems.map((f) => f.path);
      const treeLines = allBlobPaths.map((p) => `@[/${p.replace(/^\//, '')}]`).sort();
      const treeListing = treeLines.join('\n');

      // AST-aware incremental delta cache: fast-forward applies remote
      // changes onto the snapshot without refetching the world. Details
      // live in useRepoDeltaSync; exact-match short-circuits with zero
      // blob downloads.
      const prepared = await prepareCompileFiles({ commitSha, snapshot });
      let activeFiles: SourceFile[] = prepared.activeFiles;

      // ==========================================
      // IN-BROWSER AGENTIC CONTEXT ROUTER (Gemini Nano + Arctic-Embed-XS)
      // ==========================================
      setProgress({
          step: 'agentic_exploring',
          message: 'Running local in-browser context router (Gemini Nano / Arctic-Embed-XS)...',
          currentRound: 1,
          maxRounds: settings.maxAgenticRounds || 3,
          explorationTrail: [],
        });

        // Use cached activeFiles for routing sample if available, saving network overhead
        let routingSampleFiles: SourceFile[] = [];
        if (activeFiles.length > 0) {
          routingSampleFiles = activeFiles.slice(0, 30);
        } else {
          routingSampleFiles = await downloadSourceFiles(
            repo.owner,
            repo.repo,
            repo.branch,
            eligibleTreeItems.slice(0, 30), // Top 30 candidate files for local embedding
            settings.githubPat
          );
        }

        const routingResult = await routeNextJsContext(
          promptText,
          routingSampleFiles,
          `${repo.owner}/${repo.repo}-${repo.branch}`,
          settings.routerEngine || 'auto',
          6,
          (status, pct) => {
            setProgress((prev) => ({
              ...prev,
              step: 'agentic_exploring',
              message: status,
              progressPercent: pct,
            }));
          }
        );

        const targetedPaths = routingResult.selectedPaths;
        const routerEngineUsed = routingResult.engineUsed;
        const routerLatencyMs = routingResult.latencyMs;
        const toolTraces = routingResult.toolTraces || [];

        setProgress({
          step: 'agentic_exploring',
          message: `Running local Unix VFS agent router (${routerEngineUsed})...`,
          currentRound: 1,
          maxRounds: settings.maxAgenticRounds || 3,
          explorationTrail: [],
          toolTraces,
        });

        // Resolve full content for selected paths from activeFiles cache or download only missing files
        const existingPathMap = new Map<string, SourceFile>(activeFiles.map((f) => [f.path, f]));
        const missingFromCache = targetedPaths.filter((p) => !existingPathMap.has(p));

        if (missingFromCache.length > 0) {
          const freshInvestigated = await downloadSourceFiles(
            repo.owner,
            repo.repo,
            repo.branch,
            eligibleTreeItems.filter((item) => missingFromCache.includes(item.path)),
            settings.githubPat
          );
          freshInvestigated.forEach((f) => existingPathMap.set(f.path, f));
          activeFiles = Array.from(existingPathMap.values());
        }

        const downloadedInvestigated = targetedPaths
          .map((p) => existingPathMap.get(p))
          .filter((f): f is SourceFile => !!f);

        const explorationStepRecord: ExplorationStep = {
          id: `local-router-${Date.now()}`,
          round: 1,
          paths: targetedPaths,
          reason: `Routed via ${routerEngineUsed} in ${routerLatencyMs}ms using Unix VFS tool loop & Next.js import closure.`,
          timestamp: Date.now(),
          status: 'completed',
          filesSummary: downloadedInvestigated.map((f) => ({ path: f.path, size: f.size })),
          toolTraces,
        };

        const contextSourceChars = downloadedInvestigated.reduce(
          (acc, f) => acc + (f.content?.length || f.size || 0),
          0
        );
        const estimatedInputChars =
          treeListing.length + contextSourceChars + promptText.length + 500;
        const initialInputTokens = Math.max(1, Math.ceil(estimatedInputChars / 4));

        // Thinking effort travels with every compile request. xhigh/max are
        // Muse-only tiers; the route maps them to high for Gemini models.
        const requestThinkingLevel = normalizeThinkingLevel(settings.thinkingLevel);
        const requestThinkingSummaries = normalizeThinkingSummaries(settings.thinkingSummaries);

        const assistantMsgId = `assistant-${Date.now()}-${compileId.slice(0, 8)}`;
        currentAssistantMsgId = assistantMsgId;
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          thinkingLevel: requestThinkingLevel,
          snapshotMeta: {
            filesCount: downloadedInvestigated.length,
            tokensCount: initialInputTokens,
            inputTokensCount: initialInputTokens,
            commitSha,
            branch: repo.branch,
            mode,
            routerEngine: routerEngineUsed,
            routerLatencyMs,
            toolTraces,
            explorationTrail: [explorationStepRecord],
            thinkingLevel: requestThinkingLevel,
            compileId,
            ...(validImages.length > 0
              ? { imageCount: validImages.length, imageBytes: imageBytesTotal }
              : {}),
          },
        };

        // Functional insert: the placeholder lands on latest state, so a
        // second submit's user echo can never be clobbered by this write.
        // (updatedMessagesWithUser above is still used for the user-echo save.)
        setMessages((prev) => [...prev, assistantMsg]);

        // ==========================================
        // SERVER-SIDE SYNTHESIS & STREAM PROMPT
        // ==========================================
        setProgress({
          step: 'compiling_prompt',
          message: `Synthesizing Casper execution prompt via ${routerEngineUsed} (${routerLatencyMs}ms)...`,
          explorationTrail: [explorationStepRecord],
          ...(validImages.length > 0 ? { activeImageCount: validImages.length } : {}),
        });

        // Multi-turn state: prior turns travel as the stable conversation
        // prefix (server normalizes + bounds them) while the snapshot cache
        // above keeps investigated-file downloads at zero for unchanged SHAs.
        // History stays text-only on purpose: only the current turn carries
        // image base64, so follow-ups never re-send old blobs.
        const conversationHistory = messages
          .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content }));

        // Stream consumption, functional finalization, snapshot persist,
        // and finance auto-log all live in useCompileStream. Failures throw
        // to the catch below, which renders the notice and releases.
        await runStream({
          compileId,
          assistantMsgId,
          requestBody: {
            mode,
            compileId,
            owner: repo.owner,
            repo: repo.repo,
            branch: repo.branch,
            treeListing,
            investigatedFiles: downloadedInvestigated,
            conversationHistory,
            improvementPrompt: promptText,
            images: validImages,
            customApiKey: settings.customApiKey,
            customMuseApiKey: settings.museApiKey,
            githubPat: settings.githubPat,
            thinkingLevel: requestThinkingLevel,
            thinkingSummaries: requestThinkingSummaries,
            searchGrounding: settings.searchGrounding === true,
            searchContextSize: normalizeSearchContextSize(settings.searchContextSize),
            routerEngine: routerEngineUsed,
            models: settings.models,
            maxRounds: settings.maxAgenticRounds || 3,
            requestTimeout: settings.requestTimeout || 60,
          },
          context: {
            repoId: repo.id,
            repoOwner: repo.owner,
            repoName: repo.repo,
            mode,
            promptText,
            treeListing,
            allBlobPaths,
            commitSha,
            activeFiles,
            downloadedInvestigated,
            explorationStepRecord,
            toolTraces,
            estimatedInputChars,
            validImages,
            imageBytesTotal,
            requestThinkingLevel,
          },
        });

      } catch (err: unknown) {
      // Superseded compiles (aborted by a newer submission, e.g. an
      // AbortError from reader.cancel()) exit silently: the new owner
      // already owns messages, progress, and refs.
      if (!isOwned(compileId)) {
        return;
      }
      console.error('Compilation failed:', err);
      const errMsg = err instanceof Error ? err.message : String(err);

      // Update assistant message with a clean markdown notice so the placeholder is not left blank or corrupted
      if (currentAssistantMsgId) {
        const failedAssistantId: string = currentAssistantMsgId;
        const errorNotice = `> ⚠️ **Compilation Error:** ${errMsg}\n\nPlease click **Recompile Prompt** or toggle to **Agentic Loop** mode for fast selective file exploration.`;
        setMessages((prev) => {
          const updated = replaceAssistantContent(prev, failedAssistantId, errorNotice);
          saveMessages(repo.id, updated);
          return updated;
        });
      }

      setProgress({
        step: 'error',
        message: 'Compilation failed',
        error: errMsg,
      });
      release();
    }
  };

  // Stable retry dispatcher: ChatCompiler's memoized bubbles compare
  // onRetryPrompt by identity, and an inline arrow here would be a new
  // function every Workspace render (progress ticks during streaming),
  // busting every bubble's memo. The ref always calls the latest compile
  // closure; synced in an effect (never a render-time ref write).
  const handleCompilePromptRef = React.useRef<
    (promptText: string, images?: ImageAttachment[]) => Promise<void>
  >(async () => {});
  React.useEffect(() => {
    handleCompilePromptRef.current = handleCompilePrompt;
  });
  const stableRetryPrompt = React.useCallback((promptText: string) => {
    void handleCompilePromptRef.current(promptText);
  }, []);


  return (
    <div className="flex-1 flex flex-col min-h-0 h-[calc(100vh-3.75rem)]">
      <WorkspaceHeader
        repo={repo}
        branches={branches}
        isBranchLoading={isBranchLoading}
        detectedFramework={detectedFramework}
        snapshot={snapshot}
        deltaStatus={deltaStatus}
        mode={mode}
        progress={progress}
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
        onBranchChange={handleBranchChange}
        onToggleMode={handleToggleMode}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0 relative">
        <ContextInspector
          isOpen={isDrawerOpen}
          onToggle={() => setIsDrawerOpen(!isDrawerOpen)}
          snapshot={snapshot}
          excludedPatterns={repo.excludedPatterns || []}
          onUpdateExcludes={handleUpdateExcludes}
        />

        <ChatCompiler
          repo={repo}
          messages={messages}
          progress={progress}
          onSendMessage={handleCompilePrompt}
          onClearChat={() => {
            clearMessages(repo.id);
            setMessages([]);
          }}
          onDeleteMessage={(msgId) => {
            const next = messages.filter((m) => m.id !== msgId);
            setMessages(next);
            saveMessages(repo.id, next);
          }}
          onRetryPrompt={stableRetryPrompt}
          snapshot={snapshot}
        />
      </div>
    </div>
  );
};
