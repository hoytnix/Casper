import { SourceFile, RouterToolTrace, RoutingResult, RouterEngineType } from '@/types';
import { NextJsFileCard, buildNextJsRepoIndex, expandWithNextJsImportClosure } from './nextjs-indexer';
import { buildNextJsCodeGraph, serializeCodeGraphForPrompt } from './nextjs-code-graph';
import {
  findFiles,
  grepFiles,
  readLines,
  inspectGraph,
  traceCallGraph,
  getNextJsRouteMap,
  findRelatedSymbols,
  extractQueryTokensForUnix,
} from './unix-vfs-tools';
import { CreateMLCEngine } from '@mlc-ai/web-llm';

// Extend Window interface for Chrome built-in AI / LanguageModel API
declare global {
  interface Window {
    LanguageModel?: {
      availability: () => Promise<'available' | 'readily' | 'no' | 'after-download'>;
      create: (options?: {
        initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        monitor?: (m: { addEventListener: (event: string, cb: (e: any) => void) => void }) => void;
      }) => Promise<any>;
    };
    ai?: {
      languageModel?: {
        availability: () => Promise<string>;
        create: (options?: any) => Promise<any>;
      };
    };
  }
}

let cachedBaseSession: any = null;
let cachedRepoKey: string = '';
let embeddingPipeline: any = null;
let isPipelineLoading = false;
let pipelineLoadError: string | null = null;
let cachedFileEmbeddings: { path: string; vector: Float32Array; skeleton: string }[] = [];

let mlcEngine: any = null;
let mlcEngineLoading = false;
let mlcEngineModelId = '';

