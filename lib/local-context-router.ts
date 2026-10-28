import { SourceFile, RouterToolTrace, RoutingResult, RouterEngineType, DetectedFramework, SuggestedDirective } from '@/types';
import { detectRepositoryFramework } from './framework-detector';
import { buildNextJsRepoIndex, expandWithNextJsImportClosure, countRolesForDirectives } from './nextjs-indexer';
import { buildNextJsCodeGraph, serializeCodeGraphForPrompt, summarizeGraphForDirectives } from './nextjs-code-graph';
import { sanitizeDirectives, buildFallbackDirectives } from './suggestion-schemas';
import { findRelatedSymbols } from './unix-vfs-tools';
import {
  checkGeminiNanoAvailability as checkNanoAvailability,
  ensureNanoSession,
  isNanoRepoKey,
  getNanoSession,
  runNanoToolLoop,
} from './routers/gemini-nano-router';
import {
  engineLabelForModelId,
  ensureQwenEngine,
  getMlcEngine,
  getMlcEngineModelId,
  runQwenToolLoop,
} from './routers/qwen-mlc-router';
import {
  DEFAULT_LOCAL_CONTEXT_TOKENS,
  isLocalGenerationEngine,
  validateLocalContextTokens,
} from './local-models';
import {
  cosineSimilarity,
  ensureArcticPipeline,
  getCachedFileEmbeddings,
  getEmbeddingPipeline,
  runArcticTier,
} from './routers/arctic-embed-router';

// Unified orchestrator for the in-browser context-routing engines. The
// engine implementations live in lib/routers/ (one file per tier); this
// module keeps preference gating, warmup sequencing, the Tier 3 keyword
// fallback, and local-only suggestion generation. Re-exported so existing
// callers (settings page) keep working.
export { checkNanoAvailability as checkGeminiNanoAvailability };

// Extend Window interface for Chrome built-in AI / LanguageModel API
declare global {
  interface Window {
    LanguageModel?: {
      availability: (options?: { outputLanguage?: string }) => Promise<'available' | 'readily' | 'no' | 'after-download' | 'unavailable'>;
      create: (options?: {
        initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        outputLanguage?: string;
        monitor?: (m: { addEventListener: (event: string, cb: (e: any) => void) => void }) => void;
      }) => Promise<any>;
    };
    ai?: {
      languageModel?: {
        availability: (options?: any) => Promise<string>;
        create: (options?: any) => Promise<any>;
      };
    };
  }
}

function frameworkRouterNote(framework: DetectedFramework): string {
  if (framework === 'hono') {
    return `Detected Framework: Hono edge-service backend (Cloudflare Workers / Bun / Node). Prioritize Hono routers (app.ts, src/index.ts, routes/), middleware (app.use), RPC bindings, and Zod validator middleware. get_route_map returns Hono endpoints alongside any Next.js routes.`;
  }
  if (framework === 'nextjs') {
    return `Detected Framework: Next.js App Router. Prioritize app/**/page.tsx, layouts, route handlers, and Server Actions.`;
  }
  if (framework === 'vite') {
    return `Detected Framework: Vite SPA / SSR frontend. Prioritize vite.config.ts, index.html, entry points (src/main.tsx, src/App.tsx), component trees, and client state hooks.`;
  }
  return `Detected Framework: unknown. Inspect Next.js App Router conventions, Hono controller structures (routers, middleware, RPC), and Vite SPA entry points (vite.config.ts, index.html, src/main.*, src/App.*) before selecting files.`;
}

