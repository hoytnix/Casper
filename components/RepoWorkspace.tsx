'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  GitBranch,
  FolderTree,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Compass,
  Layers,
  Coins,
  Sparkles,
  HelpCircle,
  Zap,
} from 'lucide-react';
import {
  Repo,
  ChatMessage,
  IngestionProgress,
  IngestionSnapshot,
  AppSettings,
  ExplorationStep,
  SourceFile,
  ModelCostDetails,
  IngestionMode,
  DetectedFramework,
} from '@/types';
import { ContextInspector } from './ContextInspector';
import { ChatCompiler } from './ChatCompiler';
import {
  fetchRepoBranches,
  fetchRepoTree,
  shouldIncludeFile,
  downloadSourceFiles,
  assembleRepositoryContextPayload,
  fetchRepoDelta,
  applyFileDelta,
} from '@/lib/github';
import { warmUpLocalContextRouter, routeNextJsContext } from '@/lib/local-context-router';
import { detectRepositoryFramework, frameworkBadgeLabel } from '@/lib/framework-detector';
import { formatCostUsd, calculateModelCost, resolveModelPricing, extractSuggestedRefactors } from '@/lib/utils';

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

    // Pre-warm local AI router if snapshot files exist
    if (snapshot && snapshot.files && snapshot.files.length > 0) {
      warmUpLocalContextRouter(
        snapshot.files,
        `${repo.owner}/${repo.repo}-${repo.branch}`,
        settings.routerEngine || 'auto'
      ).catch((e) => console.warn('Local router pre-warm note:', e));
    }

    return () => {
      isMounted = false;
    };
  }, [repo.owner, repo.repo, settings.githubPat, repo.branch, settings.routerEngine, snapshot]);

  const snapshotRef = useRef(snapshot);
  const saveSnapshotRef = useRef(saveSnapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    saveSnapshotRef.current = saveSnapshot;
  }, [saveSnapshot]);

  // AST-Aware Incremental Delta Verification on Repo Open or Branch Selection
  useEffect(() => {
    let isCancelled = false;

    const checkIncrementalDelta = async () => {
      const snap = snapshotRef.current;
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
          settings.githubPat
        );

        if (isCancelled) return;

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
          settings.githubPat
        );

        if (isCancelled) return;

        if (delta.isFastForward) {
          if (delta.modifiedFiles.length > 0) {
            setDeltaStatus('syncing');
            const modifiedEligible = delta.modifiedFiles.filter(
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
                settings.githubPat
              );
            }

            if (isCancelled) return;

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
            saveSnapshotRef.current(repo.id, updatedSnapshot);
            setDeltaStatus('cached');
          } else {
            // Fast forward without source changes
            const updatedSnapshot: IngestionSnapshot = {
              ...snap,
              commitSha: latestSha,
              timestamp: Date.now(),
            };
            saveSnapshotRef.current(repo.id, updatedSnapshot);
            setDeltaStatus('cached');
          }
        } else {
          setDeltaStatus('outdated');
        }
      } catch (err) {
        console.warn('Delta background verification note:', err);
        if (!isCancelled) setDeltaStatus('idle');
      }
    };

    checkIncrementalDelta();

    return () => {
      isCancelled = true;
    };
  }, [repo.id, repo.owner, repo.repo, repo.branch, settings.githubPat, repo.excludedPatterns]);

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
  const handleCompilePrompt = async (promptText: string) => {
    let currentAssistantMsgId: string | null = null;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptText,
      timestamp: Date.now(),
    };

    const updatedMessagesWithUser = [...messages, userMsg];
    setMessages(updatedMessagesWithUser);
    saveMessages(repo.id, updatedMessagesWithUser);

    try {
      // Step 1: Fetch Latest Git Tree
      setProgress({
        step: 'fetching_tree',
        message: 'Fetching latest commit tree skeleton from GitHub...',
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

      // ==========================================
      // AST-AWARE INCREMENTAL DELTA CACHE & INGESTION
      // ==========================================
      const currentCommitSha = snapshot?.commitSha;
      let activeFiles: SourceFile[] = snapshot?.files || [];
      let deltaFetched = false;

      if (currentCommitSha && activeFiles.length > 0) {
        if (currentCommitSha === commitSha) {
          // Exact match: 0 blob downloads required
          setProgress((prev) => ({
            ...prev,
            message: `Snapshot matches remote HEAD (${commitSha.slice(0, 7)}). Zero file downloads required.`,
          }));
          deltaFetched = true;
          setDeltaStatus('cached');
        } else {
          // Commit SHA changed: query GitHub compare API for incremental delta
          setProgress((prev) => ({
            ...prev,
            message: `Comparing commits ${currentCommitSha.slice(0, 7)}...${commitSha.slice(0, 7)} for delta...`,
          }));

          const delta = await fetchRepoDelta(
            repo.owner,
            repo.repo,
            currentCommitSha,
            commitSha,
            settings.githubPat
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
              setProgress((prev) => ({
                ...prev,
                message: `Incremental delta detected: fetching ${modifiedPaths.length} modified/added blobs only...`,
              }));
              freshModifiedFiles = await downloadSourceFiles(
                repo.owner,
                repo.repo,
                repo.branch,
                modifiedPaths.map((p) => ({ path: p, mode: '100644', type: 'blob' as const, sha: '', size: 0, url: '' })),
                settings.githubPat
              );
            }

            activeFiles = applyFileDelta(activeFiles, delta.modifiedFiles, freshModifiedFiles);
            deltaFetched = true;
            setDeltaStatus('cached');
          }
        }
      }

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

        const assistantMsgId = `assistant-${Date.now()}`;
        currentAssistantMsgId = assistantMsgId;
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
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
          },
        };

        const messagesWithAssistantPlaceholder = [
          ...updatedMessagesWithUser,
          assistantMsg,
        ];
        setMessages(messagesWithAssistantPlaceholder);

        // ==========================================
        // SERVER-SIDE SYNTHESIS & STREAM PROMPT
        // ==========================================
        setProgress({
          step: 'compiling_prompt',
          message: `Synthesizing Casper execution prompt via ${routerEngineUsed} (${routerLatencyMs}ms)...`,
          explorationTrail: [explorationStepRecord],
        });

        // Multi-turn state: prior turns travel as the stable conversation
        // prefix (server normalizes + bounds them) while the snapshot cache
        // above keeps investigated-file downloads at zero for unchanged SHAs.
        const conversationHistory = messages
          .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch('/api/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            owner: repo.owner,
            repo: repo.repo,
            branch: repo.branch,
            treeListing,
            investigatedFiles: downloadedInvestigated,
            conversationHistory,
            improvementPrompt: promptText,
            customApiKey: settings.customApiKey,
            customMuseApiKey: settings.museApiKey,
            githubPat: settings.githubPat,
            routerEngine: routerEngineUsed,
            models: settings.models,
            maxRounds: settings.maxAgenticRounds || 3,
            requestTimeout: settings.requestTimeout || 60,
          }),
        });

          // Guard against reverse proxy warmup/timeout HTML pages
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/html')) {
            const rawHtml = await response.text().catch(() => '');
            if (
              rawHtml.includes('Starting Server') ||
              rawHtml.includes('warmup') ||
              rawHtml.includes('<!doctype')
            ) {
              throw new Error(
                'Server gateway warmup screen intercepted. The upstream request timed out. Please try compiling again.'
              );
            }
            throw new Error(`Compiler returned HTML (${response.status}) instead of an event stream.`);
          }

          if (!response.ok) {
            const errorJson = await response.json().catch(() => null);
            throw new Error(errorJson?.error || `Agentic server error (${response.status})`);
          }

          if (!response.body) {
            throw new Error('No streaming response body received');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let accumulatedContent = '';
          const currentTrail: ExplorationStep[] = [];
          let investigatedCount = 0;
          let investigatedFiles: SourceFile[] = [];
          let modelUsed = '';
          let serverFramework: string | null = null;
          let fallbackPass = 1;
          let accumulatedThinking = '';
          let serverInputTokens = 3500;
          let finalCostDetails: ModelCostDetails | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const rawEvent of events) {
              const line = rawEvent.trim();
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6);

              try {
                const evt = JSON.parse(jsonStr);

                if (evt.type === 'agent_round') {
                  setProgress((prev) => ({
                    ...prev,
                    step: 'agentic_exploring',
                    currentRound: evt.round,
                    message: evt.message,
                  }));
                } else if (evt.type === 'agent_inspect') {
                  setProgress((prev) => ({
                    ...prev,
                    step: 'agentic_exploring',
                    message: `Round ${evt.round}: Investigating ${evt.paths.length} suspect files...`,
                    activePaths: evt.paths,
                  }));
                } else if (evt.type === 'agent_files_loaded') {
                  if (evt.step) {
                    currentTrail.push(evt.step);
                  }
                  investigatedCount = evt.totalInvestigated || investigatedCount;
                  setProgress((prev) => ({
                    ...prev,
                    explorationTrail: [...currentTrail],
                    loadedFiles: investigatedCount,
                  }));
                } else if (evt.type === 'compiling_start') {
                  modelUsed = evt.model || modelUsed;
                  fallbackPass = evt.pass || fallbackPass;
                  if (evt.detectedFramework) serverFramework = evt.detectedFramework;
                  if (evt.inputTokens) {
                    serverInputTokens = evt.inputTokens;
                  }
                  const initialCost = calculateModelCost(
                    modelUsed || 'gemini-3.8-flash',
                    serverInputTokens,
                    50
                  );
                  setProgress((prev) => ({
                    ...prev,
                    step: 'compiling_prompt',
                    message: `Synthesizing Antigravity prompt from ${investigatedCount} locked context files...`,
                    explorationTrail: [...currentTrail],
                    inputTokens: serverInputTokens,
                    costDetails: initialCost,
                  }));
                } else if (evt.type === 'thinking_start') {
                  setProgress((prev) => ({
                    ...prev,
                    step: 'compiling_prompt',
                    message: evt.message || 'Model thinking in progress...',
                    thinkingContent: '',
                  }));
                } else if (evt.type === 'thinking_chunk') {
                  accumulatedThinking += evt.text || '';
                  setProgress((prev) => ({
                    ...prev,
                    thinkingContent: accumulatedThinking,
                  }));
                } else if (evt.type === 'thinking_end') {
                  setProgress((prev) => ({
                    ...prev,
                    message: 'Model reasoning complete. Streaming compiled prompt...',
                  }));
                } else if (evt.type === 'prompt_chunk') {
                  accumulatedContent += evt.text || '';
                  const cleanDisplayPrompt = extractSuggestedRefactors(accumulatedContent).cleanPrompt;
                  const currentOutputTokens = Math.max(1, Math.ceil(accumulatedContent.length / 4));
                  const dynamicCost = calculateModelCost(
                    modelUsed || 'gemini-3.8-flash',
                    serverInputTokens,
                    currentOutputTokens
                  );
                  finalCostDetails = dynamicCost;

                  setProgress((prev) => ({
                    ...prev,
                    outputTokens: currentOutputTokens,
                    costDetails: dynamicCost,
                  }));

                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? {
                            ...m,
                            content: cleanDisplayPrompt,
                            thinkingContent: accumulatedThinking || undefined,
                            costDetails: dynamicCost,
                            snapshotMeta: {
                              ...m.snapshotMeta!,
                              filesCount: investigatedCount,
                              tokensCount: serverInputTokens,
                              inputTokensCount: serverInputTokens,
                              outputTokensCount: currentOutputTokens,
                              modelUsed,
                              fallbackPass,
                              mode: 'agentic' as const,
                              explorationTrail: currentTrail,
                              thinkingContent: accumulatedThinking || undefined,
                              costDetails: dynamicCost,
                              inputTokens: serverInputTokens,
                              outputTokens: currentOutputTokens,
                              totalCostUsd: dynamicCost.totalCostUsd,
                              modelPricing: resolveModelPricing(modelUsed || dynamicCost.modelName),
                            },
                          }
                        : m
                    )
                  );
                } else if (evt.type === 'suggested_refactors') {
                  const refactors = evt.refactors || [];
                  const cleanText = evt.cleanPrompt || extractSuggestedRefactors(accumulatedContent).cleanPrompt;
                  accumulatedContent = cleanText;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? {
                            ...m,
                            content: cleanText,
                            suggestedRefactors: refactors.length > 0 ? refactors : undefined,
                            snapshotMeta: {
                              ...m.snapshotMeta!,
                              suggestedRefactors: refactors.length > 0 ? refactors : undefined,
                            },
                          }
                        : m
                    )
                  );
                } else if (evt.type === 'done') {
                  modelUsed = evt.model || modelUsed;
                  fallbackPass = evt.pass || fallbackPass;
                  if (evt.detectedFramework) serverFramework = evt.detectedFramework;
                  if (evt.inputTokens) serverInputTokens = evt.inputTokens;
                  const finalCleanText = evt.cleanContent || extractSuggestedRefactors(accumulatedContent).cleanPrompt;
                  accumulatedContent = finalCleanText;
                  if (evt.suggestedRefactors && Array.isArray(evt.suggestedRefactors)) {
                    const refactors = evt.suggestedRefactors;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              content: finalCleanText,
                              suggestedRefactors: refactors.length > 0 ? refactors : undefined,
                              snapshotMeta: {
                                ...m.snapshotMeta!,
                                suggestedRefactors: refactors.length > 0 ? refactors : undefined,
                              },
                            }
                          : m
                      )
                    );
                  }
                  const finalOutputTokens =
                    evt.outputTokens || Math.max(1, Math.ceil(accumulatedContent.length / 4));
                  if (evt.costDetails) {
                    finalCostDetails = evt.costDetails;
                  } else {
                    finalCostDetails = calculateModelCost(
                      modelUsed || 'gemini-3.8-flash',
                      serverInputTokens,
                      finalOutputTokens
                    );
                  }
                  if (evt.investigatedFiles && Array.isArray(evt.investigatedFiles)) {
                    investigatedFiles = evt.investigatedFiles;
                  }
                } else if (evt.type === 'error') {
                  throw new Error(evt.error || 'Agentic exploration failed');
                }
              } catch (parseErr) {
                console.warn('Could not parse SSE event:', parseErr);
              }
            }
          }

          const { cleanPrompt: finalCleanContent, refactors: finalParsedRefactors } = extractSuggestedRefactors(accumulatedContent);
          accumulatedContent = finalCleanContent;

          const finalTokensCount = Math.max(1, Math.ceil(accumulatedContent.length / 4));
          const calculatedCost =
            finalCostDetails ||
            calculateModelCost(
              modelUsed || 'gemini-3.8-flash',
              serverInputTokens,
              finalTokensCount
            );

          // Persist framework classification (server-detected preferred, live fallback)
          const snapshotFramework: DetectedFramework =
            serverFramework === 'hono' || serverFramework === 'nextjs' || serverFramework === 'unknown'
              ? serverFramework
              : detectRepositoryFramework(
                  activeFiles.length > 0 ? activeFiles : downloadedInvestigated,
                  allBlobPaths
                );

          // Save Snapshot with complete cost metrics and cached activeFiles
          const agentSnapshot: IngestionSnapshot = {
            owner: repo.owner,
            repo: repo.repo,
            branch: repo.branch,
            detectedFramework: snapshotFramework,
            commitSha,
            totalTreeBlobs: allBlobPaths.length,
            includedFilesCount: activeFiles.length > 0 ? activeFiles.length : downloadedInvestigated.length,
            estimatedTokens: serverInputTokens,
            charCount: estimatedInputChars,
            inputTokens: serverInputTokens,
            outputTokens: finalTokensCount,
            timestamp: Date.now(),
            treeListing,
            files: activeFiles.length > 0 ? activeFiles : downloadedInvestigated,
            mode: 'agentic' as const,
            explorationTrail: [explorationStepRecord],
            toolTraces,
            costDetails: calculatedCost,
            totalCostUsd: calculatedCost.totalCostUsd,
            modelPricing: resolveModelPricing(modelUsed || calculatedCost.modelName),
          };

          saveSnapshot(repo.id, agentSnapshot);
          onUpdateRepo(repo.id, { lastSyncedAt: Date.now(), detectedFramework: snapshotFramework });

          const finalMessages: ChatMessage[] = messagesWithAssistantPlaceholder.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: finalCleanContent,
                  thinkingContent: accumulatedThinking || undefined,
                  costDetails: calculatedCost,
                  suggestedRefactors: m.suggestedRefactors || (finalParsedRefactors.length > 0 ? finalParsedRefactors : undefined),
                  snapshotMeta: {
                    ...m.snapshotMeta!,
                    filesCount: downloadedInvestigated.length,
                    tokensCount: serverInputTokens,
                    inputTokensCount: serverInputTokens,
                    outputTokensCount: finalTokensCount,
                    modelUsed,
                    fallbackPass,
                    mode: 'agentic' as const,
                    explorationTrail: [explorationStepRecord],
                    thinkingContent: accumulatedThinking || undefined,
                    costDetails: calculatedCost,
                    inputTokens: calculatedCost.inputTokens,
                    outputTokens: calculatedCost.outputTokens,
                    totalCostUsd: calculatedCost.totalCostUsd,
                    modelPricing: resolveModelPricing(modelUsed || calculatedCost.modelName),
                    suggestedRefactors: m.suggestedRefactors || (finalParsedRefactors.length > 0 ? finalParsedRefactors : undefined),
                  },
                }
              : m
          );
          saveMessages(repo.id, finalMessages);

          // Automatically log expense into token cost records ledger / finance DB
          try {
            const FINANCE_STORAGE_KEY = 'nextjs_expert_token_records_v1';
            const tokenRecord = {
              id: `tok-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              repoName: `${repo.owner}/${repo.repo}`,
              modelName: modelUsed || calculatedCost.modelName || 'gemini-4-argon',
              inputTokens: calculatedCost.inputTokens,
              outputTokens: calculatedCost.outputTokens,
              cachedInputTokens: calculatedCost.cachedInputTokens ?? 0,
              cachedInputCostUsd: calculatedCost.cachedInputCostUsd ?? 0,
              totalCostUsd: calculatedCost.totalCostUsd,
              date: new Date().toISOString().split('T')[0],
              notes: `Prompt compilation (${mode} mode): "${promptText.slice(0, 50)}..."`,
              title: `${repo.owner}/${repo.repo} compilation`,
              amount: calculatedCost.totalCostUsd,
              category: modelUsed || calculatedCost.modelName || 'gemini-4-argon',
              type: 'expense' as const,
            };

            const existingStored = localStorage.getItem(FINANCE_STORAGE_KEY);
            let existingRecords = [];
            if (existingStored) {
              const parsed = JSON.parse(existingStored);
              if (Array.isArray(parsed)) {
                // Clean any legacy mock records as well
                existingRecords = parsed.filter((r: any) => {
                  if (!r.id) return false;
                  const isLegacyMockId = /^tok-([1-9]|10)$/.test(r.id);
                  const isLegacyMockRepo = ['facebook/react', 'vercel/next.js', 'tailwindlabs/tailwindcss', 'shadcn/ui', 'supabase/supabase'].includes(r.repoName) && r.date?.startsWith('2026-05-');
                  return !(isLegacyMockId || isLegacyMockRepo);
                });
              }
            }
            const updatedLedger = [tokenRecord, ...existingRecords];
            localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(updatedLedger));

            // Also post to API route
            fetch('/api/finance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                repoName: `${repo.owner}/${repo.repo}`,
                modelName: modelUsed || calculatedCost.modelName || 'gemini-4-argon',
                inputTokens: calculatedCost.inputTokens,
                outputTokens: calculatedCost.outputTokens,
                cachedInputTokens: calculatedCost.cachedInputTokens ?? 0,
                cachedInputCostUsd: calculatedCost.cachedInputCostUsd ?? 0,
                totalCostUsd: calculatedCost.totalCostUsd,
                date: new Date().toISOString().split('T')[0],
                notes: `Prompt compilation (${mode} mode): "${promptText.slice(0, 50)}..."`,
              }),
            }).catch(() => {});
          } catch (autoLogError) {
            console.warn('Failed to auto-log token expense:', autoLogError);
          }

          setProgress({
            step: 'completed',
            message: 'Compilation complete',
            explorationTrail: [explorationStepRecord],
            costDetails: calculatedCost,
            inputTokens: calculatedCost.inputTokens,
            outputTokens: calculatedCost.outputTokens,
          });

      } catch (err: unknown) {
      console.error('Compilation failed:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      
      // Update assistant message with a clean markdown notice so the placeholder is not left blank or corrupted
      if (currentAssistantMsgId) {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === currentAssistantMsgId
              ? {
                  ...m,
                  content: `> ⚠️ **Compilation Error:** ${errMsg}\n\nPlease click **Recompile Prompt** or toggle to **Agentic Loop** mode for fast selective file exploration.`,
                }
              : m
          );
          saveMessages(repo.id, updated);
          return updated;
        });
      }

      setProgress({
        step: 'error',
        message: 'Compilation failed',
        error: errMsg,
      });
    }
  };

  const getStatusBadge = () => {
    switch (progress.step) {
      case 'fetching_tree':
      case 'downloading_files':
        return (
          <div className="flex items-center gap-1.5 text-sky-400 text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Fetching repo tree...</span>
          </div>
        );
      case 'agentic_exploring':
        return (
          <div className="flex items-center gap-1.5 text-indigo-300 text-xs font-medium">
            <Compass className="w-3.5 h-3.5 animate-spin" />
            <span>Exploring (Round {progress.currentRound || 1})...</span>
          </div>
        );
      case 'compiling_prompt':
        return (
          <div className="flex items-center gap-1.5 text-violet-300 text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Compiling prompt...</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1.5 text-rose-400 text-xs font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Failed</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Ready</span>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-[calc(100vh-3.75rem)]">
      {/* Workspace Sub-Header */}
      <div className="h-13 border-b border-white/[0.08] bg-[#07090e]/70 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 flex-wrap">
        {/* Repo & Branch Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-slate-400">{repo.owner}/</span>
            <span className="font-mono font-bold text-white text-sm">{repo.repo}</span>
            <a
              href={`https://github.com/${repo.owner}/${repo.repo}`}
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 hover:text-indigo-400 transition ml-0.5"
              title="Open on GitHub"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Detected Framework Badge */}
          {detectedFramework !== 'unknown' && (
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold ${
                detectedFramework === 'hono'
                  ? 'bg-orange-950/40 border-orange-500/25 text-orange-300'
                  : 'bg-indigo-950/40 border-indigo-500/25 text-indigo-300'
              }`}
              title={`Detected framework: ${frameworkBadgeLabel(detectedFramework)}`}
            >
              <Layers className="w-3 h-3" />
              {frameworkBadgeLabel(detectedFramework)}
            </span>
          )}

          <span className="text-slate-700" aria-hidden="true">|</span>

          {/* Branch Picker */}
          <div className="relative flex items-center">
            <GitBranch className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
            <select
              value={repo.branch}
              onChange={(e) => handleBranchChange(e.target.value)}
              disabled={isBranchLoading}
              className="bg-slate-900 border border-white/[0.08] hover:border-white/20 text-slate-200 text-xs font-mono rounded-lg px-2.5 py-1 outline-none focus:border-indigo-500 transition cursor-pointer"
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* AST-Aware Incremental Delta Cache Status */}
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-white/[0.08] text-xs font-mono"
            title={
              snapshot?.commitSha
                ? `IndexedDB Snapshot Commit SHA: ${snapshot.commitSha}\nCached Files in VFS: ${snapshot.files?.length || 0}`
                : 'No cached snapshot in IndexedDB yet'
            }
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Delta Cache:</span>
            {deltaStatus === 'cached' && snapshot?.commitSha ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                {snapshot.commitSha.slice(0, 7)}
              </span>
            ) : deltaStatus === 'syncing' ? (
              <span className="text-sky-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Syncing...
              </span>
            ) : deltaStatus === 'checking' ? (
              <span className="text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Checking...
              </span>
            ) : snapshot?.commitSha ? (
              <span className="text-slate-300">{snapshot.commitSha.slice(0, 7)}</span>
            ) : (
              <span className="text-slate-500">Uncached</span>
            )}
          </div>
        </div>

        {/* Controls: Mode Switcher, Status & Drawer Toggle */}
        <div className="flex items-center gap-3">
          {/* Mode Switcher Segmented Control */}
          <div className="flex items-center bg-slate-900/90 border border-white/[0.08] rounded-lg p-0.5 text-xs overflow-x-auto">
            <button
              type="button"
              onClick={() => handleToggleMode('agentic')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition whitespace-nowrap ${
                mode === 'agentic'
                  ? 'bg-indigo-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Prompt: Agentic Sequential Exploration & Compilation"
            >
              <Compass className="w-3 h-3" />
              <span>Prompt</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode('idea')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition whitespace-nowrap ${
                mode === 'idea'
                  ? 'bg-amber-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Ideas: Generates 77 ideas ranked by RICE & VRIN-EO"
            >
              <Sparkles className="w-3 h-3" />
              <span>Ideas</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode('btw')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition whitespace-nowrap ${
                mode === 'btw'
                  ? 'bg-emerald-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="BTW: Direct conversational codebase answers with @[/path] citations"
            >
              <HelpCircle className="w-3 h-3" />
              <span>BTW</span>
            </button>
          </div>

          {/* Dynamic API Cost Indicator */}
          {snapshot?.costDetails && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 font-mono text-xs shadow-sm cursor-help"
              title={`Latest Snapshot API Cost: ${formatCostUsd(snapshot.costDetails.totalCostUsd)}\n• Model: ${snapshot.costDetails.modelName}\n• Input: ${snapshot.costDetails.inputTokens.toLocaleString()} tokens ($${snapshot.costDetails.inputCostUsd.toFixed(6)})\n• Output: ${snapshot.costDetails.outputTokens.toLocaleString()} tokens ($${snapshot.costDetails.outputCostUsd.toFixed(6)})${(snapshot.costDetails.cachedInputTokens ?? 0) > 0 ? `\n• Cached input: ${(snapshot.costDetails.cachedInputTokens ?? 0).toLocaleString()} tokens ($${(snapshot.costDetails.cachedInputCostUsd ?? 0).toFixed(6)})` : ''}`}
            >
              <Coins className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="font-semibold text-emerald-300 tabular-nums">
                {formatCostUsd(snapshot.costDetails.totalCostUsd)}
              </span>
            </div>
          )}

          {getStatusBadge()}

          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-medium transition ${
              isDrawerOpen
                ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300'
                : 'bg-slate-900 border-white/[0.08] text-slate-400 hover:text-white'
            }`}
            title="Toggle Context Inspector"
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Context Inspector</span>
          </button>
        </div>
      </div>

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
          onRetryPrompt={(promptText) => {
            handleCompilePrompt(promptText);
          }}
          snapshot={snapshot}
        />
      </div>
    </div>
  );
};
