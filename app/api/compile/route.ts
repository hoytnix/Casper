import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { SourceFile, ExplorationStep } from '@/types';
import { fetchFilesOnDemand, normalizeRepoPath } from '@/lib/github';
import { calculateModelCost, extractSuggestedRefactors } from '@/lib/utils';
import { detectRepositoryFramework } from '@/lib/framework-detector';
import {
  normalizeConversationHistory,
  toGenAiHistory,
  toMuseMessages,
} from '@/lib/chat-history';
import {
  buildGeminiThinkingConfig,
  buildMuseThinkingPayload,
  normalizeThinkingLevel,
  normalizeThinkingSummaries,
} from '@/lib/thinking-levels';
import {
  buildMuseRequestBody,
  createMuseStreamParser,
  flushMuseStreamParser,
  pushMuseSseText,
} from '@/lib/muse-stream';

const NEXTJS_EXPERT_SYSTEM_INSTRUCTION = `You are Casper, the friendly ghost who reads all your code — a Principal Architect and Autonomous Prompt Compiler specializing exclusively in Next.js 15+ App Router, React Server Components (RSC), Server Actions, Route Handlers, and modern TypeScript architecture.
You have been given a Next.js repository structure and the developer's requested improvements.
Your objective is to synthesize the developer's high-level intent with the exact structural reality of the codebase, outputting a single, self-contained, end-to-end execution prompt directly in clean, structured Markdown.

NEXT.JS ARCHITECTURAL SPECIALIZATION & INVARIANTS:
1. **App Router Conventions**: Enforce exact conventions across \`app/**/page.tsx\`, \`app/**/layout.tsx\`, \`app/**/loading.tsx\`, \`app/**/error.tsx\`, \`app/**/not-found.tsx\`, \`app/api/**/route.ts\`, and \`middleware.ts\`.
2. **Server vs. Client Boundaries**: Server Components are the default. Add \`'use client'\` ONLY at interactive leaf nodes (event listeners, hooks, browser APIs). Never import Server Components into Client Components; pass them as \`children\`.
3. **Server Actions & Mutations**: Mark server mutation files or functions with \`'use server'\`. Validate all inputs with Zod schemas and trigger revalidation (\`revalidatePath\` or \`revalidateTag\`).
4. **Data Fetching & Streaming**: Prefer async Server Component fetching with Suspense boundaries. Configure caching explicitly (\`force-dynamic\`, \`revalidate\`, or \`cache: 'no-store'\`).
5. **Route Handlers**: Use \`NextRequest\` and \`NextResponse.json\` with proper HTTP status codes.
6. **Clean TypeScript & Styling**: Use strict TypeScript interfaces, avoid \`any\`, and style cleanly with Tailwind CSS utility classes.

PROMPT DEBILITATION & ELEVATION PROTOCOL (Muse Spark MAX thinking):
1. **Interrogate Boundary Assumptions**: Never take vague prompts ("fix the API", "add auth") at face value. Stress-test every request against the investigated repository snapshot — flag Server/Client boundary violations, missing Zod schemas, absent revalidation, or App Router convention breaks before compiling a single step.
2. **Dependency-Ordered Breakdown**: Dismantle the request into strict order: types FIRST, Zod validators SECOND, server actions/utilities THIRD, route handlers and UI components LAST. Reject any plan that builds UI before its data contract exists.
3. **Edge Invariants**: Inject explicit invariants for every step (auth checks, input validation, error boundaries, loading states, cache directives). If the developer omitted them, add them and call out the omission in the Architectural Context section.
4. **Citation Rigor**: Every file reference MUST use @[/path/to/file.ext] with exact investigated paths. No hand-wavy "the auth file" — name it or refuse the step.
5. **Dead-Code Purge**: Target unused imports, redundant 'use client' directives, obsolete types, and legacy routes caused by the change. A plan without a purge section is incomplete.

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

const IDEA_MODE_SYSTEM_INSTRUCTION = `You are Casper, the friendly ghost who reads all your code — a hostile Venture Technologist and Principal Product Architect. Your task is to analyze the provided Next.js repository, extract existing features, synthesize 77 innovative feature and architectural improvements, then ruthlessly weed out low-impact feature bloat.

