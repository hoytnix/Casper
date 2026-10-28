import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAgenticExploration, withTimeout } from './agentic-exploration.ts';
import type { SourceFile } from '../types/index.ts';

const file = (path: string, content = 'x'): SourceFile => ({ path, content, size: content.length });

function harness(responses: unknown[]) {
  const events: Record<string, unknown>[] = [];
  let calls = 0;
  const ai = {
    models: {
      generateContent: async () => responses[Math.min(calls++, responses.length - 1)],
    },
  };
  const fetched: string[][] = [];
  return {
    events,
    fetched,
    input: {
      ai: ai as never,
      sendEvent: (e: Record<string, unknown>) => { events.push(e); },
      owner: 'o',
      repo: 'r',
      branch: 'main',
      treeListing: '@[/app/page.tsx]\n@[/lib/utils.ts]',
      improvementPrompt: 'fix it',
      mode: 'agentic',
      clientInvestigatedFiles: [] as SourceFile[],
      cascadingModels: ['gemini-2.5-flash'],
      maxRounds: 2,
      timeoutMs: 1000,
      requestTimeout: 60,
      githubPat: undefined,
      fetchFilesOnDemand: async (_o: string, _r: string, _b: string, paths: string[]) => {
        fetched.push(paths);
        return paths.map((p) => file(p, `content of ${p}`));
      },
      normalizeRepoPath: (p: string) => p.replace(/^\.\//, ''),
    },
  };
}

describe('runAgenticExploration (route protocol)', () => {
  it('seeds from client files and falls back to tree paths when no tool call', async () => {
    const h = harness([{}]);
    h.input.clientInvestigatedFiles = [file('app/page.tsx', 'seed')];
    const { exploredFilesMap, explorationTrail } = await runAgenticExploration(h.input);
    assert.equal(exploredFilesMap.get('app/page.tsx')?.content, 'seed');
    assert.equal(explorationTrail.length, 0);
    assert.equal(h.fetched.length, 0); // seeded map is non-empty: no fallback fetch
    assert.equal(h.events[0].type, 'agent_round');
  });

  it('fetches inspected paths, emits inspect/loaded, appends one trail step', async () => {
    const h = harness([
      { functionCalls: [{ args: { filePaths: ['lib/utils.ts'], reason: 'blast radius' } }] },
      {},
    ]);
    const { exploredFilesMap, explorationTrail } = await runAgenticExploration(h.input);
    assert.equal(exploredFilesMap.get('lib/utils.ts')?.content, 'content of lib/utils.ts');
    assert.equal(explorationTrail.length, 1);
    assert.equal(explorationTrail[0].paths[0], 'lib/utils.ts');
    assert.equal(explorationTrail[0].status, 'completed');
    const types = h.events.map((e) => e.type);
    assert.deepEqual(types, ['agent_round', 'agent_inspect', 'agent_files_loaded', 'agent_round']);
    assert.deepEqual(h.events[1].paths, ['lib/utils.ts']);
    assert.equal(h.events[2].totalInvestigated, 1);
  });

  it('skips muse- models for exploration and breaks when nothing new', async () => {
    const h = harness([{}]);
    h.input.cascadingModels = ['muse-spark-1.3'];
    const { exploredFilesMap } = await runAgenticExploration(h.input);
    // No Gemini model available: loop breaks, fallback still fills from tree.
    assert.ok(exploredFilesMap.size > 0);
    assert.deepEqual(h.fetched[0], ['app/page.tsx', 'lib/utils.ts']);
  });

  it('withTimeout rejects with the timeout message string', async () => {
    await assert.rejects(
      withTimeout(new Promise(() => {}), 10, 'boom'),
      (e: unknown) => e === 'boom'
    );
  });
});
