import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { SourceFile, ExplorationStep } from '@/types';
import { fetchFilesOnDemand, normalizeRepoPath } from '@/lib/github';
import { calculateModelCost, extractSuggestedRefactors } from '@/lib/utils';

const NEXTJS_EXPERT_SYSTEM_INSTRUCTION = `You are Next.js Expert, a Principal Architect and Autonomous Prompt Compiler specializing exclusively in Next.js 15+ App Router, React Server Components (RSC), Server Actions, Route Handlers, and modern TypeScript architecture.
You have been given a Next.js repository structure and the developer's requested improvements.
Your objective is to synthesize the developer's high-level intent with the exact structural reality of the codebase, outputting a single, self-contained, end-to-end execution prompt directly in clean, structured Markdown.

NEXT.JS ARCHITECTURAL SPECIALIZATION & INVARIANTS:
1. **App Router Conventions**: Enforce exact conventions across \`app/**/page.tsx\`, \`app/**/layout.tsx\`, \`app/**/loading.tsx\`, \`app/**/error.tsx\`, \`app/**/not-found.tsx\`, \`app/api/**/route.ts\`, and \`middleware.ts\`.
2. **Server vs. Client Boundaries**: Server Components are the default. Add \`'use client'\` ONLY at interactive leaf nodes (event listeners, hooks, browser APIs). Never import Server Components into Client Components; pass them as \`children\`.
3. **Server Actions & Mutations**: Mark server mutation files or functions with \`'use server'\`. Validate all inputs with Zod schemas and trigger revalidation (\`revalidatePath\` or \`revalidateTag\`).
4. **Data Fetching & Streaming**: Prefer async Server Component fetching with Suspense boundaries. Configure caching explicitly (\`force-dynamic\`, \`revalidate\`, or \`cache: 'no-store'\`).
5. **Route Handlers**: Use \`NextRequest\` and \`NextResponse.json\` with proper HTTP status codes.
6. **Clean TypeScript & Styling**: Use strict TypeScript interfaces, avoid \`any\`, and style cleanly with Tailwind CSS utility classes.

STRICT FORMATTING RULES FOR YOUR OUTPUTTED PROMPT:
1. Every file or directory path reference MUST be prepended with an @ symbol and surrounded by brackets, like @[/app/layout.tsx] or @[/components/Header.tsx], WITHOUT surrounding backticks.
2. Never include citations or external source markers in your outputted prompt.
3. Output the prompt directly in clean Markdown. Do NOT wrap the entire prompt in outer code block fences or backticks (e.g. do not enclose in \`\`\`\`markdown or \`\`markdown). Internal code blocks within steps (such as TypeScript, CSS, JSON, or terminal commands) must use standard triple-backticks (\`\`\`lang ... \`\`\`).
4. Sequence steps in strict dependency order (types, schemas, state stores, and utilities FIRST; UI components, layouts, and route handlers SECOND) so the build never breaks mid-execution.

STRUCTURE OF THE COMPILED PROMPT:
1. **Architectural Context & Next.js Objectives**: Concise synthesis of the improvements, App Router conventions, and core invariants.
2. **Blast Radius & Target Manifest**: Every @[/path/to/file.ext] to be created, modified, or deleted and its Next.js role (\`app-page\`, \`app-layout\`, \`client-component\`, \`server-action\`, \`route-handler\`, etc.).
3. **Step-by-Step Execution Choreography**: Atomic, ordered steps detailing Target @[/file/path], Server/Client boundary directives, Current vs. Target State, and exact Implementation Directives (referencing real props, hooks, types, and imports).
4. **Dead Code & Redundancy Purge**: Explicit cleanup of unused imports, redundant client directives, obsolete types, or legacy routes caused by the changes.
5. **Verification & Invariant Checks**: Exact terminal commands (\`npm run build\`, \`npm run lint\`) and runtime behavioral checks to verify completion.
6. **Dynamic Follow-up Refactors**: At the very end of your response, append exactly this separator:
---SUGGESTED_REFACTORS---
Followed immediately by a valid JSON array of exactly 4 short, actionable architectural follow-up refactor prompts (strings) tailored specifically to the investigated codebase files and Next.js App Router best practices.`;

