'use client';

import { useCallback, useEffect, useRef } from 'react';
import type {
  ChatMessage,
  DetectedFramework,
  ExplorationStep,
  ImageAttachment,
  IngestionProgress,
  IngestionSnapshot,
  ModelCostDetails,
  Repo,
  RouterToolTrace,
  SourceFile,
  ThinkingLevel,
} from '@/types';
import {
  calculateModelCost,
  extractSuggestedRefactors,
  isDuplicateDelta,
  resolveModelPricing,
} from '@/lib/utils';
import { normalizeThinkingLevel } from '@/lib/thinking-levels';
import { detectRepositoryFramework } from '@/lib/framework-detector';

export interface CompileStreamRequestBody {
  mode: string;
  compileId: string;
  owner: string;
  repo: string;
  branch: string;
  treeListing: string;
  investigatedFiles: SourceFile[];
  conversationHistory: { role: string; content: string }[];
  improvementPrompt: string;
  images: ImageAttachment[];
  customApiKey?: string;
  customMuseApiKey?: string;
  githubPat?: string;
  thinkingLevel: ThinkingLevel;
  thinkingSummaries: string;
  searchGrounding: boolean;
  searchContextSize: string;
  routerEngine: string;
  models?: unknown;
  maxRounds: number;
  requestTimeout: number;
}

export interface CompileStreamContext {
  repoId: string;
  repoOwner: string;
  repoName: string;
  mode: string;
  promptText: string;
  treeListing: string;
  allBlobPaths: string[];
  commitSha: string;
  activeFiles: SourceFile[];
  downloadedInvestigated: SourceFile[];
  explorationStepRecord: ExplorationStep;
  toolTraces: RouterToolTrace[];
  estimatedInputChars: number;
  validImages: ImageAttachment[];
  imageBytesTotal: number;
  requestThinkingLevel: ThinkingLevel;
}

export interface UseCompileStreamCallbacks {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setProgress: React.Dispatch<React.SetStateAction<IngestionProgress>>;
  saveMessages: (repoId: string, messages: ChatMessage[]) => void;
  saveSnapshot: (repoId: string, snapshot: IngestionSnapshot) => void;
  onUpdateRepo: (id: string, updates: Partial<Repo>) => void;
}

export interface RunStreamInput {
  compileId: string;
  assistantMsgId: string;
  requestBody: CompileStreamRequestBody;
  context: CompileStreamContext;
}