IDEA DEBILITATION PROTOCOL (Muse Spark MAX thinking):
1. **Stress-Test Every Idea**: Score all 77 candidates rigorously with RICE (Reach, Impact, Confidence, Effort) and VRIN-EO (Value, Relativity, Inimitability, Non-Substitutability & Engine-Optimization). Penalize high-effort, low-engine-optimization concepts — they die in screening, no matter how shiny.
2. **Kill Weak Concepts**: Debilitate vague, derivative, or scope-creeping ideas explicitly. State WHY each rejected archetype failed (effort blowup, zero inimitability, substitutable by a library, no engine leverage).
3. **Top 7 Survivors Only**: Present exactly the top 7 highest-ranked architectural breakthroughs in clean, structured Markdown with a breakdown table of RICE and VRIN-EO metrics, implementation hints, and exact @[/path/to/file.ext] implementation targets.
4. **Grounded Targets**: Every surviving idea MUST cite real investigated files as its implementation surface. No idea without an @[/path/to/file.ext] anchor.`;

const BTW_MODE_SYSTEM_INSTRUCTION = `You are Casper, the friendly ghost who reads all your code — an uncompromising Senior Codebase Assistant. Answer the developer's question directly and authoritatively using the provided repository context. Refuse hand-wavy explanations.

BTW DEBILITATION PROTOCOL (Muse Spark MAX thinking):
1. **Trace the Real Graph**: Cross-examine import closures and function call edges from the investigated snapshot. Explain exact request flows from entry point (app/**/page.tsx, middleware.ts, app/api/**/route.ts) to handler, naming every hop.
2. **Precise Citations**: Cite files explicitly using @[/path/to/file.ext] format with line-level precision where possible. Every architectural claim needs a file anchor.
3. **Debilitate Surface Answers**: If the question is ambiguous (routing architecture, middleware chains, data flows), interrogate the ambiguity, state your interpretation, then answer with evidence — never with generic filler.
4. **No Templates**: Do not generate Antigravity prompt templates; provide direct, actionable technical answers.`;

const HONO_EXPERT_SYSTEM_INSTRUCTION = `You are Casper, the friendly ghost who reads all your code — a Principal Architect and Autonomous Prompt Compiler specializing exclusively in Hono (Cloudflare Workers, Bun, Node, Deno), lightweight ultrafast routing, RPC client bindings, Zod validator middleware, and robust edge architecture.
You have been given a Hono repository structure and the developer's requested improvements.
Your objective is to synthesize the developer's high-level intent with the exact structural reality of the codebase, outputting a single, self-contained, end-to-end execution prompt directly in clean, structured Markdown.