const IDEA_MODE_SYSTEM_INSTRUCTION = `You are Next.js Expert Principal Product Architect. Your task is to analyze the provided Next.js repository, extract existing features, synthesize 77 innovative feature and architectural improvements, score them rigorously using RICE (Reach, Impact, Confidence, Effort) and VRIN-EO (Value, Relativity, Inimitability, Non-Substitutability & Engine-Optimization) frameworks, and present the top 7 highest-ranked ideas in clean, structured Markdown. Include a clear breakdown table of RICE and VRIN-EO metrics, implementation hints, and targeted file paths formatted as @[/path/to/file.ext].`;

const BTW_MODE_SYSTEM_INSTRUCTION = `You are Next.js Expert Codebase Assistant. Answer the developer's question directly and authoritatively using the provided repository context. Explain code architecture, component relationships, or data flows clearly. Cite files explicitly using @[/path/to/file.ext] format. Do not generate Antigravity prompt templates; provide direct, actionable technical answers.`;

// Cascading Fallback Strategy: Incorporating Gemini 4 Argon as primary tier
const DEFAULT_CASCADING_MODELS = [
  'gemini-4-argon',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
] as const;

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]);
}

function parseSuggestedRefactors(text: string): { cleanText: string; refactors: string[] } {
  const { cleanPrompt, refactors } = extractSuggestedRefactors(text);
  return { cleanText: cleanPrompt, refactors };
}

