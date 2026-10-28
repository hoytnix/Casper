// Agentic exploration phase for the compile route.
// Moved verbatim from app/api/compile/route.ts (UNIFIED AGENTIC
// EXPLORATION & STREAMING PIPELINE, exploration half): multi-round Gemini
// function-calling loop that fills exploredFilesMap + explorationTrail.
// Emitted event shapes are unchanged: agent_round, agent_inspect,
// agent_files_loaded. The opening agent_start greeting stays in the route
// (stream sequencing), as do maxRounds normalization and key gating.
import type { GoogleGenAI } from '@google/genai';
import type { ExplorationStep, SourceFile } from '@/types/index.js';
import { inspectFilesToolDeclaration } from './prompt-templates.ts';

export interface ExplorationGateway {
  owner: string;
  repo: string;
  branch: string;
  githubPat?: string;
  fetchFilesOnDemand: (
    owner: string,
    repo: string,
    branch: string,
    paths: string[],
    githubPat?: string
  ) => Promise<SourceFile[]>;
  normalizeRepoPath: (p: string) => string;
}

export interface AgenticExplorationInput extends ExplorationGateway {
  ai: GoogleGenAI;
  sendEvent: (eventData: Record<string, unknown>) => void;
  treeListing: string;
  improvementPrompt: string;
  mode: string;
  clientInvestigatedFiles: SourceFile[];
  cascadingModels: readonly string[];
  maxRounds: number;
  timeoutMs: number;
  requestTimeout: number;
}

export interface AgenticExplorationResult {
  exploredFilesMap: Map<string, SourceFile>;
  explorationTrail: ExplorationStep[];
}

// Per-call timeout guard for streaming model work. Kept identical to the
// route original: rejects with the timeout message (string, not Error) and
// unrefs the timer so idle handles never pin the Node process open.
export function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timeoutMessage), ms);
    if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
      (timer as unknown as { unref: () => void }).unref();
    }
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isMuseModelTagLocal(model: string): boolean {
  return typeof model === 'string' && model.startsWith('muse-');
}

export async function runAgenticExploration(
  input: AgenticExplorationInput
): Promise<AgenticExplorationResult> {
  const {
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
  } = input;

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

  // Muse Spark models stream synthesis only — Gemini function-calling
  // (inspect_files) cannot run against muse- tags, so exploration stays
  // on the Gemini subset. A muse-only cascade skips straight to fallback
  // context + Muse synthesis streaming below.
  const explorationModels = cascadingModels.filter((m) => !isMuseModelTagLocal(m));

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

  return { exploredFilesMap, explorationTrail };
}
