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

let mlcEngine: any = null;
let mlcEngineLoading = false;
let mlcEngineModelId = '';

export function getMlcEngine(): any {
  return mlcEngine;
}

export function getMlcEngineModelId(): string {
  return mlcEngineModelId;
}

export function resolveQwenTargetModel(enginePreference: RouterEngineType): string {
  return enginePreference === 'qwen-1.5b-coder-mlc'
    ? 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC'
    : 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC';
}

// Tier 0 warmup: loads the selected Qwen Coder WebGPU model on demand.
export async function ensureQwenEngine(
  enginePreference: RouterEngineType,
  onProgress?: (statusText: string, progressPercent?: number) => void
): Promise<boolean> {
  const targetModel = resolveQwenTargetModel(enginePreference);
  try {
    if (!mlcEngine || mlcEngineModelId !== targetModel) {
      mlcEngineLoading = true;
      if (onProgress) onProgress(`Loading MLC WebGPU model (${targetModel})...`, 15);
      mlcEngine = await CreateMLCEngine(targetModel, {
        initProgressCallback: (progress) => {
          if (onProgress) {
            onProgress(progress.text || 'Loading WebGPU model weights...', undefined);
          }
        }
      });
      mlcEngineModelId = targetModel;
    }
    return true;
  } catch (err) {
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

  if (!mlcEngine && !mlcEngineLoading) {
    const ready = await ensureQwenEngine(enginePreference, onProgress);
    if (!ready) return null;
  }
  if (!mlcEngine) return null;

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
        engineUsed: mlcEngineModelId.includes('1.5B') ? 'Qwen2.5-Coder-1.5B' : 'Qwen2.5-Coder-0.5B',
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
