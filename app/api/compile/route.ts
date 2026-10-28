import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { ImageAttachment, SourceFile, ExplorationStep, SearchContextSize } from '@/types';
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      mode = 'agentic',
      owner,
      repo,
      branch = 'main',
      treeListing,
      improvementPrompt,
      customApiKey,
      customMuseApiKey,
      museApiKey: bodyMuseApiKey,
      githubPat,
      maxRounds: rawMaxRounds = 3,
      repositoryContext, // For fallback legacy full mode
      investigatedFiles: clientInvestigatedFiles, // Pre-routed files from client
      conversationHistory: rawConversationHistory, // Prior ChatMessage turns for multi-turn caching
      images: rawImages, // Optional screenshot attachments (base64 data URLs)
      compileId: rawCompileId, // Client-owned single-emission key (see below)
      models: customModels,
      requestTimeout = 60,
      searchGrounding: rawSearchGrounding,
      searchContextSize: rawSearchContextSize,
      routerEngine: rawRouterEngine,
    } = body;
    // Telemetry only: the client already forwards the local router engine
    // string with every compile POST. Server synthesis is unchanged by it.
    void (typeof rawRouterEngine === 'string' ? rawRouterEngine : '');

    const maxRounds = Math.min(Math.max(1, Number(rawMaxRounds) || 3), 4);

    const timeoutMs = Math.max(15000, Number(requestTimeout) * 1000);

    // Search Grounding is strictly opt-in: only an explicit `true` enables
    // web lookups, and the size is coerced to the low/medium/high union.
    const useSearchGrounding = rawSearchGrounding === true;
    const useSearchContextSize = normalizeSearchContextSize(rawSearchContextSize);

    const rawCustomModels = customModels || body.customModels;
    const modelsToUse: string[] =
      Array.isArray(rawCustomModels) && rawCustomModels.length > 0
        ? rawCustomModels
            .filter((m: any) => m && m.enabled !== false && (m.tag || m.id))
            .sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99))
            .map((m: any) => (m.tag || m.id).trim())
        : [...DEFAULT_CASCADING_MODELS];

    const cascadingModels = modelsToUse.length > 0 ? modelsToUse : [...DEFAULT_CASCADING_MODELS];

    if (!improvementPrompt || typeof improvementPrompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid improvementPrompt' },
        { status: 400 }
      );
    }

    // Multimodal input boundary: Zod validation BEFORE any handler work.
    // Text-only requests (images absent) flow through exactly as before.
    const imageCheck = chatImagesSchema.safeParse(
      rawImages === undefined ? [] : rawImages
    );
    if (!imageCheck.success) {
      return NextResponse.json(
        {
          error: `Invalid image attachments (max ${MAX_IMAGES_PER_MESSAGE}, ${MAX_IMAGE_BYTES} bytes each, ${MAX_TOTAL_BYTES} bytes total, PNG/JPEG/WebP/GIF only).`,
          details: imageCheck.error.issues.map((i) => i.message).slice(0, 4),
        },
        { status: 400 }
      );
    }
    const validImages: ImageAttachment[] = imageCheck.data;
    // Measure actual base64 bytes — never trust client-declared sizeBytes.
    const actualImageBytes = validImages.reduce(
      (acc, img) => acc + estimateBase64Bytes(img.dataUrl),
      0
    );
    if (actualImageBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: `Image payload exceeds ${MAX_TOTAL_BYTES} bytes.` },
        { status: 400 }
      );
    }
    const imageTokens = estimateImagesTokens(validImages);
    const geminiImageParts = toGeminiInlineParts(validImages);
    const museImageParts = toMuseImageParts(validImages);

    // Single-emission ownership: the client generates one compileId per
    // submission; the server echoes it on every SSE event so overlapping
    // streams are distinguishable. Absent/invalid input falls back to a
    // server-generated id (never empty, never reused across requests).
    const compileId =
      typeof rawCompileId === 'string' && rawCompileId.length > 0 && rawCompileId.length <= 64
        ? rawCompileId
        : typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY;
    // Handle model initialization branching for muse-spark-1.3 & muse-spark-1.3-contributor:
    // per-request Settings key wins, shared MUSE_API_KEY env is the server fallback.
    const museKey =
      customMuseApiKey?.trim() || bodyMuseApiKey?.trim() || process.env.MUSE_API_KEY;
    const wantsMuseOnly = cascadingModels.length > 0 && cascadingModels.every(isMuseModelTag);
    if (!apiKey && !wantsMuseOnly) {
      return NextResponse.json(
        {
          error:
            'Gemini API key is not configured. Please ensure GEMINI_API_KEY is available or provide a custom key in Settings.',
        },
        { status: 500 }
      );
    }
    if (wantsMuseOnly && !museKey) {
      return NextResponse.json(
        {
          error:
            'Muse API key is not configured. Please add your Muse AI API key in Settings or set MUSE_API_KEY.',
        },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const encoder = new TextEncoder();

    // ==========================================
    // UNIFIED AGENTIC EXPLORATION & STREAMING PIPELINE
    // ==========================================
    if (owner && repo && treeListing) {
      const readable = new ReadableStream({
        async start(controller) {
          const sendRawEvent = (eventData: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
          };
          // compileId rides on every event (present and future) so the
          // client can ignore stale streams from superseded compiles.
          const sendEvent = (eventData: Record<string, unknown>) => {
            sendRawEvent({ compileId, ...eventData });
          };

          try {
            sendEvent({
              type: 'agent_start',
              message: `Initializing agentic exploration loop (Mode: ${mode})...`,
              owner,
              repo,
              branch,
            });

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
            });

            // ==========================================
            // PHASE 2: SYNTHESIZE & STREAM PROMPT
            // Detect framework, then select system instruction by mode
            // ==========================================
            const exploredFilesList = Array.from(exploredFilesMap.values());
            const treePathsForDetection = (treeListing || '')
              .split('\n')
              .map((l: string) => l.replace(/^@\[\//, '').replace(/\]$/, '').trim())
              .filter((p: string) => p.length > 0);
            const detectedFramework = detectRepositoryFramework(
              exploredFilesList,
              treePathsForDetection
            );

            // Thinking effort normalized early so the MAX overlay lands before
            // token estimation and both provider paths (Muse + Gemini) share it.
            const thinkingLevel = normalizeThinkingLevel(body.thinkingLevel);
            const thinkingSummaries = normalizeThinkingSummaries(body.thinkingSummaries);

            const systemInstructionToUse = selectSystemInstruction(
              mode,
              detectedFramework,
              thinkingLevel,
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
              improvementPrompt,
            );

            // Multi-turn state: prior chat turns are re-sent as the stable
            // conversation prefix so Gemini's implicit context caching applies
            // across follow-ups. Each request stays stateless HTTP — no
            // server-side session store — with the current repo context plus
            // the new developer prompt appended as the latest user turn.
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

            // Multimodal synthesis turn: text payload plus provider-native
            // vision parts. Images affect synthesis only — the exploration
            // loop above stays text-only.
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

            // thinkingLevel/thinkingSummaries normalized above (pre-overlay);
            // Gemini maps Muse-only xhigh/max down to high here.
            const geminiThinkingConfig = buildGeminiThinkingConfig(thinkingLevel, thinkingSummaries);

            const established = await establishSynthesisStream({
              ai,
              cascadingModels,
              systemInstructionToUse: systemInstructionToUse,
              finalPromptPayload,
              synthesisMessage,
              geminiHistory,
              museHistory,
              museImageParts,
              museKey,
              mode,
              timeoutMs,
              requestTimeout,
              useSearchGrounding,
              searchContextSize: useSearchContextSize,
              thinkingLevel,
              thinkingSummaries,
              geminiThinkingConfig,
            });

            if (!established.stream) {
              sendEvent({
                type: 'error',
                error: 'All cascading models failed to stream the response after 2 passes.',
                details: summarizeCascadeFailures(established.cascadeFailures),
              });
              controller.close();
              return;
            }

            const {
              streamResponse,
              streamModel,
              streamPass,
              streamMuseUsage,
            } = established.stream;
            const { cascadeFailures } = established;

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
            });

            controller.close();
          } catch (err: unknown) {
            console.error('Error in agentic stream:', err);
            sendEvent({
              type: 'error',
              error: err instanceof Error ? err.message : String(err),
            });
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    return NextResponse.json({ error: 'Missing owner, repo, or treeListing' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Error in /api/compile:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