HONO ARCHITECTURAL SPECIALIZATION & INVARIANTS:
1. **Lightweight Routing**: Enforce Hono router conventions across \`src/index.ts\`, \`src/app.ts\`, \`src/routes/**/*.ts\` with chained handlers (\`app.get\`, \`app.post\`, \`app.put\`, \`app.delete\`, \`app.all\`), grouped sub-routers via \`app.route('/base', subApp)\`, and middleware via \`app.use()\`.
2. **Edge Runtime Optimization**: Target Cloudflare Workers / Bun constraints first — zero Node.js-only APIs on edge paths, minimal cold-start bundle, explicit runtime exports, and \`wrangler.toml\` / \`wrangler.json\` bindings kept in sync.
3. **Validation & Middleware**: Validate all inputs with \`hono/zod-validator\` (\`zValidator('json' | 'query' | 'param', schema)\`) composed as route middleware; order middleware deliberately (auth, validation, then handler).
4. **RPC Client Types**: Export shared route type bindings (\`hc<AppType>\`) for end-to-end type-safe clients; keep server/client contract types in one dependency-first module.
5. **Clean TypeScript & Errors**: Use strict TypeScript interfaces, avoid \`any\`, return typed JSON with proper HTTP status codes, and centralize error handling with \`app.onError\` / \`app.notFound\`.

PROMPT DEBILITATION & ELEVATION PROTOCOL (Muse Spark MAX thinking):
1. **Interrogate Boundary Assumptions**: Never take vague prompts ("fix the API", "add auth") at face value. Stress-test every request against the investigated repository snapshot — flag edge-vs-Node violations, missing zValidator middleware, unsynced wrangler bindings, or broken RPC contract types before compiling a single step.
2. **Dependency-Ordered Breakdown**: Dismantle the request into strict order: shared types FIRST, Zod schemas/validators SECOND, middleware THIRD, routers and RPC bindings LAST. Reject any plan that wires routes before their validators exist.
3. **Edge Invariants**: Inject explicit invariants for every step (runtime target, auth middleware order, validation scope, error/notFound handling, binding sync). If the developer omitted them, add them and call out the omission in the Architectural Context section.
4. **Citation Rigor**: Every file reference MUST use @[/path/to/file.ext] with exact investigated paths. No hand-wavy "the route file" — name it or refuse the step.
5. **Dead-Code Purge**: Target unused imports, redundant middleware, obsolete validators, and legacy routes caused by the change. A plan without a purge section is incomplete.

STRICT FORMATTING RULES FOR YOUR OUTPUTTED PROMPT:
1. Every file or directory path reference MUST be prepended with an @ symbol and surrounded by brackets, like @[/src/index.ts] or @[/src/routes/users.ts], WITHOUT surrounding backticks.
2. Never include citations or external source markers in your outputted prompt.
3. Output the prompt directly in clean Markdown. Do NOT wrap the entire prompt in outer code block fences or backticks (e.g. do not enclose in \`\`\`\`markdown or \`\`markdown). Internal code blocks within steps (such as TypeScript, JSON, or terminal commands) must use standard triple-backticks (\`\`\`lang ... \`\`\`).
4. Sequence steps in strict dependency order (types, schemas/validators, middleware, and utilities FIRST; routers, RPC bindings, and entry points SECOND) so the build never breaks mid-execution.

STRUCTURE OF THE COMPILED PROMPT:
1. **Architectural Context & Hono Objectives**: Concise synthesis of the improvements, Hono routing conventions, and core invariants.
2. **Blast Radius & Target Manifest**: Every @[/path/to/file.ext] to be created, modified, or deleted and its Hono role (\`hono-route\`, \`hono-middleware\`, \`types\`, \`config\`, \`util\`, etc.).
3. **Step-by-Step Execution Choreography**: Atomic, ordered steps detailing Target @[/file/path], runtime boundary directives (edge vs. Node), Current vs. Target State, and exact Implementation Directives (referencing real handlers, validators, bindings, and imports).
4. **Dead Code & Redundancy Purge**: Explicit cleanup of unused imports, redundant middleware, obsolete types, or legacy routes caused by the changes.
5. **Verification & Invariant Checks**: Exact terminal commands (\`npm run build\`, \`npm run lint\`) and runtime behavioral checks to verify completion.
6. **Dynamic Follow-up Refactors**: At the very end of your response, append exactly this separator:
---SUGGESTED_REFACTORS---
Followed immediately by a valid JSON array of exactly 4 short, actionable architectural follow-up refactor prompts (strings) tailored specifically to the investigated codebase files and Hono edge architecture best practices.`;

