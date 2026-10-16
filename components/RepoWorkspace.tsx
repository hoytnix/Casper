'use client';

import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  FolderTree,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Compass,
  Layers,
} from 'lucide-react';
import {
  Repo,
  ChatMessage,
  IngestionProgress,
  IngestionSnapshot,
  AppSettings,
  ExplorationStep,
  SourceFile,
} from '@/types';
import { ContextInspector } from './ContextInspector';
import { ChatCompiler } from './ChatCompiler';
import {
  fetchRepoBranches,
  fetchRepoTree,
  shouldIncludeFile,
  downloadSourceFiles,
  assembleRepositoryContextPayload,
} from '@/lib/github';
import { warmUpLocalContextRouter, routeNextJsContext } from '@/lib/local-context-router';

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
  const [mode, setMode] = useState<'agentic' | 'full'>(
    repo.preferredMode || settings.defaultMode || 'agentic'
  );

  const [progress, setProgress] = useState<IngestionProgress>({
    step: 'idle',
    message: 'Ready',
  });

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
      warmUpLocalContextRouter(snapshot.files, `${repo.owner}/${repo.repo}-${repo.branch}`, settings.routerEngine || 'auto')
        .catch((e) => console.warn('Local router pre-warm note:', e));
    }

    return () => {
      isMounted = false;
    };
  }, [repo.owner, repo.repo, settings.githubPat, repo.branch, settings.routerEngine, snapshot]);

  // Handle branch switch
  const handleBranchChange = (newBranch: string) => {
    onUpdateRepo(repo.id, { branch: newBranch });
  };

  // Toggle Mode
  const handleToggleMode = (newMode: 'agentic' | 'full') => {
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
      // IN-BROWSER AGENTIC CONTEXT ROUTER (Gemini Nano + Arctic-Embed-XS)
      // ==========================================
      setProgress({
        step: 'agentic_exploring',
        message: 'Running local in-browser context router (Gemini Nano / Arctic-Embed-XS)...',
        currentRound: 1,
        maxRounds: 1,
        explorationTrail: [],
      });

      // Fetch sample source files for routing
      const routingSampleFiles = await downloadSourceFiles(
        repo.owner,
        repo.repo,
        repo.branch,
        eligibleTreeItems.slice(0, 30), // Top 30 candidate files for local embedding
        settings.githubPat
      );

      const routingResult = await routeNextJsContext(
        promptText,
        routingSampleFiles,
        `${repo.owner}/${repo.repo}-${repo.branch}`,
        settings.routerEngine || 'auto',
        6
      );

      const targetedPaths = routingResult.selectedPaths;
      const routerEngineUsed = routingResult.engineUsed;
      const routerLatencyMs = routingResult.latencyMs;
      const toolTraces = routingResult.toolTraces || [];

      setProgress({
        step: 'agentic_exploring',
        message: `Running local Unix VFS agent router (${routerEngineUsed})...`,
        currentRound: 1,
        maxRounds: 1,
        explorationTrail: [],
        toolTraces,
      });

      // Download full content for selected paths
      const downloadedInvestigated = await downloadSourceFiles(
        repo.owner,
        repo.repo,
        repo.branch,
        eligibleTreeItems.filter((item) => targetedPaths.includes(item.path)),
        settings.githubPat
      );

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

      const assistantMsgId = `assistant-${Date.now()}`;
      currentAssistantMsgId = assistantMsgId;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        snapshotMeta: {
          filesCount: downloadedInvestigated.length,
          tokensCount: 0,
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
        message: `Synthesizing Next.js Expert execution prompt via ${routerEngineUsed} (${routerLatencyMs}ms)...`,
        explorationTrail: [explorationStepRecord],
      });

      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'agentic',
          owner: repo.owner,
          repo: repo.repo,
          branch: repo.branch,
          treeListing,
          investigatedFiles: downloadedInvestigated,
          improvementPrompt: promptText,
          customApiKey: settings.customApiKey,
          githubPat: settings.githubPat,
          routerEngine: routerEngineUsed,
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
        let fallbackPass = 1;

        let accumulatedThinking = '';

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
                setProgress((prev) => ({
                  ...prev,
                  step: 'compiling_prompt',
                  message: `Synthesizing Antigravity prompt from ${investigatedCount} locked context files...`,
                  explorationTrail: [...currentTrail],
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
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: accumulatedContent,
                          thinkingContent: accumulatedThinking || undefined,
                          snapshotMeta: {
                            ...m.snapshotMeta!,
                            filesCount: investigatedCount,
                            tokensCount: Math.ceil(accumulatedContent.length / 4),
                            modelUsed,
                            fallbackPass,
                            mode: 'agentic' as const,
                            explorationTrail: currentTrail,
                            thinkingContent: accumulatedThinking || undefined,
                          },
                        }
                      : m
                  )
                );
              } else if (evt.type === 'done') {
                modelUsed = evt.model || modelUsed;
                fallbackPass = evt.pass || fallbackPass;
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

        // Save Snapshot
        const agentSnapshot: IngestionSnapshot = {
          owner: repo.owner,
          repo: repo.repo,
          branch: repo.branch,
          commitSha,
          totalTreeBlobs: allBlobPaths.length,
          includedFilesCount: downloadedInvestigated.length,
          estimatedTokens: Math.ceil(accumulatedContent.length / 4),
          charCount: accumulatedContent.length,
          timestamp: Date.now(),
          treeListing,
          files: downloadedInvestigated,
          mode: 'agentic' as const,
          explorationTrail: [explorationStepRecord],
          toolTraces,
        } as any;

        saveSnapshot(repo.id, agentSnapshot);
        onUpdateRepo(repo.id, { lastSyncedAt: Date.now() });

        const finalMessages: ChatMessage[] = messagesWithAssistantPlaceholder.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: accumulatedContent,
                thinkingContent: accumulatedThinking || undefined,
                snapshotMeta: {
                  ...m.snapshotMeta!,
                  filesCount: downloadedInvestigated.length,
                  tokensCount: Math.ceil(accumulatedContent.length / 4),
                  modelUsed,
                  fallbackPass,
                  mode: 'agentic' as const,
                  explorationTrail: [explorationStepRecord],
                  thinkingContent: accumulatedThinking || undefined,
                },
              }
            : m
        );
        saveMessages(repo.id, finalMessages);

        setProgress({
          step: 'completed',
          message: 'Compilation complete',
          explorationTrail: [explorationStepRecord],
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
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-medium animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Fetching repo tree...</span>
          </div>
        );
      case 'agentic_exploring':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 text-xs font-medium animate-pulse">
            <Compass className="w-3.5 h-3.5 animate-spin" />
            <span>Agent Exploring (Round {progress.currentRound || 1})...</span>
          </div>
        );
      case 'compiling_prompt':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-medium animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Compiling prompt...</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Failed</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Ready</span>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-[calc(100vh-4rem)]">
      {/* Workspace Sub-Header */}
      <div className="h-13 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-3 flex-wrap">
        {/* Repo & Branch Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-mono text-slate-400">{repo.owner}/</span>
            <span className="font-mono font-bold text-white text-sm">{repo.repo}</span>
            <a
              href={`https://github.com/${repo.owner}/${repo.repo}`}
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 hover:text-indigo-400 transition ml-1"
              title="Open on GitHub"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Branch Picker */}
          <div className="relative flex items-center">
            <GitBranch className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
            <select
              value={repo.branch}
              onChange={(e) => handleBranchChange(e.target.value)}
              disabled={isBranchLoading}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-mono rounded-lg px-2 py-1 outline-none focus:border-indigo-500 transition cursor-pointer"
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Controls: Mode Switcher, Status Pill & Drawer Toggle */}
        <div className="flex items-center gap-2.5">
          {/* Mode Switcher Pill */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleToggleMode('agentic')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                mode === 'agentic'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Agentic Sequential Exploration (Fast, low token overhead, targeted blast radius)"
            >
              <Compass className="w-3 h-3" />
              <span>Agentic Loop</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode('full')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                mode === 'full'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Full Repository Ingestion (Downloads and packs all files in memory)"
            >
              <Layers className="w-3 h-3" />
              <span>Full Repo</span>
            </button>
          </div>

          {getStatusBadge()}

          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-medium transition ${
              isDrawerOpen
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
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