export async function checkGeminiNanoAvailability(): Promise<'available' | 'readily' | 'downloadable' | 'unsupported'> {
  if (typeof window === 'undefined') return 'unsupported';
  const lm = window.LanguageModel || window.ai?.languageModel;
  if (!lm || typeof lm.availability !== 'function') return 'unsupported';

  try {
    const status = await lm.availability();
    if (status === 'available' || status === 'readily') return 'available';
    if (status === 'after-download' || status === 'downloadable') return 'downloadable';
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

export async function warmUpLocalContextRouter(
  files: SourceFile[],
  repoIdentifier: string,
  enginePreference: RouterEngineType = 'auto'
): Promise<{ nanoReady: boolean; arcticReady: boolean; qwenReady: boolean; totalFiles: number }> {
  const repoIndex = buildNextJsRepoIndex(files);
  const codeGraph = buildNextJsCodeGraph(files);
  const graphSummary = serializeCodeGraphForPrompt(codeGraph);

  let nanoReady = false;
  let arcticReady = false;
  let qwenReady = false;

  // 1. Warm up Qwen-Coder MLC if explicitly selected
  if (enginePreference === 'qwen-0.5b-coder-mlc' || enginePreference === 'qwen-1.5b-coder-mlc') {
    const targetModel = enginePreference === 'qwen-1.5b-coder-mlc'
      ? 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC'
      : 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC';
    try {
      if (!mlcEngine || mlcEngineModelId !== targetModel) {
        mlcEngineLoading = true;
        mlcEngine = await CreateMLCEngine(targetModel, {
          initProgressCallback: (progress) => {
            console.log('MLC Init Progress:', progress.text);
          }
        });
        mlcEngineModelId = targetModel;
      }
      qwenReady = true;
    } catch (err) {
      console.warn('MLC engine warmup failed:', err);
    }
    mlcEngineLoading = false;
  }

  // 2. Warm up Tier 1 Gemini Nano Session with Graph-Aware Unix tools capability
  if (enginePreference === 'auto' || enginePreference === 'gemini-nano-only') {
    const avail = await checkGeminiNanoAvailability();
    if (avail === 'available' || avail === 'downloadable') {
      try {
        const lm = window.LanguageModel || window.ai?.languageModel;
        if (lm && typeof lm.create === 'function') {
          const systemPrompt = `You are an expert Next.js Function-Level Graph & Unix Agent Context Router. Your task is to investigate the repository using Unix & Code Graph tools (grep, find, head_tail, inspect_graph, trace_call_graph, get_route_map, find_related_symbols) to select the exact relevant Next.js source file paths.
Available Unix Tools:
1. {"tool": "grep", "args": {"pattern": "...", "pathPrefix": "..."}}
2. {"tool": "find", "args": {"pattern": "...", "directory": "...", "role": "app-page"}}
3. {"tool": "head_tail", "args": {"path": "...", "startLine": 1, "endLine": 35}}
4. {"tool": "inspect_graph", "args": {"path": "..."}}
5. {"tool": "trace_call_graph", "args": {"symbol": "..."}}
6. {"tool": "get_route_map", "args": {}}
7. {"tool": "find_related_symbols", "args": {"query": "..."}}
8. {"tool": "finish", "args": {"selectedFiles": ["..."], "reasoning": "..."}}

Output STRICT JSON on every turn adhering to schema:
{
  "action": "tool" | "finish",
  "tool": "grep" | "find" | "head_tail" | "inspect_graph" | "trace_call_graph" | "get_route_map" | "find_related_symbols" | "finish",
  "args": { ... },
  "selectedFiles": ["..."],
  "reasoning": "..."
}

=== CODE GRAPH SUMMARY ===
${graphSummary.slice(0, 3500)}
=== END GRAPH ===`;

          cachedBaseSession = await lm.create({
            initialPrompts: [{ role: 'system', content: systemPrompt }],
          });
          cachedRepoKey = repoIdentifier;
          nanoReady = true;
        }
      } catch (err) {
        console.warn('Gemini Nano session creation failed:', err);
      }
    }
  }

  // 3. Warm up Tier 2 Snowflake Arctic Embed XS
  if (enginePreference === 'auto' || enginePreference === 'arctic-embed-xs-only') {
    try {
      if (!embeddingPipeline && !isPipelineLoading) {
        isPipelineLoading = true;
        const { pipeline, env } = await import('@huggingface/transformers');
        env.allowLocalModels = false;
        env.useBrowserCache = true;

        embeddingPipeline = await pipeline('feature-extraction', 'Snowflake/snowflake-arctic-embed-xs', {
          dtype: 'fp32',
        });
        isPipelineLoading = false;
      }

      if (embeddingPipeline) {
        cachedFileEmbeddings = [];
        for (const card of repoIndex) {
          const output = await embeddingPipeline(card.skeletonLine, {
            pooling: 'mean',
            normalize: true,
          });
          const vector = new Float32Array(output.data);
          cachedFileEmbeddings.push({ path: card.path, vector, skeleton: card.skeletonLine });
        }
        arcticReady = true;
      }
    } catch (err) {
      console.warn('Arctic embed pipeline failed to load:', err);
      pipelineLoadError = err instanceof Error ? err.message : String(err);
      isPipelineLoading = false;
    }
  }

  return { nanoReady, arcticReady, qwenReady, totalFiles: files.length };
}

export async function routeNextJsContext(
  userQuery: string,
  files: SourceFile[],
  repoIdentifier: string,
  enginePreference: RouterEngineType = 'auto',
  maxExtraFiles: number = 6
): Promise<RoutingResult> {
  const startTime = performance.now();
  const repoIndex = buildNextJsRepoIndex(files);
  const codeGraph = buildNextJsCodeGraph(files);
  const graphSummary = serializeCodeGraphForPrompt(codeGraph);
  const allPaths = files.map((f) => f.path);
  const toolTraces: RouterToolTrace[] = [];

  if (cachedRepoKey !== repoIdentifier || (!cachedBaseSession && cachedFileEmbeddings.length === 0 && !mlcEngine)) {
    await warmUpLocalContextRouter(files, repoIdentifier, enginePreference);
  }

  // ==========================================
  // TIER 0: QWEN CODER MLC ROUTER (If requested)
  // ==========================================
  if ((enginePreference === 'qwen-0.5b-coder-mlc' || enginePreference === 'qwen-1.5b-coder-mlc')) {
    if (!mlcEngine && !mlcEngineLoading) {
      await warmUpLocalContextRouter(files, repoIdentifier, enginePreference);
    }
    if (mlcEngine) {
      try {
        const systemPrompt = `You are an expert Next.js Function-Level Graph & Unix Agent Context Router. Your task is to investigate the repository using Unix & Code Graph tools (grep, find, head_tail, inspect_graph, trace_call_graph, get_route_map, find_related_symbols) to select the exact relevant Next.js source file paths.
Available Unix Tools:
1. {"tool": "grep", "args": {"pattern": "...", "pathPrefix": "..."}}
2. {"tool": "find", "args": {"pattern": "...", "directory": "...", "role": "app-page"}}
3. {"tool": "head_tail", "args": {"path": "...", "startLine": 1, "endLine": 35}}
4. {"tool": "inspect_graph", "args": {"path": "..."}}
5. {"tool": "trace_call_graph", "args": {"symbol": "..."}}
6. {"tool": "get_route_map", "args": {}}
7. {"tool": "find_related_symbols", "args": {"query": "..."}}
8. {"tool": "finish", "args": {"selectedFiles": ["..."], "reasoning": "..."}}

Output STRICT JSON on every turn adhering to schema:
{
  "action": "tool" | "finish",
  "tool": "grep" | "find" | "head_tail" | "inspect_graph" | "trace_call_graph" | "get_route_map" | "find_related_symbols" | "finish",
  "args": { ... },
  "selectedFiles": ["..."],
  "reasoning": "..."
}

=== CODE GRAPH SUMMARY ===
${graphSummary.slice(0, 4000)}
=== END GRAPH ===`;

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User Architectural Query: "${userQuery}"\nExecute first Unix tool call or finish.` }
        ];

        let selectedFiles: string[] = [];
        let maxSteps = 3;

        for (let step = 1; step <= maxSteps; step++) {
          const toolStartTime = performance.now();
          const reply = await mlcEngine.chat.completions.create({
            messages,
            temperature: 0.1,
            response_format: { type: 'json_object' }
          });
          const responseText = reply.choices[0].message.content || '{}';
          const toolDuration = Math.round(performance.now() - toolStartTime);

          let parsed: any;
          try {
            parsed = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
          } catch {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsed = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('Invalid JSON from Qwen Coder MLC');
            }
          }

          messages.push({ role: 'assistant', content: responseText });

          if (parsed && Array.isArray(parsed.selectedFiles) && parsed.selectedFiles.length > 0) {
            selectedFiles = parsed.selectedFiles.map((p: string) => p.replace(/^\//, ''));
          }

          if (parsed.action === 'finish' || !parsed.tool || parsed.tool === 'finish') {
            break;
          }

          let toolOutput = '';
          const args = parsed.args || {};
          const toolName = parsed.tool;

          if (toolName === 'grep') {
            const res = grepFiles(args, files);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-qwen-${Date.now()}-${step}`,
              tool: 'grep',
              args,
              outputSummary: `Matched ${res.count} lines`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'find') {
            const res = findFiles(args, files, repoIndex);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-qwen-${Date.now()}-${step}`,
              tool: 'find',
              args,
              outputSummary: `Found ${res.count} files`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'head_tail') {
            const res = readLines(args, files);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-qwen-${Date.now()}-${step}`,
              tool: 'head_tail',
              args,
              outputSummary: `Read lines from ${args.path}`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'inspect_graph') {
            const res = inspectGraph(args, files, repoIndex);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-qwen-${Date.now()}-${step}`,
              tool: 'inspect_graph',
              args,
              outputSummary: `Inspected graph for ${args.path}`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'trace_call_graph') {
            const res = traceCallGraph(args, files, repoIndex, codeGraph);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-qwen-${Date.now()}-${step}`,
              tool: 'inspect_graph',
              args,
              outputSummary: `Traced call graph for ${args.symbol}`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'get_route_map') {
            const res = getNextJsRouteMap(files, codeGraph);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-qwen-${Date.now()}-${step}`,
              tool: 'inspect_graph',
              args,
              outputSummary: `Retrieved Next.js route map`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'find_related_symbols') {
            const res = findRelatedSymbols(args, files, repoIndex, codeGraph);
            toolOutput = res.summary;
            res.relatedPaths.forEach((p) => selectedFiles.push(p));
            toolTraces.push({
              id: `trace-qwen-${Date.now()}-${step}`,
              tool: 'find',
              args,
              outputSummary: `Found related symbols for ${args.query}`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else {
            toolOutput = `Unknown tool: ${toolName}`;
          }

          messages.push({
            role: 'user',
            content: `Tool Output (${toolName}):\n${toolOutput}\n\nContinue investigation or finish.`
          });
        }

        if (selectedFiles.length > 0) {
          const expanded = expandWithNextJsImportClosure(selectedFiles, repoIndex, maxExtraFiles);
          const latencyMs = Math.round(performance.now() - startTime);
          return {
            selectedPaths: expanded.length > 0 ? expanded : selectedFiles,
            engineUsed: mlcEngineModelId.includes('1.5B') ? 'Qwen2.5-Coder-1.5B' : 'Qwen2.5-Coder-0.5B',
            latencyMs,
            toolTraces,
          };
        }
      } catch (err) {
        console.warn('Qwen Coder MLC routing failed:', err);
      }
    }
  }

  // ==========================================
  // TIER 1: CHROME GEMINI NANO WITH MULTI-STEP UNIX TOOL LOOP (Max 3 Steps)
  // ==========================================
  if (enginePreference !== 'arctic-embed-xs-only' && cachedBaseSession && (window.LanguageModel || window.ai?.languageModel)) {
    try {
      const clone = await cachedBaseSession.clone();
      try {
        let currentPrompt = `User Architectural Query: "${userQuery}"\nExecute the first Unix tool call or finish with selected files.`;
        let selectedFiles: string[] = [];
        let maxSteps = 3;

        for (let step = 1; step <= maxSteps; step++) {
          const toolStartTime = performance.now();
          const responseText = await clone.prompt(currentPrompt);
          const toolDuration = Math.round(performance.now() - toolStartTime);

          let parsed: any;
          try {
            parsed = JSON.parse(
              responseText.replace(/```json/g, '').replace(/```/g, '').trim()
            );
          } catch {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsed = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('Invalid JSON response from Gemini Nano tool loop');
            }
          }

          if (parsed && Array.isArray(parsed.selectedFiles) && parsed.selectedFiles.length > 0) {
            selectedFiles = parsed.selectedFiles.map((p: string) => p.replace(/^\//, ''));
          }

          if (parsed.action === 'finish' || !parsed.tool || parsed.tool === 'finish') {
            break;
          }

          let toolOutput = '';
          const args = parsed.args || {};
          const toolName = parsed.tool;

          if (toolName === 'grep') {
            const res = grepFiles(args, files);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-${Date.now()}-${step}`,
              tool: 'grep',
              args,
              outputSummary: `Matched ${res.count} lines`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'find') {
            const res = findFiles(args, files, repoIndex);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-${Date.now()}-${step}`,
              tool: 'find',
              args,
              outputSummary: `Found ${res.count} files`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'head_tail') {
            const res = readLines(args, files);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-${Date.now()}-${step}`,
              tool: 'head_tail',
              args,
              outputSummary: `Read lines from ${args.path}`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'inspect_graph') {
            const res = inspectGraph(args, files, repoIndex);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-${Date.now()}-${step}`,
              tool: 'inspect_graph',
              args,
              outputSummary: `Inspected graph for ${args.path}`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'trace_call_graph') {
            const res = traceCallGraph(args, files, repoIndex, codeGraph);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-${Date.now()}-${step}`,
              tool: 'inspect_graph',
              args,
              outputSummary: `Traced call graph for ${args.symbol}`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'get_route_map') {
            const res = getNextJsRouteMap(files, codeGraph);
            toolOutput = res.summary;
            toolTraces.push({
              id: `trace-${Date.now()}-${step}`,
              tool: 'inspect_graph',
              args,
              outputSummary: `Retrieved Next.js route map`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else if (toolName === 'find_related_symbols') {
            const res = findRelatedSymbols(args, files, repoIndex, codeGraph);
            toolOutput = res.summary;
            res.relatedPaths.forEach((p) => selectedFiles.push(p));
            toolTraces.push({
              id: `trace-${Date.now()}-${step}`,
              tool: 'find',
              args,
              outputSummary: `Found related symbols for ${args.query}`,
              durationMs: toolDuration,
              timestamp: Date.now(),
            });
          } else {
            toolOutput = `Unknown tool: ${toolName}`;
          }

          currentPrompt = `Tool Output (${toolName}):\n${toolOutput}\n\nContinue investigation or output action: "finish" with selectedFiles.`;
        }

        if (selectedFiles.length > 0) {
          const expanded = expandWithNextJsImportClosure(selectedFiles, repoIndex, maxExtraFiles);
          const latencyMs = Math.round(performance.now() - startTime);
          return {
            selectedPaths: expanded.length > 0 ? expanded : selectedFiles,
            engineUsed: 'Gemini Nano',
            latencyMs,
            toolTraces,
          };
        }
      } finally {
        if (typeof clone.destroy === 'function') {
          clone.destroy();
        }
      }
    } catch (err) {
      console.warn('Gemini Nano Unix tool loop failed, falling back to Arctic Embed XS:', err);
    }
  }

  // ==========================================
  // TIER 2: SNOWFLAKE ARCTIC-EMBED-XS AUGMENTED WITH UNIX & CODE GRAPH TRACE
  // ==========================================
  if (enginePreference !== 'gemini-nano-only' && (cachedFileEmbeddings.length > 0 || embeddingPipeline)) {
    try {
      const tokens = extractQueryTokensForUnix(userQuery);
      const unixMatchedPaths = new Set<string>();

      const preGrepStart = performance.now();
      const relatedRes = findRelatedSymbols({ query: userQuery }, files, repoIndex, codeGraph);
      relatedRes.relatedPaths.forEach((p) => unixMatchedPaths.add(p));

      for (const comp of tokens.pascalComponents.slice(0, 3)) {
        const trace = traceCallGraph({ symbol: comp }, files, repoIndex, codeGraph);
        trace.trace.oneHop.forEach((h) => {
          for (const [fpath, syms] of Object.entries(codeGraph.fileToSymbols)) {
            if (syms.some((s) => s.includes(h))) unixMatchedPaths.add(fpath);
          }
        });
      }

      const preGrepDuration = Math.round(performance.now() - preGrepStart);

      toolTraces.push({
        id: `trace-arctic-pregrep-${Date.now()}`,
        tool: 'find',
        args: { query: userQuery, relatedSymbols: relatedRes.relatedSymbols },
        outputSummary: `Graph-aware pre-search identified ${unixMatchedPaths.size} exact match candidates`,
        durationMs: preGrepDuration,
        timestamp: Date.now(),
      });

      if (embeddingPipeline && cachedFileEmbeddings.length > 0) {
        const queryText = `Represent this sentence for searching relevant passages: ${userQuery}`;
        const queryOutput = await embeddingPipeline(queryText, {
          pooling: 'mean',
          normalize: true,
        });
        const queryVector = new Float32Array(queryOutput.data);

        const scored = cachedFileEmbeddings.map((item) => {
          let score = cosineSimilarity(queryVector, item.vector);
          const p = item.path.toLowerCase();
          const q = userQuery.toLowerCase();

          if (unixMatchedPaths.has(item.path)) {
            score += 0.6;
          }

          if (q.includes('api') && p.includes('route.ts')) score += 0.35;
          if ((q.includes('action') || q.includes('mutate')) && (p.includes('action') || p.includes('server'))) score += 0.3;
          if ((q.includes('layout') || q.includes('root')) && p.includes('layout')) score += 0.3;
          if ((q.includes('page') || q.includes('home')) && p.includes('page')) score += 0.25;
          if (q.includes('hook') && p.includes('hook')) score += 0.3;

          return { path: item.path, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const topRaw = Array.from(new Set([...Array.from(unixMatchedPaths), ...scored.slice(0, 4).map((s) => s.path)]));
        const expanded = expandWithNextJsImportClosure(topRaw, repoIndex, maxExtraFiles);
        const latencyMs = Math.round(performance.now() - startTime);

        return {
          selectedPaths: expanded.length > 0 ? expanded : topRaw,
          engineUsed: 'Arctic-Embed-XS',
          latencyMs,
          scores: Object.fromEntries(scored.slice(0, 8).map((s) => [s.path, Number(s.score.toFixed(3))])),
          toolTraces,
        };
      }
    } catch (err) {
      console.warn('Arctic embed XS vector search failed, falling back to keyword heuristic:', err);
    }
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

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