const HONO_IDEA_MODE_SYSTEM_INSTRUCTION = `You are Casper, the friendly ghost who reads all your code — a hostile Venture Technologist and Principal Product Architect. Your task is to analyze the provided Hono repository, extract existing endpoints and middleware, synthesize 77 innovative feature and architectural improvements, then ruthlessly weed out low-impact feature bloat.

IDEA DEBILITATION PROTOCOL (Muse Spark MAX thinking):
1. **Stress-Test Every Idea**: Score all 77 candidates rigorously with RICE (Reach, Impact, Confidence, Effort) and VRIN-EO (Value, Relativity, Inimitability, Non-Substitutability & Engine-Optimization). Penalize high-effort, low-engine-optimization concepts — edge-bundle bloat and middleware sprawl die in screening.
2. **Kill Weak Concepts**: Debilitate vague, derivative, or scope-creeping ideas explicitly. State WHY each rejected archetype failed (cold-start cost, binding sprawl, substitutable by Hono middleware, no RPC leverage).
3. **Top 7 Survivors Only**: Present exactly the top 7 highest-ranked architectural breakthroughs in clean, structured Markdown with a breakdown table of RICE and VRIN-EO metrics, implementation hints, and exact @[/path/to/file.ext] implementation targets.
4. **Grounded Targets**: Every surviving idea MUST cite real investigated files (routers, middleware, validators) as its implementation surface. No idea without an @[/path/to/file.ext] anchor.`;

const HONO_BTW_MODE_SYSTEM_INSTRUCTION = `You are Casper, the friendly ghost who reads all your code — an uncompromising Senior Codebase Assistant. Answer the developer's question directly and authoritatively using the provided repository context. Refuse hand-wavy explanations.

BTW DEBILITATION PROTOCOL (Muse Spark MAX thinking):
1. **Trace the Real Graph**: Cross-examine route chains (app.get/post/put/delete/all/use/route), middleware order, validator composition, and RPC bindings from the investigated snapshot. Explain exact request flows from entry point (src/index.ts, src/app.ts) through middleware to handler, naming every hop.
2. **Precise Citations**: Cite files explicitly using @[/path/to/file.ext] format with line-level precision where possible. Every architectural claim needs a file anchor.
3. **Debilitate Surface Answers**: If the question is ambiguous (routing architecture, middleware chains, validator/RPC flows), interrogate the ambiguity, state your interpretation, then answer with evidence — never with generic filler.
4. **No Templates**: Do not generate Antigravity prompt templates; provide direct, actionable technical answers.`;

// MAX-thinking critique overlay: prepended to the active mode instruction when
// the request carries a Muse-only effort tier (xhigh/max). Escalates the base
// debilitation protocols into hostile-critic mode regardless of which cascade
// model ultimately streams the response.
const MUSE_MAX_DEBILITATION_OVERLAY = `MAX REASONING OVERRIDE (xhigh/max thinking effort): You are operating at maximum thinking depth on the Muse Spark cascade. Act as a hostile, uncompromising critic — never a passive executor. Interrogate every assumption in the developer's prompt, expose architectural debilities, structural risks, and vague scope, then aggressively elevate the request into a precise, evidence-grounded response. Refuse generic filler, refuse unverified claims, and ground every assertion in the investigated @[/path/to/file.ext] snapshot. Depth and rigor over brevity.`;

// Cascading Fallback Strategy: Muse Spark tiers first, then Gemini flagships.
// Muse-tagged models route to the Muse API via Bearer-token auth; all others use the Google GenAI SDK.
const DEFAULT_CASCADING_MODELS = [
  'muse-spark-1.3-contributor',
  'muse-spark-1.3',
  'gemini-4-argon',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
] as const;

// Muse API transport (edge-safe: standard fetch + ReadableStream only, no Node APIs).
// Base URL is operator-configurable; the default endpoint is unconfirmed and may need
// to be overridden via MUSE_API_BASE_URL if Muse publishes a different chat-completions host.
const MUSE_API_BASE_URL = (process.env.MUSE_API_BASE_URL || 'https://api.muse.ai/v1').replace(/\/+$/, '');

function isMuseModelTag(tag: unknown): boolean {
  const norm = String(tag || '').toLowerCase().trim();
  return norm.startsWith('muse-') || norm === 'muse' || norm.includes('muse-spark') || norm.includes('muse');
}

/**
 * Streams a Muse Spark chat completion as an async generator yielding
 * Gemini-shaped `{ candidates: [{ content: { parts: [{ text }] } }] }` chunks
 * so the shared SSE pipeline below can consume either provider identically.
 */