// Single-owner SSE stream consumption, extracted verbatim from
// RepoWorkspace.handleCompilePrompt (server-synthesis half): response
// guards, the reader event loop with compileId ownership filtering,
// functional finalization (state AND storage from the same array), and
// finance auto-logging. Throws on failure — the caller renders the error
// notice and releases ownership.
export function useCompileStream(callbacks: UseCompileStreamCallbacks) {
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  // Only the compile holding activeCompileIdRef may write
  // messages/progress. A new submission aborts the prior reader and takes
  // ownership; stale events are ignored by id, never by timing.
  const activeCompileIdRef = useRef<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const assistantIdRef = useRef<string | null>(null);

  // Single-owner handoff: abort any in-flight stream synchronously, then
  // take ownership. Ref-based (never closure state) so rapid double
  // submits cannot both believe they own the conversation.
  const claimOwnership = useCallback(async () => {
    const { setMessages } = callbacksRef.current;
    if (activeCompileIdRef.current !== null) {
      try {
        await readerRef.current?.cancel();
      } catch {
        // Reader already closed/locked — the stale loop exits on its own.
      }
      // Drop the superseded placeholder (by exact id) so an aborted
      // compile never leaves an empty bubble behind. Its user echo stays.
      const staleAssistantId = assistantIdRef.current;
      if (staleAssistantId) {
        setMessages((prev) => prev.filter((m) => m.id !== staleAssistantId));
      }
      activeCompileIdRef.current = null;
      readerRef.current = null;
      assistantIdRef.current = null;
    }
    const compileId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeCompileIdRef.current = compileId;
    return compileId;
  }, []);

  const isOwned = useCallback((compileId: string) => {
    return activeCompileIdRef.current === compileId;
  }, []);

  const release = useCallback(() => {
    activeCompileIdRef.current = null;
    readerRef.current = null;
    assistantIdRef.current = null;
  }, []);

  const runStream = useCallback(async (input: RunStreamInput) => {
    const { setMessages, setProgress, saveMessages, saveSnapshot, onUpdateRepo } =
      callbacksRef.current;
    const { compileId, assistantMsgId, requestBody, context } = input;
    const {
      repoId,
      repoOwner,
      repoName,
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
    } = context;

    assistantIdRef.current = assistantMsgId;

    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
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
    readerRef.current = reader;
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
    let serverThinkingLevel = requestThinkingLevel;
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

        let evt: any;
        try {
          evt = JSON.parse(jsonStr);
        } catch (parseErr) {
          console.warn('Could not parse SSE event:', parseErr);
          continue;
        }
        // Ownership filter: a superseded compile's late events are
        // dropped by id. An event without compileId (stale server)
        // is honored only while this compile still owns the stream.
        if (evt.compileId && evt.compileId !== compileId) continue;
        if (!evt.compileId && activeCompileIdRef.current !== compileId) continue;
        {
          // Server-sent events below; server `error` throws propagate
          // instead of being misreported as parse failures.

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
            serverThinkingLevel = normalizeThinkingLevel(
              evt.thinkingLevel,
              requestThinkingLevel
            );
            setProgress((prev) => ({
              ...prev,
              step: 'compiling_prompt',
              message: evt.message || 'Model thinking in progress...',
              thinkingContent: '',
              thinkingLevel: serverThinkingLevel,
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
            const incomingText = evt.text || '';
            // replaceAssistantContent pattern: skip the whole update
            // when the delta is one we already hold (resend), so
            // content length grows strictly monotonically.
            if (isDuplicateDelta(accumulatedContent, incomingText)) {
              continue;
            }
            accumulatedContent += incomingText;
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
                      thinkingLevel: serverThinkingLevel,
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
                        thinkingLevel: serverThinkingLevel,
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
            const serverError =
              typeof evt.error === 'string' && evt.error.length > 0
                ? evt.error
                : 'Agentic exploration failed';
            const serverDetails =
              typeof evt.details === 'string' && evt.details.length > 0
                ? `\n\nProvider details:\n${evt.details}`
                : '';
            console.error('Compile stream server error:', serverError, serverDetails);
            throw new Error(`${serverError}${serverDetails}`);
          }
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
      owner: repoOwner,
      repo: repoName,
      branch: requestBody.branch,
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
      ...(validImages.length > 0
        ? { imageCount: validImages.length, imageBytes: imageBytesTotal }
        : {}),
    };

    saveSnapshot(repoId, agentSnapshot);
    onUpdateRepo(repoId, { lastSyncedAt: Date.now(), detectedFramework: snapshotFramework });

    // Functional finalization: build from latest state, not the
    // stale closure captured before streaming. The exact array
    // written to state is what gets persisted — state and storage
    // can never diverge. (Same in-updater-save pattern as the
    // error path below, which React runs at render time.)
    setMessages((prev) => {
      const finalMessages: ChatMessage[] = prev.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              content: finalCleanContent,
              thinkingContent: accumulatedThinking || undefined,
              thinkingLevel: serverThinkingLevel,
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
                thinkingLevel: serverThinkingLevel,
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
      saveMessages(repoId, finalMessages);
      return finalMessages;
    });
    // Ownership released only after the final write above.
    activeCompileIdRef.current = null;
    readerRef.current = null;
    assistantIdRef.current = null;

    // Automatically log expense into token cost records ledger / finance DB
    try {
      const FINANCE_STORAGE_KEY = 'nextjs_expert_token_records_v1';
      const tokenRecord = {
        id: `tok-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        repoName: `${repoOwner}/${repoName}`,
        modelName: modelUsed || calculatedCost.modelName || 'gemini-4-argon',
        inputTokens: calculatedCost.inputTokens,
        outputTokens: calculatedCost.outputTokens,
        cachedInputTokens: calculatedCost.cachedInputTokens ?? 0,
        cachedInputCostUsd: calculatedCost.cachedInputCostUsd ?? 0,
        totalCostUsd: calculatedCost.totalCostUsd,
        date: new Date().toISOString().split('T')[0],
        notes: `Prompt compilation (${mode} mode): "${promptText.slice(0, 50)}..."${validImages.length > 0 ? ` +${validImages.length} image${validImages.length === 1 ? '' : 's'}` : ''}`,
        title: `${repoOwner}/${repoName} compilation`,
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
          repoName: `${repoOwner}/${repoName}`,
          modelName: modelUsed || calculatedCost.modelName || 'gemini-4-argon',
          inputTokens: calculatedCost.inputTokens,
          outputTokens: calculatedCost.outputTokens,
          cachedInputTokens: calculatedCost.cachedInputTokens ?? 0,
          cachedInputCostUsd: calculatedCost.cachedInputCostUsd ?? 0,
          totalCostUsd: calculatedCost.totalCostUsd,
          date: new Date().toISOString().split('T')[0],
          notes: `Prompt compilation (${mode} mode): "${promptText.slice(0, 50)}..."${validImages.length > 0 ? ` +${validImages.length} image${validImages.length === 1 ? '' : 's'}` : ''}`,
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
  }, []);

  return { claimOwnership, isOwned, release, runStream };
}
