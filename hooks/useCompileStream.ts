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
  calculateCacheHitRate,
  calculateModelCost,
  extractSuggestedRefactors,
  isDuplicateDelta,
  resolveModelPricing,
} from '@/lib/utils';
import { normalizeThinkingLevel } from '@/lib/thinking-levels';
import { detectRepositoryFramework } from '@/lib/framework-detector';
import { runCompileClientSide } from '@/lib/compile-client-runner';
import {
  buildClientCacheKey,
  getCachedCompilation,
  setCachedCompilation,
  getInFlightCompilePromise,
  registerInFlightCompilePromise,
} from '@/lib/compile-client-cache';

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

// Client-side single-owner compile runner hook:
// Directly invokes runCompileClientSide with BYOK API keys in the browser.
// 0 Serverless Fluid GB-Hours. Completely eliminates function timeouts and cross-container 404s.
export function useCompileStream(callbacks: UseCompileStreamCallbacks) {
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const activeCompileIdRef = useRef<string | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const claimOwnership = useCallback(async () => {
    const { setMessages } = callbacksRef.current;
    if (activeCompileIdRef.current !== null) {
      abortControllerRef.current?.abort();
      const staleAssistantId = assistantIdRef.current;
      if (staleAssistantId) {
        setMessages((prev) => prev.filter((m) => m.id !== staleAssistantId));
      }
      activeCompileIdRef.current = null;
      assistantIdRef.current = null;
      abortControllerRef.current = null;
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
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeCompileIdRef.current = null;
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

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Deduplication & 24h cache keys (MUST include commitSha to guarantee fresh compilations on commit updates)
    const cacheKey = buildClientCacheKey({
      owner: repoOwner,
      repo: repoName,
      branch: requestBody.branch,
      commitSha,
      mode,
      prompt: promptText,
    });

    const dedupeKey = `${repoOwner}/${repoName}:${requestBody.branch}:${commitSha || 'head'}:${mode}:${promptText.trim()}`;

    // In-flight deduplication check
    const existingInFlight = getInFlightCompilePromise(dedupeKey);
    if (existingInFlight) {
      await existingInFlight;
      return;
    }

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
    let estimatedInputTokens = 3500;
    let measuredInputTokens = 0;
    let cachedInputTokens = 0;
    let cacheHitRate = 0;
    let finalCostDetails: ModelCostDetails | null = null;
    const recordedEvents: Array<Record<string, unknown>> = [];

    // Unified compiler event dispatcher matching exact UI progress and state contracts
    const handleCompilerEvent = (evt: any) => {
      if (evt.compileId && evt.compileId !== compileId) return;
      if (!evt.compileId && activeCompileIdRef.current !== compileId) return;

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
        if (typeof evt.estimatedInputTokens === 'number') {
          estimatedInputTokens = evt.estimatedInputTokens;
          serverInputTokens = estimatedInputTokens;
        } else if (evt.inputTokens) {
          estimatedInputTokens = evt.inputTokens;
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
          estimatedInputTokens,
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
        if (isDuplicateDelta(accumulatedContent, incomingText)) {
          return;
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
                    estimatedInputTokens,
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
        if (typeof evt.estimatedInputTokens === 'number') estimatedInputTokens = evt.estimatedInputTokens;
        measuredInputTokens = typeof evt.measuredInputTokens === 'number' ? evt.measuredInputTokens : 0;
        if (evt.inputTokens) serverInputTokens = evt.inputTokens;
        else if (measuredInputTokens > 0) serverInputTokens = measuredInputTokens;
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
        cachedInputTokens = typeof evt.cachedInputTokens === 'number'
          ? evt.cachedInputTokens
          : typeof evt.costDetails?.cachedInputTokens === 'number'
            ? evt.costDetails.cachedInputTokens
            : 0;
        cacheHitRate = typeof evt.cacheHitRate === 'number'
          ? evt.cacheHitRate
          : calculateCacheHitRate(serverInputTokens, cachedInputTokens);
        if (evt.costDetails) {
          finalCostDetails = {
            ...evt.costDetails,
            cachedInputTokens: typeof evt.costDetails.cachedInputTokens === 'number' ? evt.costDetails.cachedInputTokens : cachedInputTokens,
            cacheHitRate: typeof evt.costDetails.cacheHitRate === 'number' ? evt.costDetails.cacheHitRate : cacheHitRate,
          };
        } else {
          const fallback = calculateModelCost(
            modelUsed || 'gemini-3.8-flash',
            serverInputTokens,
            finalOutputTokens,
            cachedInputTokens
          );
          finalCostDetails = { ...fallback, cacheHitRate };
        }
        if (evt.investigatedFiles && Array.isArray(evt.investigatedFiles)) {
          investigatedFiles = evt.investigatedFiles;
        }
      } else if (evt.type === 'error') {
        const errorMsg = typeof evt.error === 'string' && evt.error.length > 0
          ? evt.error
          : 'Agentic exploration failed';
        throw new Error(errorMsg);
      }
    };

    // 1. Check 24h client compilation cache
    const cachedEntry = getCachedCompilation(cacheKey);
    if (cachedEntry) {
      for (const evt of cachedEntry.events) {
        handleCompilerEvent(evt);
      }

      // Finalize immediately from cache
      const finalCleanContent = cachedEntry.cleanPrompt;
      const calculatedCost = cachedEntry.calculatedCost;
      const snapshotFramework: DetectedFramework = (cachedEntry.detectedFramework as DetectedFramework) || 'nextjs';

      const agentSnapshot: IngestionSnapshot = {
        owner: repoOwner,
        repo: repoName,
        branch: requestBody.branch,
        detectedFramework: snapshotFramework,
        commitSha,
        totalTreeBlobs: allBlobPaths.length,
        includedFilesCount: activeFiles.length > 0 ? activeFiles.length : downloadedInvestigated.length,
        estimatedTokens: estimatedInputTokens,
        estimatedInputTokens,
        measuredInputTokens,
        cachedInputTokens: calculatedCost.cachedInputTokens ?? 0,
        cachedInputCostUsd: calculatedCost.cachedInputCostUsd ?? 0,
        cacheHitRate: calculatedCost.cacheHitRate ?? 0,
        charCount: estimatedInputChars,
        inputTokens: calculatedCost.inputTokens,
        outputTokens: calculatedCost.outputTokens,
        timestamp: Date.now(),
        treeListing,
        files: activeFiles.length > 0 ? activeFiles : downloadedInvestigated,
        mode: 'agentic' as const,
        explorationTrail: [explorationStepRecord],
        toolTraces,
        costDetails: calculatedCost,
        totalCostUsd: calculatedCost.totalCostUsd,
        modelPricing: resolveModelPricing(cachedEntry.modelUsed || calculatedCost.modelName),
        ...(validImages.length > 0
          ? { imageCount: validImages.length, imageBytes: imageBytesTotal }
          : {}),
      };

      saveSnapshot(repoId, agentSnapshot);
      onUpdateRepo(repoId, { lastSyncedAt: Date.now(), detectedFramework: snapshotFramework });

      setMessages((prev) => {
        const finalMessages: ChatMessage[] = prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: finalCleanContent,
                suggestedRefactors: cachedEntry.refactors.length > 0 ? cachedEntry.refactors : undefined,
                costDetails: calculatedCost,
                snapshotMeta: {
                  ...m.snapshotMeta!,
                  filesCount: downloadedInvestigated.length,
                  tokensCount: calculatedCost.inputTokens,
                  inputTokensCount: calculatedCost.inputTokens,
                  outputTokensCount: calculatedCost.outputTokens,
                  estimatedInputTokens,
                  measuredInputTokens,
                  cachedInputTokens: calculatedCost.cachedInputTokens ?? 0,
                  cachedInputCostUsd: calculatedCost.cachedInputCostUsd ?? 0,
                  cacheHitRate: calculatedCost.cacheHitRate ?? 0,
                  modelUsed: cachedEntry.modelUsed,
                  fallbackPass: 1,
                  mode: 'agentic' as const,
                  explorationTrail: [explorationStepRecord],
                  costDetails: calculatedCost,
                  inputTokens: calculatedCost.inputTokens,
                  outputTokens: calculatedCost.outputTokens,
                  totalCostUsd: calculatedCost.totalCostUsd,
                  modelPricing: resolveModelPricing(cachedEntry.modelUsed || calculatedCost.modelName),
                  suggestedRefactors: cachedEntry.refactors.length > 0 ? cachedEntry.refactors : undefined,
                },
              }
            : m
        );
        saveMessages(repoId, finalMessages);
        return finalMessages;
      });

      activeCompileIdRef.current = null;
      assistantIdRef.current = null;
      return;
    }

    // 2. Live Client-Side Execution with BYOK keys
    const compileExecutionPromise = (async () => {
      await runCompileClientSide({
        mode,
        compileId,
        owner: repoOwner,
        repo: repoName,
        branch: requestBody.branch,
        treeListing,
        investigatedFiles: downloadedInvestigated,
        conversationHistory: requestBody.conversationHistory,
        improvementPrompt: promptText,
        images: validImages,
        customApiKey: requestBody.customApiKey,
        customMuseApiKey: requestBody.customMuseApiKey,
        githubPat: requestBody.githubPat,
        thinkingLevel: requestThinkingLevel,
        thinkingSummaries: requestBody.thinkingSummaries,
        searchGrounding: requestBody.searchGrounding,
        searchContextSize: requestBody.searchContextSize,
        models: requestBody.models,
        maxRounds: requestBody.maxRounds,
        requestTimeout: requestBody.requestTimeout,
        signal: abortController.signal,
        onEvent: (evt) => {
          recordedEvents.push(evt);
          handleCompilerEvent(evt);
        },
      });
    })();

    registerInFlightCompilePromise(dedupeKey, compileExecutionPromise);
    await compileExecutionPromise;

    if (abortController.signal.aborted) {
      return;
    }

    const { cleanPrompt: finalCleanContent, refactors: finalParsedRefactors } = extractSuggestedRefactors(accumulatedContent);
    accumulatedContent = finalCleanContent;

    const finalTokensCount = Math.max(1, Math.ceil(accumulatedContent.length / 4));
    const calculatedCost =
      finalCostDetails ||
      (() => {
        const fallback = calculateModelCost(
          modelUsed || 'gemini-3.8-flash',
          serverInputTokens,
          finalTokensCount,
          cachedInputTokens
        );
        return { ...fallback, cacheHitRate: calculateCacheHitRate(fallback.inputTokens, fallback.cachedInputTokens) };
      })();

    const snapshotFramework: DetectedFramework =
      serverFramework === 'hono' || serverFramework === 'nextjs' || serverFramework === 'unknown'
        ? serverFramework
        : detectRepositoryFramework(
            activeFiles.length > 0 ? activeFiles : downloadedInvestigated,
            allBlobPaths
          );

    const snapshotCacheHit = typeof calculatedCost.cacheHitRate === 'number'
      ? calculatedCost.cacheHitRate
      : calculateCacheHitRate(calculatedCost.inputTokens, calculatedCost.cachedInputTokens ?? 0);

    const agentSnapshot: IngestionSnapshot = {
      owner: repoOwner,
      repo: repoName,
      branch: requestBody.branch,
      detectedFramework: snapshotFramework,
      commitSha,
      totalTreeBlobs: allBlobPaths.length,
      includedFilesCount: activeFiles.length > 0 ? activeFiles.length : downloadedInvestigated.length,
      estimatedTokens: estimatedInputTokens,
      estimatedInputTokens,
      measuredInputTokens,
      cachedInputTokens: calculatedCost.cachedInputTokens ?? 0,
      cachedInputCostUsd: calculatedCost.cachedInputCostUsd ?? 0,
      cacheHitRate: snapshotCacheHit,
      charCount: estimatedInputChars,
      inputTokens: calculatedCost.inputTokens,
      outputTokens: calculatedCost.outputTokens,
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
                tokensCount: calculatedCost.inputTokens,
                inputTokensCount: calculatedCost.inputTokens,
                outputTokensCount: calculatedCost.outputTokens,
                estimatedInputTokens,
                measuredInputTokens,
                cachedInputTokens: calculatedCost.cachedInputTokens ?? 0,
                cachedInputCostUsd: calculatedCost.cachedInputCostUsd ?? 0,
                cacheHitRate: snapshotCacheHit,
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

    // 3. Cache compilation in 24h client storage
    if (recordedEvents.length > 0 && !abortController.signal.aborted) {
      setCachedCompilation(cacheKey, {
        events: recordedEvents,
        finalPrompt: accumulatedContent,
        cleanPrompt: finalCleanContent,
        refactors: finalParsedRefactors,
        exploredFiles: investigatedFiles.length > 0 ? investigatedFiles : downloadedInvestigated,
        explorationTrail: currentTrail,
        modelUsed,
        detectedFramework: snapshotFramework,
        serverThinkingLevel,
        calculatedCost,
      });
    }

    activeCompileIdRef.current = null;
    assistantIdRef.current = null;

    // 4. Automatically log expense into token cost records ledger / finance DB
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

      // Also fire-and-forget background log to /api/finance
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
    } catch (e) {
      console.warn('Failed to auto-log token record in finance ledger:', e);
    }
  }, []);

  return {
    claimOwnership,
    isOwned,
    release,
    runStream,
  };
}
