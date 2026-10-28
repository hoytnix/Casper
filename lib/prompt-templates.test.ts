import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CASCADING_MODELS,
  MUSE_MAX_DEBILITATION_OVERLAY,
  buildFinalPromptPayload,
  buildFocusedContextSnapshot,
  inspectFilesToolDeclaration,
  selectSystemInstruction,
} from './prompt-templates.ts';

test('selectSystemInstruction follows the mode/framework/tier ladder', () => {
  const nextAgentic = selectSystemInstruction('agentic', 'nextjs', 'high');
  assert.ok(nextAgentic.includes('Next.js 15+ App Router'));
  assert.ok(!nextAgentic.startsWith(MUSE_MAX_DEBILITATION_OVERLAY));
  assert.ok(selectSystemInstruction('idea', 'nextjs', 'high').includes('77 innovative feature'));
  assert.ok(selectSystemInstruction('btw', 'nextjs', 'high').includes('Senior Codebase Assistant'));
  const honoAgentic = selectSystemInstruction('agentic', 'hono', 'medium');
  assert.ok(honoAgentic.includes('specializing exclusively in Hono'));
  assert.ok(selectSystemInstruction('idea', 'hono', 'low').includes('endpoints and middleware'));
  assert.ok(selectSystemInstruction('btw', 'hono', 'low').includes('route chains'));
  const overlaid = selectSystemInstruction('agentic', 'nextjs', 'xhigh');
  assert.ok(overlaid.startsWith(`${MUSE_MAX_DEBILITATION_OVERLAY}\n\n`));
  assert.ok(overlaid.includes('Next.js 15+ App Router'));
  assert.ok(selectSystemInstruction('agentic', 'nextjs', 'max').startsWith('MAX REASONING OVERRIDE'));
});

test('DEFAULT_CASCADING_MODELS leads with Muse Spark tiers', () => {
  assert.deepEqual([...DEFAULT_CASCADING_MODELS].slice(0, 2), [
    'muse-spark-1.3-contributor',
    'muse-spark-1.3',
  ]);
});

test('inspectFilesToolDeclaration keeps its contract shape', () => {
  assert.equal(inspectFilesToolDeclaration.name, 'inspect_files');
  const params = inspectFilesToolDeclaration.parameters as unknown as {
    properties: Record<string, unknown>;
    required: string[];
  };
  assert.ok(params.properties.filePaths);
  assert.ok(params.properties.reason);
  assert.ok(params.required.includes('filePaths'));
  assert.ok(params.required.includes('reason'));
});

test('focused snapshot and payload carry tree, files, and request markers', () => {
  const snapshot = buildFocusedContextSnapshot({
    owner: 'o',
    repo: 'r',
    branch: 'main',
    treeListing: '@[/app/page.tsx]',
    exploredFilesList: [{ path: 'app/page.tsx', content: 'hello', size: 5 }],
  });
  assert.ok(snapshot.includes('Target Repository: o/r'));
  assert.ok(snapshot.includes('--- START FILE: @[/app/page.tsx] ---'));
  assert.ok(snapshot.includes('hello'));
  const payload = buildFinalPromptPayload('agentic', snapshot, 'ship it');
  assert.ok(payload.includes("DEVELOPER'S REQUESTED IMPROVEMENTS / GOAL (Mode: agentic)"));
  assert.ok(payload.includes('ship it'));
  assert.ok(buildFinalPromptPayload('idea', snapshot, 'x').includes('DEVELOPER FOCUS OR GOAL'));
  assert.ok(buildFinalPromptPayload('btw', snapshot, 'x').includes("DEVELOPER'S QUESTION"));
});