async function* streamMuseCompletionChunks(args: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  historyMessages?: { role: string; content: string }[];
  temperature: number;
  timeoutMs: number;
  thinkingLevel?: string;
  thinkingSummaries?: string;
}): AsyncGenerator<{ candidates: { content: { parts: { text: string }[] } }[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  if (typeof (timer as unknown as { unref?: unknown }).unref === 'function') {
    (timer as unknown as { unref: () => void }).unref();
  }
  try {
    const res = await fetch(`${MUSE_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(
        buildMuseRequestBody({
          model: args.model,
          systemInstruction: args.systemInstruction,
          prompt: args.prompt,
          historyMessages: args.historyMessages,
          temperature: args.temperature,
          // Muse Spark carries the full five-level scale (xhigh/max included).
          thinkingPayload: buildMuseThinkingPayload(
            normalizeThinkingLevel(args.thinkingLevel),
            normalizeThinkingSummaries(args.thinkingSummaries)
          ),
        })
      ),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Muse API error (${res.status}): ${errText.slice(0, 300)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = createMuseStreamParser();
    const emit = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const text of pushMuseSseText(parser, decoder.decode(value, { stream: true }))) {
        yield emit(text);
      }
      if (parser.finished) return;
    }
    for (const text of flushMuseStreamParser(parser)) {
      yield emit(text);
    }
  } finally {
    clearTimeout(timer);
  }
}

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
      customMuseApiKey,
      museApiKey: bodyMuseApiKey,
      githubPat,
      maxRounds: rawMaxRounds = 3,
      repositoryContext, // For fallback legacy full mode
      investigatedFiles: clientInvestigatedFiles, // Pre-routed files from client
      conversationHistory: rawConversationHistory, // Prior ChatMessage turns for multi-turn caching
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
          const sendEvent = (eventData: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
          };

          try {
            sendEvent({
              type: 'agent_start',
              message: `Initializing agentic exploration loop (Mode: ${mode})...`,
              owner,
              repo,
              branch,
            });

            const exploredFilesMap = new Map<string, SourceFile>();
            const explorationTrail: ExplorationStep[] = [];

            // Seed with client investigated files if provided
            if (Array.isArray(clientInvestigatedFiles) && clientInvestigatedFiles.length > 0) {
              for (const f of clientInvestigatedFiles) {
                if (f && f.path && typeof f.content === 'string') {
                  exploredFilesMap.set(f.path, f);
                }
              }
            }

            const alreadyInspectedList = Array.from(exploredFilesMap.keys());
            const conversationContents: any[] = [
              {
                role: 'user',
                parts: [
                  {
                    text: `Target Repository: ${owner}/${repo} (branch: ${branch})

=== FULL DIRECTORY TREE SKELETON ===
${treeListing}
=== END DIRECTORY TREE ===

${alreadyInspectedList.length > 0 ? `ALREADY INSPECTED FILES (ROUND 0 SEED):\n${alreadyInspectedList.map(p => `• @[/${p}]`).join('\n')}\n` : ''}

DEVELOPER'S REQUESTED IMPROVEMENTS / GOAL (Mode: ${mode}):
${improvementPrompt}

INSTRUCTIONS FOR MULTI-ROUND EXPLORATION (Up to ${maxRounds} rounds):
1. In each round, analyze the codebase call graph and import closure.
2. In Round 1, inspect primary suspect files (pages, route handlers, core components).
3. In subsequent rounds (Rounds 2 to ${maxRounds}), investigate secondary dependencies: imported utility functions, custom hooks, Zod validation schemas, state stores, or parent layout boundaries.
4. Call 'inspect_files' with the exact relative paths (e.g., ["lib/utils.ts", "app/layout.tsx"]) and technical reasoning.
5. Only if NO additional dependencies, schemas, or layouts are needed to satisfy the request, output "READY".`,
                  },
                ],
              },
            ];

            let activeModel = '';
            let activePass = 1;

            // Muse Spark models stream synthesis only — Gemini function-calling
            // (inspect_files) cannot run against muse- tags, so exploration stays
            // on the Gemini subset. A muse-only cascade skips straight to fallback
            // context + Muse synthesis streaming below.
            const explorationModels = cascadingModels.filter((m) => !isMuseModelTag(m));

            for (let round = 1; round <= maxRounds; round++) {
              sendEvent({
                type: 'agent_round',
                round,
                maxRounds,
                message: `Round ${round} of ${maxRounds}: Agent reasoning over repository blast radius...`,
              });

              let exploreResult: unknown = null;

              for (let pass = 1; pass <= 2; pass++) {
                for (const model of explorationModels) {
                  try {
                    const response = await withTimeout(
                      ai.models.generateContent({
                        model,
                        contents: conversationContents,
                        config: {
                          systemInstruction:
                            'You are a Principal Architectural Cartographer investigating a Next.js or Hono codebase. Use the inspect_files tool to examine source code files before producing architectural prompts. Inspect App Router pages, layouts, and route handlers in Next.js repos; inspect Hono routers (app.ts, src/index.ts, routes/), middleware (app.use), RPC bindings, and Zod validators in Hono repos.',
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

            let systemInstructionToUse = NEXTJS_EXPERT_SYSTEM_INSTRUCTION;
            if (mode === 'idea') {
              systemInstructionToUse = IDEA_MODE_SYSTEM_INSTRUCTION;
            } else if (mode === 'btw') {
              systemInstructionToUse = BTW_MODE_SYSTEM_INSTRUCTION;
            }
            if (detectedFramework === 'hono') {
              if (mode === 'idea') {
                systemInstructionToUse = HONO_IDEA_MODE_SYSTEM_INSTRUCTION;
              } else if (mode === 'btw') {
                systemInstructionToUse = HONO_BTW_MODE_SYSTEM_INSTRUCTION;
              } else {
                systemInstructionToUse = HONO_EXPERT_SYSTEM_INSTRUCTION;
              }
            }
            if (thinkingLevel === 'xhigh' || thinkingLevel === 'max') {
              systemInstructionToUse = `${MUSE_MAX_DEBILITATION_OVERLAY}\n\n${systemInstructionToUse}`;
            }

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

            let finalPromptPayload = `Here is the agentically discovered repository context:\n\n${focusedContext}\n\n==========================================\nDEVELOPER'S REQUESTED IMPROVEMENTS / GOAL (Mode: ${mode}):\n${improvementPrompt}\n\nCompile the response strictly following your system instruction.`;

            if (mode === 'idea') {
              finalPromptPayload = `Here is the agentically discovered repository context for feature ideation and RICE / VRIN-EO evaluation:\n\n${focusedContext}\n\n==========================================\nDEVELOPER FOCUS OR GOAL:\n${improvementPrompt}\n\nSynthesize 77 innovative feature ideas and present the top 7 highest-ranked ideas according to your system instruction.`;
            } else if (mode === 'btw') {
              finalPromptPayload = `Here is the agentically discovered repository context:\n\n${focusedContext}\n\n==========================================\nDEVELOPER'S QUESTION:\n${improvementPrompt}\n\nAnswer the question directly and authoritatively with @[/path/to/file.ext] citations according to your system instruction.`;
            }

            // Multi-turn state: prior chat turns are re-sent as the stable
            // conversation prefix so Gemini's implicit context caching applies
            // across follow-ups. Each request stays stateless HTTP — no
            // server-side session store — with the current repo context plus
            // the new developer prompt appended as the latest user turn.
            const historyTurns = normalizeConversationHistory(rawConversationHistory);
            const geminiHistory = toGenAiHistory(historyTurns);
            const museHistory = toMuseMessages(historyTurns);
            const historyChars = historyTurns.reduce((acc, t) => acc + t.content.length, 0);

            const estimatedInputTokens = Math.max(
              1,
              Math.ceil(
                (systemInstructionToUse.length + finalPromptPayload.length + historyChars) / 4
              )
            );

            sendEvent({
              type: 'compiling_start',
              message: `Synthesizing architectural response from ${exploredFilesList.length} investigated files (Mode: ${mode}, Framework: ${detectedFramework})...`,
              investigatedFiles: exploredFilesList.map((f) => f.path),
              model: cascadingModels[0],
              pass: 1,
              trail: explorationTrail,
              inputTokens: estimatedInputTokens,
              detectedFramework,
              historyTurns: historyTurns.length,
            });

            let streamResponse: any = null;
            let streamModel = '';
            let streamPass = 1;

            // thinkingLevel/thinkingSummaries normalized above (pre-overlay);
            // Gemini maps Muse-only xhigh/max down to high here.
            const geminiThinkingConfig = buildGeminiThinkingConfig(thinkingLevel, thinkingSummaries);

            for (let pass = 1; pass <= 2; pass++) {
              for (const model of cascadingModels) {
                // Muse Spark tags route to the Muse API with key authorization
                // headers; a missing key (or Muse failure) cascades onward.
                if (isMuseModelTag(model)) {
                  if (pass > 1) continue;
                  if (!museKey) {
                    console.warn(
                      `[Prompt Stream Cascade] ${model} skipped in Pass ${pass}: no Muse API key configured (Settings → Muse AI API Key or MUSE_API_KEY).`
                    );
                    continue;
                  }
                  try {
                    const museIterator = streamMuseCompletionChunks({
                      apiKey: museKey,
                      model,
                      systemInstruction: systemInstructionToUse,
                      prompt: finalPromptPayload,
                      historyMessages: museHistory,
                      temperature: mode === 'idea' ? 0.4 : 0.2,
                      timeoutMs,
                      thinkingLevel,
                      thinkingSummaries,
                    })[Symbol.asyncIterator]();
                    const firstResult = await withTimeout(
                      museIterator.next(),
                      timeoutMs,
                      `Model ${model} first chunk timed out after ${requestTimeout}s`
                    );
                    if (firstResult.done) {
                      throw new Error(`Model ${model} returned an empty stream`);
                    }
                    streamResponse = {
                      firstChunk: firstResult.value,
                      iterator: museIterator,
                    };
                    streamModel = model;
                    streamPass = pass;
                    break;
                  } catch (err) {
                    console.warn(`[Prompt Stream Cascade] ${model} failed in Pass ${pass}:`, err);
                    continue;
                  }
                }
                for (const useThinking of [true, false]) {
                  try {
                    const config: any = {
                      systemInstruction: systemInstructionToUse,
                      temperature: mode === 'idea' ? 0.4 : 0.2,
                    };
                    if (useThinking) {
                      // Gemini accepts only low/medium/high — Muse-only
                      // xhigh/max arrive here already mapped to high.
                      config.thinkingConfig = geminiThinkingConfig;
                    }

                    // Fresh stateful chat session per attempt: the normalized
                    // history prefix plus the current repo context turn travel
                    // together, so follow-ups hit the implicit context cache.
                    // A new Chat per attempt keeps cascade retries from
                    // polluting each other's conversation state.
                    const chat = ai.chats.create({ model, history: geminiHistory });
                    const candidateStream = await withTimeout(
                      chat.sendMessageStream({
                        message: finalPromptPayload,
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
                error: 'All cascading models failed to stream the response after 2 passes.',
              });
              controller.close();
              return;
            }

            sendEvent({
              type: 'thinking_start',
              message: `Model thinking initialized (level: ${thinkingLevel})...`,
              thinkingLevel,
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
                return;
              }

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
              cachedInputTokens: costCalculation.cachedInputTokens,
              inputCostUsd: costCalculation.inputCostUsd,
              outputCostUsd: costCalculation.outputCostUsd,
              cachedInputCostUsd: costCalculation.cachedInputCostUsd,
              totalCostUsd: costCalculation.totalCostUsd,
              modelName: costCalculation.modelName,
            };

            sendEvent({
              type: 'done',
              model: streamModel,
              pass: streamPass,
              detectedFramework,
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

    return NextResponse.json({ error: 'Missing owner, repo, or treeListing' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Error in /api/compile:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
