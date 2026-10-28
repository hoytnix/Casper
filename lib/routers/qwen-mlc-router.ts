import type { RouterEngineType, RoutingResult, RouterToolTrace, SourceFile } from '@/types';
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
import { CreateMLCEngine } from '@mlc-ai/web-llm';
import {
  DEFAULT_LOCAL_CONTEXT_TOKENS,
  getLocalModelSpec,
  isLocalGenerationEngine,
  validateLocalContextTokens,
} from '../local-models';

let mlcEngine: any = null;
let mlcEngineLoading = false;
let mlcEngineModelId = '';
let mlcLoadError: { message: string; action: string } | null = null;

export class ModelUnavailableError extends Error {
  action: string;
  constructor(message: string, action: string) {
    super(message);
    this.name = 'ModelUnavailableError';
    this.action = action;
  }
}

export class ModelLoadOOMError extends Error {
  action: string;
  constructor(message: string, action: string) {
    super(message);
    this.name = 'ModelLoadOOMError';
    this.action = action;
  }
}

export class WebGPUNotAvailableError extends Error {
  action: string;
  constructor(message = 'WebGPU is not available in this browser.') {
    super(message);
    this.name = 'WebGPUNotAvailableError';
    this.action = 'Use Chrome/Edge 113+ with hardware acceleration, or fall back to the Arctic keyword path.';
  }
}

const OOM_ACTION =
  'Close other tabs, use int4 only, keep context at 1536, and try a TINY_FILTER first.';

function classifyMlcFailure(err: unknown, targetModel: string): { message: string; action: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (typeof navigator !== 'undefined' && (navigator as any).gpu === undefined) {
    return {
      message: `WebGPU is not available, so ${targetModel} cannot load in this browser.`,
      action: 'Use Chrome/Edge 113+ with hardware acceleration, or fall back to the Arctic keyword path.',
    };
  }
  if (/out of memory|OOM|allocation|exceeds|memory/i.test(raw)) {
    return { message: `Out of memory loading ${targetModel}: ${raw}`, action: OOM_ACTION };
  }
  return {
    message: `Model unavailable (${targetModel}): ${raw}`,
    action: OOM_ACTION,
  };
}

export function getMlcEngine(): any {
  return mlcEngine;
}

export function getMlcEngineModelId(): string {
  return mlcEngineModelId;
}

export function getResidentModelId(): string {
  return mlcEngineModelId;
}

export function isModelLoaded(): boolean {
  return !!mlcEngine && mlcEngineModelId.length > 0;
}

export function getMlcLoadError(): { message: string; action: string } | null {
  return mlcLoadError;
}

export function resolveQwenTargetModel(enginePreference: RouterEngineType): string {
  if (isLocalGenerationEngine(enginePreference)) {
    const spec = getLocalModelSpec(enginePreference);
    if (spec?.mlcModelId) return spec.mlcModelId;
  }
  return 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC';
}

export function engineLabelForModelId(modelId: string): string {
  if (modelId.includes('Qwen3-0.6B')) return 'Qwen3-0.6B';
  if (modelId.includes('Llama-3.2-1B')) return 'Llama-3.2-1B';
  if (modelId.includes('SmolLM2-1.7B')) return 'SmolLM2-1.7B';
  if (modelId.includes('SmolLM2-360M')) return 'SmolLM2-360M';
  if (modelId.includes('1.5B')) return 'Qwen2.5-Coder-1.5B';
  return 'Qwen2.5-Coder-0.5B';
}

// One generation model resident at a time. Unloads the previous engine
// (and clears KV cache + reference) before a new ID loads; never leaves
// a half-initialized engine resident.
export async function unloadLocalModel(): Promise<void> {
  const engine = mlcEngine;
  mlcEngine = null;
  mlcEngineModelId = '';
  if (engine && typeof engine.unload === 'function') {
    try {
      await engine.unload();
    } catch (err) {
      console.warn('MLC engine unload note:', err);
    }
  }
}

