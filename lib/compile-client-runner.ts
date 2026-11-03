import { GoogleGenAI } from '@google/genai';
import { ImageAttachment, SourceFile, ThinkingLevel } from '@/types';
import {
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_BYTES,
  chatImagesSchema,
  estimateBase64Bytes,
  estimateImagesTokens,
  toGeminiInlineParts,
  toMuseImageParts,
} from '@/lib/image-attachments';
import { normalizeSearchContextSize } from '@/lib/search-grounding';
import { fetchFilesOnDemand, normalizeRepoPath } from '@/lib/github';
import { detectRepositoryFramework } from '@/lib/framework-detector';
import {
  normalizeConversationHistory,
  toGenAiHistory,
  toMuseMessages,
} from '@/lib/chat-history';
import {
  buildGeminiThinkingConfig,
  normalizeThinkingLevel,
  normalizeThinkingSummaries,
} from '@/lib/thinking-levels';
import { summarizeCascadeFailures } from '@/lib/cascade-failures';
import {
  buildFinalPromptPayload,
  buildFocusedContextSnapshot,
  DEFAULT_CASCADING_MODELS,
  selectSystemInstruction,
} from '@/lib/prompt-templates';
import { runAgenticExploration } from '@/lib/agentic-exploration';
import { drainSynthesisStream, establishSynthesisStream, isMuseModelTag } from '@/lib/model-cascades';

export interface CompileClientRunnerOptions {
  mode: string;
  compileId: string;
  owner: string;
  repo: string;
  branch: string;
  treeListing: string;
  investigatedFiles?: SourceFile[];
  conversationHistory?: { role: string; content: string }[];
  improvementPrompt: string;
  images?: ImageAttachment[];
  customApiKey?: string;
  customMuseApiKey?: string;
  githubPat?: string;
  thinkingLevel: ThinkingLevel;
  thinkingSummaries: string;
  searchGrounding: boolean;
  searchContextSize: string;
  models?: unknown;
  maxRounds: number;
  requestTimeout: number;
  signal?: AbortSignal;
  onEvent: (eventData: Record<string, unknown>) => void;
}

export interface CompileClientRunnerResult {
  recordedEvents: Array<Record<string, unknown>>;
  exploredFiles: SourceFile[];
  detectedFramework: string | null;
  modelUsed: string;
}

/**
 * Runs the full 2-phase Agentic Exploration + Model Cascade synthesis
 * directly in the browser using the user's BYOK Gemini/Muse API key and GitHub PAT.
 * 
 * 0 Serverless Fluid GB-hours. Zero 60s timeout cap.
 */
