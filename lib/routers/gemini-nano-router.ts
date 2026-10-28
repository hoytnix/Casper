import type { RoutingResult, RouterToolTrace, SourceFile } from '@/types';
import type { NextJsFileCard } from '../nextjs-indexer';
import type { NextJsCodeGraph } from '../nextjs-code-graph';
import { expandWithNextJsImportClosure } from '../nextjs-indexer';
import {
  findFiles,
  grepFiles,
  readLines,
  inspectGraph,
  traceCallGraph,
  getNextJsRouteMap,
  findRelatedSymbols,
} from '../unix-vfs-tools';

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

let cachedBaseSession: any = null;
let cachedRepoKey: string = '';

export function getNanoSession(): any {
  return cachedBaseSession;
}

export async function checkGeminiNanoAvailability(): Promise<'available' | 'readily' | 'downloadable' | 'unsupported'> {
  if (typeof window === 'undefined') return 'unsupported';
  const lm = window.LanguageModel || window.ai?.languageModel;
  if (!lm || typeof lm.availability !== 'function') return 'unsupported';

  try {
    // Pass the exact create() options so Chrome checks the real execution
    // config. A bare availability() can report 'available' while
    // create({ outputLanguage: 'en', ... }) has no execution config, which
    // surfaces as "model was available but there was not an execution config".
    const status = await lm.availability({ outputLanguage: 'en' });
    if (status === 'available' || status === 'readily') return 'available';
    if (status === 'after-download' || status === 'downloadable') return 'downloadable';
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

// Tier 1 warmup: creates the graph-aware Nano base session for repo key.
export async function ensureNanoSession(
  repoIdentifier: string,
  graphSummary: string,
  routerScopeNote: string,
  onProgress?: (statusText: string, progressPercent?: number) => void
): Promise<boolean> {
  if (onProgress) onProgress('Checking Chrome Gemini Nano availability...', 25);
  const avail = await checkGeminiNanoAvailability();
  if (avail !== 'available' && avail !== 'downloadable') return false;
  try {
    const lm = window.LanguageModel || window.ai?.languageModel;
    if (lm && typeof lm.create === 'function') {
      if (onProgress) onProgress('Creating Gemini Nano session...', 35);
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
=== END GRAPH ===

${routerScopeNote}`;

      cachedBaseSession = await lm.create({
        initialPrompts: [{ role: 'system', content: systemPrompt }],
        outputLanguage: 'en',
      });
      cachedRepoKey = repoIdentifier;
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Gemini Nano session creation failed:', err);
    return false;
  }
}

export function isNanoRepoKey(repoIdentifier: string): boolean {
  return cachedRepoKey === repoIdentifier;
}

export interface NanoToolLoopInput {
  files: SourceFile[];
  repoIndex: NextJsFileCard[];
  codeGraph: NextJsCodeGraph;
  userQuery: string;
  detectedFramework: string;
  maxExtraFiles: number;
  startTime: number;
  toolTraces: RouterToolTrace[];
}

// Tier 1: Chrome Gemini Nano multi-step Unix tool loop on a cloned base
// session (max 3 steps). Returns null when unavailable, failed, or empty —
// the orchestrator falls through to Arctic. Clone is always destroyed.
export async function runNanoToolLoop(input: NanoToolLoopInput): Promise<RoutingResult | null> {
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

  if (!cachedBaseSession) return null;
  if (typeof window === 'undefined' || !(window.LanguageModel || window.ai?.languageModel)) return null;

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
            outputSummary: `Retrieved route map (${detectedFramework})`,
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
      return null;
    } finally {
      if (typeof clone.destroy === 'function') {
        clone.destroy();
      }
    }
  } catch (err) {
    console.warn('Gemini Nano Unix tool loop failed, falling back to Arctic Embed XS:', err);
    return null;
  }
}