// Tier 0 warmup: loads the selected int4 generation model on demand.
export async function ensureQwenEngine(
  enginePreference: RouterEngineType,
  onProgress?: (statusText: string, progressPercent?: number) => void,
  localContextTokens: number = DEFAULT_LOCAL_CONTEXT_TOKENS
): Promise<boolean> {
  void validateLocalContextTokens(localContextTokens);
  if (!isLocalGenerationEngine(enginePreference)) return false;
  const spec = getLocalModelSpec(enginePreference);
  if (!spec || spec.fitBadge === 'BLOCKED' || !spec.mlcModelId) {
    mlcLoadError = {
      message: `${spec?.displayName ?? enginePreference} is BLOCKED and cannot load.`,
      action: spec?.gated
        ? 'This model is gated: accept the license on its Hugging Face page, then retry. Otherwise pick a FITS int4 judge.'
        : 'Pick a FITS or TINY_FILTER int4 judge instead.',
    };
    return false;
  }
  const targetModel = spec.mlcModelId;
  try {
    if (mlcEngine && mlcEngineModelId !== targetModel) {
      await unloadLocalModel();
    }
    if (!mlcEngine || mlcEngineModelId !== targetModel) {
      mlcEngineLoading = true;
      if (onProgress) onProgress(`Loading MLC WebGPU model (${targetModel})...`, 15);
      const created = await CreateMLCEngine(targetModel, {
        initProgressCallback: (progress) => {
          if (onProgress) {
            onProgress(progress.text || 'Loading WebGPU model weights...', undefined);
          }
        }
      });
      mlcEngine = created;
      mlcEngineModelId = targetModel;
      mlcLoadError = null;
    }
    return true;
  } catch (err) {
    // Never leave a half-initialized engine resident.
    mlcEngine = null;
    mlcEngineModelId = '';
    mlcEngineLoading = false;
    mlcLoadError = classifyMlcFailure(err, targetModel);
    console.warn('MLC engine warmup failed:', err);
    return false;
  } finally {
    mlcEngineLoading = false;
  }
}

export interface QwenToolLoopInput {
  files: SourceFile[];
  repoIndex: NextJsFileCard[];
  codeGraph: NextJsCodeGraph;
  graphSummary: string;
  routerScopeNote: string;
  userQuery: string;
  detectedFramework: string;
  enginePreference: RouterEngineType;
  repoIdentifier: string;
  maxExtraFiles: number;
  startTime: number;
  toolTraces: RouterToolTrace[];
  onProgress?: (statusText: string, progressPercent?: number) => void;
  localContextTokens?: number;
}

// Tier 0: Qwen Coder MLC Unix tool loop (max 3 steps). Returns null when
// the engine is unavailable, fails, or selects nothing — the orchestrator
// then falls through to the next tier. The per-tool dispatch below
// intentionally mirrors the Nano loop's dispatch (trace id prefix aside);
// merging them would risk trace-shape drift, so the duplication stays.
export async function runQwenToolLoop(input: QwenToolLoopInput): Promise<RoutingResult | null> {
  const {
    files,
    repoIndex,
    codeGraph,
    graphSummary,
    routerScopeNote,
    userQuery,
    detectedFramework,
    enginePreference,
    maxExtraFiles,
    startTime,
    toolTraces,
    onProgress,
  } = input;

  const contextTokens = validateLocalContextTokens(input.localContextTokens ?? DEFAULT_LOCAL_CONTEXT_TOKENS);
  // Short-context pin: excerpt + summary input stays within ~4 chars/token.
  const summaryBudgetChars = Math.min(graphSummary.length, contextTokens * 4);

  if (!mlcEngine && !mlcEngineLoading) {
    const ready = await ensureQwenEngine(enginePreference, onProgress, contextTokens);
    if (!ready) return null;
  }
  if (!mlcEngine) return null;

  const isQwen3 = mlcEngineModelId.includes('Qwen3-0.6B');

  try {
    const systemPrompt = `You are an expert Next.js Function-Level Graph & Unix Agent Context Router. Your task is to investigate the repository using Unix & Code Graph tools (grep, find, head_tail, inspect_graph, trace_call_graph, get_route_map, find_related_symbols) to select the exact relevant Next.js source file paths. Non-thinking mode: output JSON only, no reasoning text.
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
${graphSummary.slice(0, summaryBudgetChars)}
=== END GRAPH ===

${routerScopeNote}`;

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
        temperature: 0,
        max_tokens: 512,
        response_format: { type: 'json_object' },
        ...(isQwen3 ? { enable_thinking: false } : {}),
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
          outputSummary: `Retrieved route map (${detectedFramework})`,
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
        engineUsed: engineLabelForModelId(mlcEngineModelId),
        latencyMs,
        toolTraces,
      };
    }
    return null;
  } catch (err) {
    console.warn('Qwen Coder MLC routing failed:', err);
    return null;
  }
}