export async function runCompileClientSide(
  options: CompileClientRunnerOptions
): Promise<CompileClientRunnerResult> {
  const {
    mode = 'agentic',
    compileId,
    owner,
    repo,
    branch = 'main',
    treeListing,
    improvementPrompt,
    customApiKey,
    customMuseApiKey,
    githubPat,
    maxRounds: rawMaxRounds = 3,
    investigatedFiles: clientInvestigatedFiles = [],
    conversationHistory: rawConversationHistory = [],
    images: rawImages = [],
    models: customModels,
    requestTimeout = 60,
    searchGrounding: rawSearchGrounding,
    searchContextSize: rawSearchContextSize,
    signal,
    onEvent,
  } = options;

  if (signal?.aborted) {
    throw new Error('Compilation aborted before starting');
  }

  if (!improvementPrompt || typeof improvementPrompt !== 'string' || !improvementPrompt.trim()) {
    throw new Error('Missing or invalid improvementPrompt');
  }

  if (!owner || !repo || !treeListing) {
    throw new Error('Missing owner, repo, or treeListing context');
  }

  // 1. Validate images
  const imageCheck = chatImagesSchema.safeParse(rawImages);
  if (!imageCheck.success) {
    throw new Error(
      `Invalid image attachments (max ${MAX_IMAGES_PER_MESSAGE}, ${MAX_IMAGE_BYTES} bytes each, ${MAX_TOTAL_BYTES} bytes total, PNG/JPEG/WebP/GIF only).`
    );
  }
  const validImages: ImageAttachment[] = imageCheck.data;
  const actualImageBytes = validImages.reduce(
    (acc, img) => acc + estimateBase64Bytes(img.dataUrl),
    0
  );
  if (actualImageBytes > MAX_TOTAL_BYTES) {
    throw new Error(`Image payload exceeds ${MAX_TOTAL_BYTES} bytes.`);
  }

  const imageTokens = estimateImagesTokens(validImages);
  const geminiImageParts = toGeminiInlineParts(validImages);
  const museImageParts = toMuseImageParts(validImages);

  const maxRounds = Math.min(Math.max(1, Number(rawMaxRounds) || 3), 4);
  const timeoutMs = Math.max(15000, Number(requestTimeout) * 1000);
  const useSearchGrounding = rawSearchGrounding === true;
  const useSearchContextSize = normalizeSearchContextSize(rawSearchContextSize);

  // 2. Resolve model cascade
  const rawCustomModels = customModels;
  const modelsToUse: string[] =
    Array.isArray(rawCustomModels) && rawCustomModels.length > 0
      ? rawCustomModels
          .filter((m: any) => m && m.enabled !== false && (m.tag || m.id))
          .sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99))
          .map((m: any) => (m.tag || m.id).trim())
      : [...DEFAULT_CASCADING_MODELS];

  const cascadingModels = modelsToUse.length > 0 ? modelsToUse : [...DEFAULT_CASCADING_MODELS];
  const wantsMuseOnly = cascadingModels.length > 0 && cascadingModels.every(isMuseModelTag);

  // 3. Strict BYOK key enforcement — NO server fallback
  const cleanApiKey = customApiKey?.trim() || '';
  const cleanMuseKey = customMuseApiKey?.trim() || '';

  if (wantsMuseOnly && !cleanMuseKey) {
    throw new Error(
      'Muse AI API key is not configured. Please add your Muse API key in Settings.'
    );
  }

  if (!wantsMuseOnly && !cleanApiKey) {
    throw new Error(
      'Gemini API key is not configured. Please add your Gemini API key in Settings.'
    );
  }

  const recordedEvents: Array<Record<string, unknown>> = [];
  const sendEvent = (eventData: Record<string, unknown>) => {
    if (signal?.aborted) return;
    recordedEvents.push(eventData);
    onEvent({ compileId, ...eventData });
  };

  sendEvent({
    type: 'agent_start',
    message: `Initializing client-side agentic exploration loop (Mode: ${mode})...`,
    owner,
    repo,
    branch,
  });

  const ai = new GoogleGenAI({
    apiKey: cleanApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // 4. Phase 1: Agentic Exploration
  const { exploredFilesMap, explorationTrail } = await runAgenticExploration({
    ai,
    sendEvent,
    owner,
    repo,
    branch,
    treeListing,
    improvementPrompt,
    mode,
    clientInvestigatedFiles,
    cascadingModels,
    maxRounds,
    timeoutMs,
    requestTimeout,
    githubPat,
    fetchFilesOnDemand,
    normalizeRepoPath,
    signal,
  });

  if (signal?.aborted) {
    throw new Error('Compilation aborted');
  }

  // 5. Phase 2: Synthesis
  const exploredFilesList = Array.from(exploredFilesMap.values());
  const treePathsForDetection = (treeListing || '')
    .split('\n')
    .map((l: string) => l.replace(/^@\[\//, '').replace(/\]$/, '').trim())
    .filter((p: string) => p.length > 0);
  const detectedFramework = detectRepositoryFramework(
    exploredFilesList,
    treePathsForDetection
  );

  const thinkingLevel = normalizeThinkingLevel(options.thinkingLevel);
  const thinkingSummaries = normalizeThinkingSummaries(options.thinkingSummaries);

  const systemInstructionToUse = selectSystemInstruction(
    mode,
    detectedFramework,
    thinkingLevel
  );

  const focusedContext = buildFocusedContextSnapshot({
    owner,
    repo,
    branch,
    treeListing,
    exploredFilesList,
  });

  const finalPromptPayload = buildFinalPromptPayload(
    mode,
    focusedContext,
    improvementPrompt
  );

  const historyTurns = normalizeConversationHistory(rawConversationHistory);
  const geminiHistory = toGenAiHistory(historyTurns);
  const museHistory = toMuseMessages(historyTurns);
  const historyChars = historyTurns.reduce((acc, t) => acc + t.content.length, 0);

  const estimatedInputTokens =
    Math.max(
      1,
      Math.ceil(
        (systemInstructionToUse.length + finalPromptPayload.length + historyChars) / 4
      )
    ) + imageTokens;

  const synthesisMessage: string | (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[] =
    geminiImageParts.length > 0
      ? [{ text: finalPromptPayload }, ...geminiImageParts]
      : finalPromptPayload;

  sendEvent({
    type: 'compiling_start',
    message: `Synthesizing architectural response from ${exploredFilesList.length} investigated files (Mode: ${mode}, Framework: ${detectedFramework})...`,
    investigatedFiles: exploredFilesList.map((f) => f.path),
    model: cascadingModels[0],
    pass: 1,
    trail: explorationTrail,
    inputTokens: estimatedInputTokens,
    estimatedInputTokens,
    detectedFramework,
    historyTurns: historyTurns.length,
    ...(validImages.length > 0 ? { imageCount: validImages.length } : {}),
  });

  const geminiThinkingConfig = buildGeminiThinkingConfig(thinkingLevel, thinkingSummaries);

  const established = await establishSynthesisStream({
    ai,
    cascadingModels,
    systemInstructionToUse,
    finalPromptPayload,
    synthesisMessage,
    geminiHistory,
    museHistory,
    museImageParts,
    museKey: cleanMuseKey,
    mode,
    timeoutMs,
    requestTimeout,
    useSearchGrounding,
    searchContextSize: useSearchContextSize,
    thinkingLevel,
    thinkingSummaries,
    geminiThinkingConfig,
    signal,
  });

  if (signal?.aborted) {
    throw new Error('Compilation aborted');
  }

  if (!established.stream) {
    const errorDetails = summarizeCascadeFailures(established.cascadeFailures);
    sendEvent({
      type: 'error',
      error: 'All cascading models failed to stream the response after 2 passes.',
      details: errorDetails,
    });
    throw new Error(`All cascading models failed to stream response. ${errorDetails}`);
  }

  const {
    streamResponse,
    streamModel,
    streamPass,
    streamMuseUsage,
  } = established.stream;

  await drainSynthesisStream({
    streamResponse,
    streamModel,
    streamPass,
    streamMuseUsage,
    sendEvent,
    detectedFramework,
    exploredFilesList,
    explorationTrail,
    estimatedInputTokens,
    thinkingLevel,
    signal,
  });

  return {
    recordedEvents,
    exploredFiles: exploredFilesList,
    detectedFramework,
    modelUsed: streamModel,
  };
}
