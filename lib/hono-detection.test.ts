import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRepositoryFramework,
  hasHonoImportStatement,
} from './framework-detector.ts';
import { classifyNextJsRole } from './nextjs-indexer.ts';
import { buildNextJsCodeGraph } from './nextjs-code-graph.ts';
import type { SourceFile } from '../types/index.ts';

const file = (path: string, content: string): SourceFile => ({
  path,
  content,
  size: content.length,
});

// Mimics app/api/compile/route.ts: a genuine Next.js Route Handler whose
// embedded prompt strings mention Hono vocabulary in prose.
const NEXT_ROUTE_WITH_HONO_PROSE = `import { NextRequest, NextResponse } from 'next/server';
const HONO_HELP = \`Validate all inputs with \\\`hono/zod-validator\\\` and group routers via \\\`app.route('/base', subApp)\\\`\`;
export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type');
  return NextResponse.json({ ok: true, ct });
}`;

test('detector is not poisoned by Hono vocabulary inside string literals', () => {
  const files = [
    file('next.config.ts', 'const nextConfig = {}; export default nextConfig;'),
    file('app/layout.tsx', 'export default function RootLayout({ children }) { return children; }'),
    file('app/api/compile/route.ts', NEXT_ROUTE_WITH_HONO_PROSE),
    file('package.json', JSON.stringify({ dependencies: { next: '^15.4.9', react: '^19.0.0', zod: '^4.0.0' } })),
  ];
  assert.equal(detectRepositoryFramework(files, files.map((f) => f.path)), 'nextjs');
});

test('detector still catches a real Hono service', () => {
  const files = [
    file('src/index.ts', "import { Hono } from 'hono';\nconst app = new Hono();\napp.get('/', (c) => c.text('hi'));"),
    file('wrangler.toml', 'name = "api"\ncompatibility_date = "2024-01-01"'),
  ];
  assert.equal(detectRepositoryFramework(files, files.map((f) => f.path)), 'hono');
});

test('hasHonoImportStatement requires import/require/construction syntax', () => {
  assert.ok(hasHonoImportStatement("import { Hono } from 'hono';"));
  assert.ok(hasHonoImportStatement('import "hono/validator";'));
  assert.ok(hasHonoImportStatement("const { Hono } = require('hono');"));
  assert.ok(!hasHonoImportStatement('const s = "require(\'hono\')";'));
  assert.ok(hasHonoImportStatement('const app = new Hono();'));
  assert.ok(hasHonoImportStatement('  export const app = new Hono();'));
  assert.ok(!hasHonoImportStatement('const s = "const app = new Hono();";'));
  assert.ok(!hasHonoImportStatement('Validate all inputs with `hono/zod-validator` middleware'));
  assert.ok(!hasHonoImportStatement("grouped sub-routers via `app.route('/base', subApp)`"));
  assert.ok(!hasHonoImportStatement('call new Hono() to start your app'));
  assert.ok(!hasHonoImportStatement(undefined));
});

test('headers.get does not hijack client-component classification', () => {
  const content = `'use client';\nasync function load(res: Response) {\n  const ct = res.headers.get('content-type');\n  return ct;\n}\nexport default function Panel() { return null; }`;
  assert.equal(classifyNextJsRole('components/RepoWorkspace.tsx', content), 'client-component');
});

test('headers.get does not hijack lib util classification', () => {
  const content = `export async function ping(res: Response) {\n  return res.headers.get('x-ratelimit-reset');\n}`;
  assert.equal(classifyNextJsRole('lib/github.ts', content), 'util');
});

test('genuine Next.js route handler keeps its role despite Web API calls', () => {
  assert.equal(
    classifyNextJsRole('app/api/compile/route.ts', NEXT_ROUTE_WITH_HONO_PROSE),
    'route-handler'
  );
});

test('genuine Hono route file still classifies as hono-route', () => {
  const content = `import { Hono } from 'hono';\nconst app = new Hono();\napp.get('/users', (c) => c.json([]));`;
  assert.equal(classifyNextJsRole('src/routes/users.ts', content), 'hono-route');
});

test('code graph ignores Hono route prose without a real import', () => {
  const content = `// Validate with hono/zod-validator; group routers via app.route('/base', subApp) for scale\nexport function helper() { return 1; }`;
  const graph = buildNextJsCodeGraph([file('lib/docs.ts', content)]);
  assert.equal(graph.routeMap.routeHandlers.length, 0);
  assert.equal(Object.keys(graph.symbols).length, 1);
});
