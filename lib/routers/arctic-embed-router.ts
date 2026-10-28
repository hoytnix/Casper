import type { RoutingResult, RouterToolTrace, SourceFile } from '@/types';
import type { NextJsFileCard } from '../nextjs-indexer';
import type { NextJsCodeGraph } from '../nextjs-code-graph';
import { expandWithNextJsImportClosure } from '../nextjs-indexer';
import {
  findRelatedSymbols,
  traceCallGraph,
  extractQueryTokensForUnix,
} from '../unix-vfs-tools';

let embeddingPipeline: any = null;
let isPipelineLoading = false;
let pipelineLoadError: string | null = null;
let cachedFileEmbeddings: { path: string; vector: Float32Array; skeleton: string }[] = [];

export function getEmbeddingPipeline(): any {
  return embeddingPipeline;
}

export function getCachedFileEmbeddings(): { path: string; vector: Float32Array; skeleton: string }[] {
  return cachedFileEmbeddings;
}

export function getPipelineLoadError(): string | null {
  return pipelineLoadError;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
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

// Tier 2 warmup: loads the Arctic-Embed-XS pipeline and embeds every
// indexed file skeleton. Resolves true when embeddings are usable.
export async function ensureArcticPipeline(
  files: SourceFile[],
  repoIndex: NextJsFileCard[],
  onProgress?: (statusText: string, progressPercent?: number) => void
): Promise<boolean> {
  try {
    if (!embeddingPipeline && !isPipelineLoading) {
      isPipelineLoading = true;
      if (onProgress) onProgress('Importing transformers.js library...', 45);
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      if (onProgress) onProgress('Downloading Snowflake Arctic Embed XS model weights...', 55);
      embeddingPipeline = await pipeline('feature-extraction', 'Snowflake/snowflake-arctic-embed-xs', {
        dtype: 'fp32',
        progress_callback: (progress: any) => {
          if (onProgress && progress) {
            const p = progress.progress || (progress.loaded && progress.total ? Math.round((progress.loaded / progress.total) * 100) : undefined);
            onProgress(progress.status || 'Downloading embedding weights...', p);
          }
        }
      });
      isPipelineLoading = false;
    }

    if (embeddingPipeline && files.length > 0) {
      cachedFileEmbeddings = [];
      let idx = 0;
      for (const card of repoIndex) {
        if (onProgress) {
          const pct = Math.round(65 + (idx / repoIndex.length) * 35);
          onProgress(`Embedding file (${idx + 1}/${repoIndex.length}): ${card.path}`, pct);
        }
        const output = await embeddingPipeline(card.skeletonLine, {
          pooling: 'mean',
          normalize: true,
        });
        const vector = new Float32Array(output.data);
        cachedFileEmbeddings.push({ path: card.path, vector, skeleton: card.skeletonLine });
        idx++;
      }
      return true;
    }
    return true;
  } catch (err) {
    console.warn('Arctic embed pipeline failed to load:', err);
    pipelineLoadError = err instanceof Error ? err.message : String(err);
    isPipelineLoading = false;
    return false;
  }
}

export interface ArcticTierInput {
  files: SourceFile[];
  repoIndex: NextJsFileCard[];
  codeGraph: NextJsCodeGraph;
  userQuery: string;
  detectedFramework: string;
  maxExtraFiles: number;
  startTime: number;
  toolTraces: RouterToolTrace[];
}

// Tier 2: Snowflake Arctic-Embed-XS vector search augmented with Unix and
// code-graph pre-search. Returns null when the pipeline has no embeddings
// (the pre-search trace is still recorded) or when scoring fails — the
// orchestrator then falls through to the keyword tier.
export async function runArcticTier(input: ArcticTierInput): Promise<RoutingResult | null> {
  const {
    files,
    repoIndex,
    codeGraph,
    userQuery,
    detectedFramework,
    maxExtraFiles,
    startTime,
    toolTraces,
  } = input;

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
        // Vite SPA entry points: config, HTML mount point, and main/App modules
        if (detectedFramework === 'vite' && (p.includes('vite.config') || p.includes('src/main') || p.includes('src/app'))) score += 0.4;
        const viteQuery =
          q.includes('vite') || q.includes('entry') || q.includes('mount') ||
          q.includes('component') || q.includes('frontend') || q.includes('spa');
        if (viteQuery && (p.includes('vite.config') || p.includes('index.html') || p.includes('src/main') || p.includes('src/app'))) score += 0.3;
        // Hono controller structures: routers, middleware, RPC & validators.
        // Role-label match only (`[hono-route]` / `[hono-middleware]`):
        // a bare 'hono' substring also hits filenames and export names
        // (e.g. framework-detector.ts), which are not Hono evidence.
        const skeleton = (item.skeleton || '').toLowerCase();
        const honoQuery =
          q.includes('hono') || q.includes('endpoint') || q.includes('route') ||
          q.includes('api') || q.includes('middleware') || q.includes('rpc') ||
          q.includes('validator');
        if (honoQuery && skeleton.includes('[hono-')) score += 0.35;
        if (honoQuery && (p.includes('routes/') || p.includes('src/index') || p.endsWith('/app.ts') || p === 'src/app.ts' || p.includes('wrangler'))) score += 0.3;

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
    return null;
  } catch (err) {
    console.warn('Arctic embed XS vector search failed, falling back to keyword heuristic:', err);
    return null;
  }
}