const inspectFilesToolDeclaration: FunctionDeclaration = {
  name: 'inspect_files',
  description:
    'Request the complete text content of one or more files from the repository to investigate their implementation details, type definitions, and dependencies.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filePaths: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          'List of exact repository paths to read, matching paths from the directory tree (e.g. ["src/index.ts", "lib/auth.ts"]).',
      },
      reason: {
        type: Type.STRING,
        description:
          'Concise technical reason explaining why these files are relevant to the requested improvements.',
      },
    },
    required: ['filePaths', 'reason'],
  },
};

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
      githubPat,
      maxRounds: rawMaxRounds = 3,
      repositoryContext, // For fallback legacy full mode
      investigatedFiles: clientInvestigatedFiles, // Pre-routed files from client
      models: customModels,
      requestTimeout = 60,
    } = body;

    const maxRounds = Math.min(Math.max(1, Number(rawMaxRounds) || 3), 4);

    const timeoutMs = Math.max(15000, Number(requestTimeout) * 1000);

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

    const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Gemini API key is not configured. Please ensure GEMINI_API_KEY is available or provide a custom key in Settings.',
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
    // AGENTIC SEQUENTIAL EXPLORATION MODE
    // ==========================================
    if (mode === 'agentic' && owner && repo && treeListing) {
      const readable = new ReadableStream({
        async start(controller) {
          const sendEvent = (eventData: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
          };

          try {
            sendEvent({
              type: 'agent_start',
              message: 'Initializing agentic exploration loop...',
              owner,
              repo,
              branch,
            });

            const exploredFilesMap = new Map<string, SourceFile>();
            const explorationTrail: ExplorationStep[] = [];

            // If client already pre-routed/investigated files, use them directly!
            if (Array.isArray(clientInvestigatedFiles) && clientInvestigatedFiles.length > 0) {
              for (const f of clientInvestigatedFiles) {
                if (f && f.path && typeof f.content === 'string') {
                  exploredFilesMap.set(f.path, f);
                }
              }
            }

            // If no pre-investigated files provided by client, run server-side exploration
            if (exploredFilesMap.size === 0) {
              const conversationContents: any[] = [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `Target Repository: ${owner}/${repo} (branch: ${branch})

=== FULL DIRECTORY TREE SKELETON ===
${treeListing}
=== END DIRECTORY TREE ===

DEVELOPER'S REQUESTED IMPROVEMENTS:
${improvementPrompt}

INSTRUCTIONS FOR AGENTIC EXPLORATION:
1. Analyze the directory tree skeleton and determine the initial suspect files that must be read to implement the requested improvements.
2. Call the 'inspect_files' tool with the exact relative paths (e.g., ["src/app.ts", "lib/auth.ts"]) and your technical reasoning.
3. If you have already inspected all required files, do not call 'inspect_files'; simply answer "READY" so the compiler can stream the final prompt.`,
                    },
                  ],
                },
              ];

              let activeModel = '';
              let activePass = 1;

              for (let round = 1; round <= maxRounds; round++) {
                sendEvent({
                  type: 'agent_round',
                  round,
                  maxRounds,
                  message: `Round ${round} of ${maxRounds}: Agent reasoning over repository blast radius...`,
                });

                let exploreResult: unknown = null;

                for (let pass = 1; pass <= 2; pass++) {
                  for (const model of cascadingModels) {
                    try {
                      const response = await withTimeout(
                        ai.models.generateContent({
                          model,
                          contents: conversationContents,
                          config: {
                            systemInstruction:
                              'You are Next.js Expert, a Principal Architectural Cartographer investigating a Next.js codebase. Use the inspect_files tool to examine source code files before producing architectural prompts.',
                            tools: [{ functionDeclarations: [inspectFilesToolDeclaration] }],
                            temperature: 0.1,
                          },
                        }),
                        timeoutMs,
                        `Model ${model} exploration timed out after ${requestTimeout}s`
                      );
                      exploreResult = response;
                      activeModel = model;
                      activePass = pass;
                      break;
                    } catch (err) {
                      console.warn(`[Agentic Cascade] Round ${round} Model ${model} failed in Pass ${pass}:`, err);
                    }
                  }
                  if (exploreResult) break;
                }

                if (!exploreResult) {
                  break;
                }

                const exploreResp = exploreResult as any;
                const functionCalls = exploreResp?.functionCalls || exploreResp?.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
                const inspectCall = Array.isArray(functionCalls) ? functionCalls[0] : functionCalls;

                if (inspectCall && (inspectCall.args || inspectCall.filePaths)) {
                  const args = inspectCall.args || inspectCall;
                  const requestedPaths: string[] = Array.isArray(args.filePaths)
                    ? (args.filePaths as string[])
                    : [];
                  const reason: string = (args.reason as string) || 'Suspected file in blast radius';

                  const newPathsToFetch = requestedPaths
                    .map(normalizeRepoPath)
                    .filter((p) => p && !exploredFilesMap.has(p));

                  if (newPathsToFetch.length === 0) {
                    break;
                  }

                  sendEvent({
                    type: 'agent_inspect',
                    round,
                    paths: newPathsToFetch,
                    reason,
                  });

                  const downloaded = await fetchFilesOnDemand(
                    owner,
                    repo,
                    branch,
                    newPathsToFetch,
                    githubPat
                  );

                  for (const file of downloaded) {
                    exploredFilesMap.set(file.path, file);
                  }

                  const stepRecord: ExplorationStep = {
                    id: `step-${round}-${Date.now()}`,
                    round,
                    paths: newPathsToFetch,
                    reason,
                    timestamp: Date.now(),
                    status: 'completed',
                    filesSummary: downloaded.map((f) => ({ path: f.path, size: f.size })),
                  };
                  explorationTrail.push(stepRecord);

                  sendEvent({
                    type: 'agent_files_loaded',
                    round,
                    step: stepRecord,
                    totalInvestigated: exploredFilesMap.size,
                  });

                  const candidateContent = exploreResp.candidates?.[0]?.content;
                  if (candidateContent) {
                    conversationContents.push(candidateContent);
                  }

                  const filesPayload = downloaded
                    .map(
                      (f) =>
                        `--- FILE: @[/${f.path}] ---\n${f.content.slice(0, 15000)}\n--- END FILE ---`
                    )
                    .join('\n\n');

                  const callId = (inspectCall as { id?: string }).id;
                  conversationContents.push({
                    role: 'tool',
                    parts: [
                      {
                        functionResponse: {
                          name: 'inspect_files',
                          ...(callId ? { id: callId } : {}),
                          response: {
                            output: `Successfully loaded ${downloaded.length} files:\n${filesPayload}`,
                          },
                        },
                      },
                    ],
                  });
                } else {
                  break;
                }
              }
            }

            // Fallback if still empty: grab up to 25 core files from tree
            if (exploredFilesMap.size === 0) {
              const fallbackPaths = treeListing
                .split('\n')
                .map((l: string) => l.replace(/^@\[\//, '').replace(/\]$/, '').trim())
                .filter((p: string) => p && !p.includes('node_modules') && !p.includes('.git') && !p.endsWith('.lock'))
                .slice(0, 25);

              if (fallbackPaths.length > 0) {
                const fallbackDownloaded = await fetchFilesOnDemand(
                  owner,
                  repo,
                  branch,
                  fallbackPaths,
                  githubPat
                );
                for (const f of fallbackDownloaded) {
                  exploredFilesMap.set(f.path, f);
                }
              }
            }

            // ==========================================
            // PHASE 2: SYNTHESIZE & STREAM PROMPT
            // ==========================================
            const exploredFilesList = Array.from(exploredFilesMap.values());

            let focusedContext = `### REPOSITORY SNAPSHOT (AGENTICALLY TARGETED)
Target Repository: ${owner}/${repo}
Branch: ${branch}
Investigation Strategy: Sequential Blast Radius Exploration
Total Targeted Files in Context: ${exploredFilesList.length}

=== DIRECTORY TREE SKELETON ===
${treeListing}
=== END DIRECTORY TREE ===

=== TARGETED SOURCE CODE ===\n`;

            for (const file of exploredFilesList) {
              const formattedPath = `@[/${file.path.replace(/^\//, '')}]`;
              focusedContext += `\n--- START FILE: ${formattedPath} ---\n`;
              focusedContext += file.content;
              focusedContext += `\n--- END FILE: ${formattedPath} ---\n`;
            }
            focusedContext += '\n=== END TARGETED SOURCE CODE ===\n';

            const finalPromptPayload = `Here is the agentically discovered repository context:\n\n${focusedContext}\n\n==========================================\nDEVELOPER'S REQUESTED IMPROVEMENTS:\n${improvementPrompt}\n\nCompile the Next.js Expert Autonomous Execution Prompt strictly following your system instruction.`;

            const estimatedInputTokens = Math.max(
              1,
              Math.ceil((NEXTJS_EXPERT_SYSTEM_INSTRUCTION.length + finalPromptPayload.length) / 4)
            );

            sendEvent({
              type: 'compiling_start',
              message: `Synthesizing architectural prompt from ${exploredFilesList.length} investigated files...`,
              investigatedFiles: exploredFilesList.map((f) => f.path),
              model: cascadingModels[0],
              pass: 1,
              trail: explorationTrail,
              inputTokens: estimatedInputTokens,
            });

            let streamResponse: any = null;
            let streamModel = '';
            let streamPass = 1;

            const thinkingLevel = body.thinkingLevel || 'high';
            const thinkingSummaries = body.thinkingSummaries || 'auto';

            for (let pass = 1; pass <= 2; pass++) {
              for (const model of cascadingModels) {
                // Try first with thinkingConfig, then fallback without thinkingConfig if unsupported
                for (const useThinking of [true, false]) {
                  try {
                    const config: any = {
                      systemInstruction: NEXTJS_EXPERT_SYSTEM_INSTRUCTION,
                      temperature: 0.2,
                    };
                    if (useThinking) {
                      config.thinkingConfig = {
                        thinkingLevel,
                        thinkingSummaries,
                      };
                    }

                    const candidateStream = await withTimeout(
                      ai.models.generateContentStream({
                        model,
                        contents: finalPromptPayload,
                        config,
                      }),
                      timeoutMs,
                      `Model ${model} stream initiation timed out after ${requestTimeout}s`
                    );

                    const iterator = candidateStream[Symbol.asyncIterator]();
                    const firstResult = await withTimeout(
                      iterator.next(),
                      timeoutMs,
                      `Model ${model} first chunk timed out after ${requestTimeout}s`
                    );

                    streamResponse = {
                      firstChunk: firstResult.value,
                      iterator,
                    };
                    streamModel = model;
                    streamPass = pass;
                    break;
                  } catch (err) {
                    console.warn(`[Prompt Stream Cascade] ${model} (thinking: ${useThinking}) failed in Pass ${pass}:`, err);
                  }
                }
                if (streamResponse) break;
              }
              if (streamResponse) break;
            }

            if (!streamResponse) {
              sendEvent({
                type: 'error',
                error: 'All cascading models failed to stream the final prompt after 2 passes.',
              });
              controller.close();
              return;
            }

            sendEvent({
              type: 'thinking_start',
              message: `Model thinking initialized (level: ${thinkingLevel})...`,
            });

            let thinkingStarted = true;
            let thinkingEnded = false;
            let accumulatedPromptText = '';
            let refactorDelimiterSeen = false;

            const handlePromptText = (incomingText: string) => {
              accumulatedPromptText += incomingText;
              if (thinkingStarted && !thinkingEnded) {
                thinkingEnded = true;
                sendEvent({ type: 'thinking_end' });
              }

              if (refactorDelimiterSeen) {
                // Suffix after delimiter has started, do not leak into prompt_chunk stream
                return;
              }

              // Check if delimiter has appeared
              const delimIndex = accumulatedPromptText.search(/---+[\s*]*SUGGESTED/i);
              if (delimIndex !== -1) {
                refactorDelimiterSeen = true;
                const prevLength = accumulatedPromptText.length - incomingText.length;
                if (delimIndex > prevLength) {
                  const safeChunk = accumulatedPromptText.slice(prevLength, delimIndex);
                  if (safeChunk) {
                    sendEvent({ type: 'prompt_chunk', text: safeChunk });
                  }
                }
                return;
              }

              sendEvent({ type: 'prompt_chunk', text: incomingText });
            };

            const processChunkValue = (val: any) => {
              if (!val) return;
              const candidate = val.candidates?.[0];
              const parts = candidate?.content?.parts || [];
              let foundPromptText = false;

              for (const part of parts) {
                if (
                  part.thought === true ||
                  (part.thought && typeof part.thought === 'object' && Object.keys(part.thought).length > 0)
                ) {
                  if (part.text) {
                    sendEvent({ type: 'thinking_chunk', text: part.text });
                  }
                } else {
                  if (part.text) {
                    foundPromptText = true;
                    handlePromptText(part.text);
                  }
                }
              }

              if (!foundPromptText) {
                const directText = val.text || candidate?.text;
                if (typeof directText === 'string' && directText.length > 0) {
                  foundPromptText = true;
                  handlePromptText(directText);
                }
              }
            };

            if (streamResponse.firstChunk) {
              processChunkValue(streamResponse.firstChunk);
            }

            while (true) {
              const { done, value } = await streamResponse.iterator.next();
              if (done) break;
              processChunkValue(value);
            }

            if (thinkingStarted && !thinkingEnded) {
              sendEvent({ type: 'thinking_end' });
            }

            const { cleanText, refactors } = parseSuggestedRefactors(accumulatedPromptText);

            sendEvent({
              type: 'suggested_refactors',
              refactors,
              cleanPrompt: cleanText,
            });

            const estimatedOutputTokens = Math.max(1, Math.ceil(cleanText.length / 4));
            const costCalculation = calculateModelCost(streamModel, estimatedInputTokens, estimatedOutputTokens);
            const costDetails = {
              inputTokens: estimatedInputTokens,
              outputTokens: estimatedOutputTokens,
              inputCostUsd: costCalculation.inputCostUsd,
              outputCostUsd: costCalculation.outputCostUsd,
              totalCostUsd: costCalculation.totalCostUsd,
              modelName: costCalculation.modelName,
            };

            sendEvent({
              type: 'done',
              model: streamModel,
              pass: streamPass,
              totalInvestigated: exploredFilesList.length,
              investigatedFiles: exploredFilesList.map((f) => ({
                path: f.path,
                size: f.size,
                content: f.content,
              })),
              trail: explorationTrail,
              inputTokens: estimatedInputTokens,
              outputTokens: estimatedOutputTokens,
              costDetails,
              suggestedRefactors: refactors,
              cleanContent: cleanText,
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

    // ==========================================
    // CLASSIC FULL REPOSITORY INGESTION MODE
    // ==========================================
    let contextToUse = repositoryContext || treeListing || '';

    // Safeguard context size to prevent gateway timeout on gigantic monorepos
    const MAX_CONTEXT_CHARS = 700_000; // ~175,000 tokens
    if (contextToUse.length > MAX_CONTEXT_CHARS) {
      contextToUse =
        contextToUse.slice(0, MAX_CONTEXT_CHARS) +
        '\n\n[... Remaining repository source code files truncated to prevent HTTP gateway timeout. Consider using Agentic Exploration Mode for selective deep file analysis ...]';
    }

    let systemInstructionToUse = NEXTJS_EXPERT_SYSTEM_INSTRUCTION;
    let userContent = `Here is the repository context:\n\n${contextToUse}\n\n==========================================\nDEVELOPER'S REQUESTED IMPROVEMENTS:\n${improvementPrompt}\n\nCompile the Next.js Expert Autonomous Execution Prompt strictly following your system instruction.`;

    if (mode === 'idea') {
      systemInstructionToUse = IDEA_MODE_SYSTEM_INSTRUCTION;
      userContent = `Here is the repository context for feature ideation and RICE / VRIN-EO evaluation:\n\n${contextToUse}\n\n==========================================\nDEVELOPER FOCUS OR GOAL:\n${improvementPrompt}\n\nSynthesize 77 innovative feature ideas and present the top 7 highest-ranked ideas according to your system instruction.`;
    } else if (mode === 'btw') {
      systemInstructionToUse = BTW_MODE_SYSTEM_INSTRUCTION;
      userContent = `Here is the repository context:\n\n${contextToUse}\n\n==========================================\nDEVELOPER'S QUESTION:\n${improvementPrompt}\n\nAnswer the question directly and authoritatively with @[/path/to/file.ext] citations according to your system instruction.`;
    }

    let firstChunkText: string | null = null;
    let activeStreamIterator: AsyncIterator<any> | null = null;
    let successfulModel = '';
    let successfulPass = 0;
    const failureLog: string[] = [];

    const MAX_PASSES = 2;

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      for (let i = 0; i < cascadingModels.length; i++) {
        const modelName = cascadingModels[i];
        try {
          const responseStream = await withTimeout(
            ai.models.generateContentStream({
              model: modelName,
              contents: userContent,
              config: {
                systemInstruction: systemInstructionToUse,
                temperature: mode === 'idea' ? 0.4 : 0.2,
              },
            }),
            timeoutMs,
            `Model ${modelName} stream initiation timed out after ${requestTimeout}s`
          );

          const iterator = responseStream[Symbol.asyncIterator]();
          const firstResult = await withTimeout(
            iterator.next(),
            timeoutMs,
            `Model ${modelName} first chunk timed out after ${requestTimeout}s`
          );

          if (firstResult.done && !firstResult.value?.text) {
            throw new Error(`Model ${modelName} returned an empty stream response`);
          }

          firstChunkText = firstResult.value?.text || '';
          activeStreamIterator = iterator;
          successfulModel = modelName;
          successfulPass = pass;
          break;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          failureLog.push(`[Pass ${pass} / Model ${i + 1} (${modelName})]: ${errMsg}`);
          console.warn(`[Cascading Fallback] Pass ${pass} - ${modelName} failed:`, errMsg);
        }
      }

      if (activeStreamIterator !== null) {
        break;
      }
    }

    if (!activeStreamIterator && firstChunkText === null) {
      return NextResponse.json(
        {
          error: `All ${cascadingModels.length} Gemini models in the cascading fallback strategy failed after ${MAX_PASSES} full passes.\n\nFailures:\n${failureLog.join('\n')}`,
        },
        { status: 502 }
      );
    }

    const estimatedClassicInputTokens = Math.max(
      1,
      Math.ceil((NEXTJS_EXPERT_SYSTEM_INSTRUCTION.length + userContent.length) / 4)
    );
    const estimatedClassicOutputTokens = Math.max(
      1,
      Math.ceil((firstChunkText || '').length / 4)
    );
    const classicCost = calculateModelCost(
      successfulModel,
      estimatedClassicInputTokens,
      estimatedClassicOutputTokens
    );

    const readable = new ReadableStream({
      async start(controller) {
        try {
          if (firstChunkText) {
            controller.enqueue(encoder.encode(firstChunkText));
          }

          if (activeStreamIterator) {
            while (true) {
              const { done, value } = await activeStreamIterator.next();
              if (done) break;
              const text = value?.text;
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            }
          }
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
        'X-Model-Used': successfulModel,
        'X-Fallback-Pass': String(successfulPass),
        'X-Input-Tokens': String(estimatedClassicInputTokens),
        'X-Output-Tokens': String(estimatedClassicOutputTokens),
        'X-Total-Cost-Usd': String(classicCost.totalCostUsd),
      },
    });
  } catch (err: unknown) {
    console.error('Error in /api/compile:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