export async function warmUpLocalContextRouter(
  files: SourceFile[],
  repoIdentifier: string,
  enginePreference: RouterEngineType = 'auto',
  onProgress?: (statusText: string, progressPercent?: number) => void,
  localContextTokens: number = DEFAULT_LOCAL_CONTEXT_TOKENS
): Promise<{ nanoReady: boolean; arcticReady: boolean; qwenReady: boolean; totalFiles: number }> {
  if (onProgress) onProgress('Initializing local context router...', 5);
  const repoIndex = buildNextJsRepoIndex(files);
  const codeGraph = buildNextJsCodeGraph(files);
  const graphSummary = serializeCodeGraphForPrompt(codeGraph);
  const detectedFramework = detectRepositoryFramework(files);
  const routerScopeNote = frameworkRouterNote(detectedFramework);

  let nanoReady = false;
  let arcticReady = false;
  let qwenReady = false;

  // 1. Warm up the selected MLC generation engine, if any. Warms only
  // the selected engine — never all models — at short context.
  const contextTokens = validateLocalContextTokens(localContextTokens);
  if (isLocalGenerationEngine(enginePreference)) {
    qwenReady = await ensureQwenEngine(enginePreference, onProgress, contextTokens);
  }

  // 2. Warm up Tier 1 Gemini Nano Session with Graph-Aware Unix tools capability
  if (enginePreference === 'auto' || enginePreference === 'gemini-nano-only') {
    nanoReady = await ensureNanoSession(repoIdentifier, graphSummary, routerScopeNote, onProgress);
  }

  // 3. Warm up Tier 2 Snowflake Arctic Embed XS
  if (enginePreference === 'auto' || enginePreference === 'arctic-embed-xs-only') {
    arcticReady = await ensureArcticPipeline(files, repoIndex, onProgress);
  }

  if (onProgress) onProgress('Local AI router ready!', 100);
  return { nanoReady, arcticReady, qwenReady, totalFiles: files.length };
}

export async function routeNextJsContext(
  userQuery: string,
  files: SourceFile[],
  repoIdentifier: string,
  enginePreference: RouterEngineType = 'auto',
  maxExtraFiles: number = 6,
  onProgress?: (statusText: string, progressPercent?: number) => void,
  localContextTokens: number = DEFAULT_LOCAL_CONTEXT_TOKENS
): Promise<RoutingResult> {
  const startTime = performance.now();
  const repoIndex = buildNextJsRepoIndex(files);
  const codeGraph = buildNextJsCodeGraph(files);
  const graphSummary = serializeCodeGraphForPrompt(codeGraph);
  const detectedFramework = detectRepositoryFramework(files);
  const routerScopeNote = frameworkRouterNote(detectedFramework);
  const allPaths = files.map((f) => f.path);
  const toolTraces: RouterToolTrace[] = [];

  if (!isNanoRepoKey(repoIdentifier) || (!getNanoSession() && getCachedFileEmbeddings().length === 0 && !getMlcEngine())) {
    await warmUpLocalContextRouter(files, repoIdentifier, enginePreference, onProgress);
  }

  // ==========================================
  // TIER 0: MLC GENERATION JUDGE (if a generation engine is selected)
  // ==========================================
  if (isLocalGenerationEngine(enginePreference)) {
    const qwenResult = await runQwenToolLoop({
      files,
      repoIndex,
      codeGraph,
      graphSummary,
      routerScopeNote,
      userQuery,
      detectedFramework,
      enginePreference,
      repoIdentifier,
      maxExtraFiles,
      startTime,
      toolTraces,
      onProgress,
      localContextTokens: validateLocalContextTokens(localContextTokens),
    });
    if (qwenResult) return qwenResult;
  }

  // ==========================================
  // TIER 1: CHROME GEMINI NANO WITH MULTI-STEP UNIX TOOL LOOP (Max 3 Steps)
  // ==========================================
  if (enginePreference !== 'arctic-embed-xs-only') {
    const nanoResult = await runNanoToolLoop({
      files,
      repoIndex,
      codeGraph,
      userQuery,
      detectedFramework,
      maxExtraFiles,
      startTime,
      toolTraces,
    });
    if (nanoResult) return nanoResult;
  }

  // ==========================================
  // TIER 2: SNOWFLAKE ARCTIC-EMBED-XS AUGMENTED WITH UNIX & CODE GRAPH TRACE
  // ==========================================
  if (enginePreference !== 'gemini-nano-only' && (getCachedFileEmbeddings().length > 0 || getEmbeddingPipeline())) {
    const arcticResult = await runArcticTier({
      files,
      repoIndex,
      codeGraph,
      userQuery,
      detectedFramework,
      maxExtraFiles,
      startTime,
      toolTraces,
    });
    if (arcticResult) return arcticResult;
  }

  // ==========================================
  // TIER 3: FALLBACK KEYWORD & GRAPH-AWARE ROUTER
  // ==========================================
  const relatedRes = findRelatedSymbols({ query: userQuery }, files, repoIndex, codeGraph);
  const unixMatchedPaths = new Set<string>(relatedRes.relatedPaths);
  const fallbackStart = performance.now();
  const fallbackDuration = Math.round(performance.now() - fallbackStart);

  toolTraces.push({
    id: `trace-fallback-${Date.now()}`,
    tool: 'find',
    args: { query: userQuery },
    outputSummary: `Graph fallback matched ${unixMatchedPaths.size} paths`,
    durationMs: fallbackDuration,
    timestamp: Date.now(),
  });

  const q = userQuery.toLowerCase();
  const scored = allPaths.map((path) => {
    let score = 0;
    const p = path.toLowerCase();
    if (unixMatchedPaths.has(path)) score += 12;
    const terms = q.split(/\s+/);
    for (const term of terms) {
      if (term.length > 2 && p.includes(term)) score += 2;
    }
    if (q.includes('api') && p.includes('route.ts')) score += 5;
    if (q.includes('layout') && p.includes('layout.tsx')) score += 5;
    if (q.includes('page') && p.includes('page.tsx')) score += 4;
    // Hono controller structures: routers, middleware, RPC & validators
    if ((q.includes('hono') || q.includes('endpoint') || q.includes('middleware') || q.includes('rpc') || q.includes('validator')) && (p.includes('routes/') || p.includes('middleware') || p.includes('src/index') || p.includes('app.ts') || p.includes('wrangler'))) score += 5;
    if ((q.includes('api') || q.includes('route')) && (p.includes('routes/') || p.includes('src/index'))) score += 4;
    // Vite SPA entry points: config, HTML mount point, and main/App modules
    if (detectedFramework === 'vite' && (p.includes('vite.config') || p.includes('index.html') || p.includes('src/main') || p.includes('src/app'))) score += 5;
    if ((q.includes('vite') || q.includes('entry') || q.includes('frontend') || q.includes('spa')) && (p.includes('vite.config') || p.includes('index.html') || p.includes('src/main') || p.includes('src/app'))) score += 4;
    return { path, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topFallback = scored.slice(0, 5).map((s) => s.path);
  const expanded = expandWithNextJsImportClosure(topFallback, repoIndex, maxExtraFiles);
  const latencyMs = Math.round(performance.now() - startTime);

  return {
    selectedPaths: expanded.length > 0 ? expanded : topFallback,
    engineUsed: 'Fallback Keyword',
    latencyMs,
    toolTraces,
  };
}

function parseJsonArray(rawText: string): unknown {
  const stripped = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeAnchorPath(raw: string): string {
  return raw.replace(/^@\[\//, '').replace(/\]$/, '').replace(/^\//, '').trim();
}

function groundCandidates(
  raw: unknown,
  engineLabel: string,
  validPaths: string[],
  relatedPaths: string[]
): SuggestedDirective[] {
  const arr = Array.isArray(raw) ? raw : [];
  const fallbackAnchors = relatedPaths.length > 0 ? relatedPaths.slice(0, 3) : validPaths.slice(0, 3);
  const mapped = arr.slice(0, 4).map((item, i) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    const rawAnchors = Array.isArray(obj.anchorPaths) ? (obj.anchorPaths as unknown[]) : [];
    const cleanedAnchors = rawAnchors
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      .map((a) => normalizeAnchorPath(a))
      .filter((p) => validPaths.includes(p))
      .slice(0, 3);
    return {
      id: typeof obj.id === 'string' && obj.id.length > 0 ? obj.id.slice(0, 64) : `gen-${Date.now()}-${i}`,
      title: typeof obj.title === 'string' ? obj.title : '',
      prompt: typeof obj.prompt === 'string' ? obj.prompt : '',
      rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
      anchorPaths: cleanedAnchors.length > 0 ? cleanedAnchors : fallbackAnchors.slice(0, 3),
      engine: engineLabel,
    };
  });
  return mapped;
}

function hashNonce(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Local-only suggestion generation. No auth header required (no server call,
// no fetch to /api/compile — fully offline/PWA-safe). Never throws to caller:
// every failure degrades to deterministic graph-derived fallback.
export async function generateSuggestedDirectives(
  userSeed: string,
  files: SourceFile[],
  repoIdentifier: string,
  enginePreference: RouterEngineType = 'auto'
): Promise<{ directives: SuggestedDirective[]; engineUsed: string; latencyMs: number }> {
  const startTime = performance.now();
  const fallbackFor = (reason: string) => {
    const relatedFallback = files.slice(0, 6).map((f) => f.path);
    const built = buildFallbackDirectives(repoIdentifier || 'repo', relatedFallback);
    const nonce = `${Date.now()}-${Math.random()}-${userSeed}`;
    const seed = hashNonce(nonce);
    const shuffled = [...built];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (seed + i * 7919) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return {
      directives: shuffled.slice(0, 4),
      engineUsed: reason,
      latencyMs: Math.round(performance.now() - startTime),
    };
  };

  try {
    const repoIndex = buildNextJsRepoIndex(files);
    const codeGraph = buildNextJsCodeGraph(files);
    const graphSummary = serializeCodeGraphForPrompt(codeGraph).slice(0, 2500);
    const compactSummary = summarizeGraphForDirectives(codeGraph);
    const roles = countRolesForDirectives(repoIndex);
    const related = findRelatedSymbols({ query: userSeed || 'architectural refactor' }, files, repoIndex, codeGraph);
    const validPaths = repoIndex.map((c) => c.path);
    const relatedPaths = related.relatedPaths.length > 0
      ? related.relatedPaths.slice(0, 6)
      : validPaths.slice(0, 6);
    const roleLine = Object.entries(roles).map(([k, v]) => `${k}:${v}`).join(', ') || 'none';
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}-${userSeed}`;
    const anchorHint = relatedPaths.slice(0, 6).map((p) => `@[/${p}]`).join(', ') || '@/path/to/file.ext';

    const systemPrompt = `You are a senior software architect. Produce EXACTLY 4 fresh Suggested Architectural Directives grounded in this repo (nonce ${nonce} at ${new Date().toISOString()} — vary wording and order every call).\nRepo: ${repoIdentifier} (${files.length} files; roles ${roleLine}).\nGraph: ${compactSummary}\n${graphSummary}\nRelated: ${anchorHint}\nReturn STRICT JSON array of 4 objects with keys title (8-90 chars), prompt (20-500 chars, exact chat input), rationale (<=280 chars), anchorPaths (1-3 REAL paths from: ${validPaths.slice(0, 20).join(', ')}). No markdown fences, no extra keys.`;

    const allowsQwen =
      enginePreference === 'auto' || isLocalGenerationEngine(enginePreference);
    const allowsNano = enginePreference === 'auto' || enginePreference === 'gemini-nano-only';
    const allowsArctic = enginePreference === 'auto' || enginePreference === 'arctic-embed-xs-only';

    // Attempt A: Tier 0 Qwen Coder MLC
    const mlcEngine = getMlcEngine();
    if (allowsQwen && mlcEngine) {
      try {
        const reply = await mlcEngine.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Seed "${userSeed}" — emit 4 directives as STRICT JSON array.` },
          ],
          temperature: 0.9,
          response_format: { type: 'json_object' },
        });
        const responseText = reply.choices?.[0]?.message?.content || '[]';
        const parsed = parseJsonArray(responseText);
        const candidates = groundCandidates(parsed, engineLabelForModelId(getMlcEngineModelId()), validPaths, relatedPaths);
        const checked = sanitizeDirectives(candidates, relatedPaths);
        if (!checked.isFallback && checked.directives.length > 0) {
          const list = checked.directives.slice(0, 4);
          while (list.length < 4) {
            const extra = buildFallbackDirectives(repoIdentifier, relatedPaths);
            for (const d of extra) {
              if (list.length >= 4) break;
              if (!list.some((e) => e.prompt.toLowerCase() === d.prompt.toLowerCase())) list.push(d);
              else break;
            }
            break;
          }
          return { directives: list.slice(0, 4), engineUsed: checked.directives[0]?.engine || 'Qwen2.5-Coder-0.5B', latencyMs: Math.round(performance.now() - startTime) };
        }
      } catch (err) {
        console.warn('Qwen directive generation failed, trying Nano:', err);
      }
    }

    // Attempt B: Tier 1 Gemini Nano Unix tool loop session (cloned)
    const cachedBaseSession = getNanoSession();
    if (allowsNano && cachedBaseSession && typeof window !== 'undefined' && (window.LanguageModel || window.ai?.languageModel)) {
      let clone: any = null;
      try {
        clone = await cachedBaseSession.clone();
        const nanoPrompt = `${systemPrompt}\n\nSeed "${userSeed}" — be diverse and concrete. Emit 4 directives as STRICT JSON array.`;
        const responseText: string = await clone.prompt(nanoPrompt);
        const parsed = parseJsonArray(responseText);
        const candidates = groundCandidates(parsed, 'Gemini Nano', validPaths, relatedPaths);
        const checked = sanitizeDirectives(candidates, relatedPaths);
        if (!checked.isFallback && checked.directives.length > 0) {
          const list = checked.directives.slice(0, 4);
          return { directives: list, engineUsed: 'Gemini Nano', latencyMs: Math.round(performance.now() - startTime) };
        }
      } catch (err) {
        console.warn('Nano directive generation failed, trying Arctic:', err);
      } finally {
        if (clone && typeof clone.destroy === 'function') {
          try { clone.destroy(); } catch { /* ignore */ }
        }
      }
    }

    // Attempt C: Tier 2 Arctic-Embed-XS templated grounding
    const embeddingPipeline = getEmbeddingPipeline();
    const cachedFileEmbeddings = getCachedFileEmbeddings();
    if (allowsArctic && embeddingPipeline && cachedFileEmbeddings.length > 0) {
      try {
        const queryText = `Represent this sentence for searching relevant passages: ${userSeed} architectural refactor validation hardening`;
        const queryOutput = await embeddingPipeline(queryText, { pooling: 'mean', normalize: true });
        const queryVector = new Float32Array(queryOutput.data);
        const scored = cachedFileEmbeddings.map((item) => ({ path: item.path, score: cosineSimilarity(queryVector, item.vector) }));
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, 6).map((s) => s.path);
        const pick = (i: number) => top[i % Math.max(1, top.length)] ?? relatedPaths[0] ?? validPaths[0] ?? 'app/page.tsx';
        const routePath = codeGraph.routeMap.routeHandlers[0]?.path ?? pick(0);
        const pagePath = codeGraph.routeMap.pages[0]?.path ?? pick(1);
        const utilPath = repoIndex.find((c) => c.role === 'types' || c.role === 'util')?.path ?? pick(2);
        const graphPath = pick(3);
        const templates: SuggestedDirective[] = [
          {
            id: `arctic-${Date.now()}-0`,
            title: `Harden route handlers in ${routePath}`.slice(0, 90),
            prompt: `Add strict Zod validation and typed JSON error contracts to route handlers in @[/${routePath}], grounding every change with @[/${pick(0)}] anchors.`,
            rationale: 'Graph-grounded route-handler hardening from Arctic ranking.',
            anchorPaths: [routePath, pick(0)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
            engine: 'Arctic-Embed-XS',
          },
          {
            id: `arctic-${Date.now()}-1`,
            title: `Fix Server/Client boundary in ${pagePath}`.slice(0, 90),
            prompt: `Audit Server vs Client boundaries around @[/${pagePath}], moving client hooks out of Server Components with @[/${pick(1)}] citations.`,
            rationale: 'Render-graph boundary fix from top Arctic paths.',
            engine: 'Arctic-Embed-XS',
            anchorPaths: [pagePath, pick(1)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
          },
          {
            id: `arctic-${Date.now()}-2`,
            title: `Close Zod validation gaps via ${utilPath}`.slice(0, 90),
            prompt: `Introduce Zod-first schemas in @[/${utilPath}] validating every handler input before UI wiring, citing @[/${pick(2)}].`,
            rationale: 'Validator-first gap closure from indexed roles.',
            anchorPaths: [utilPath, pick(2)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
            engine: 'Arctic-Embed-XS',
          },
          {
            id: `arctic-${Date.now()}-3`,
            title: `Clean import closure around ${graphPath}`.slice(0, 90),
            prompt: `Prune dead imports and tighten the import closure around @[/${graphPath}] using the code-graph, anchored at @[/${pick(0)}].`,
            rationale: 'Import-closure cleanup from call-graph symbols.',
            anchorPaths: [graphPath, pick(0)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
            engine: 'Arctic-Embed-XS',
          },
        ];
        const checked = sanitizeDirectives(templates, relatedPaths);
        if (!checked.isFallback && checked.directives.length > 0) {
          return { directives: checked.directives.slice(0, 4), engineUsed: 'Arctic-Embed-XS', latencyMs: Math.round(performance.now() - startTime) };
        }
      } catch (err) {
        console.warn('Arctic directive templating failed, using fallback:', err);
      }
    }

    // Attempt D: Tier 3 deterministic fallback
    return fallbackFor('Fallback Keyword');
  } catch (err) {
    console.warn('Directive generation failed, using fallback:', err);
    return fallbackFor('Fallback Keyword');
  }
}
