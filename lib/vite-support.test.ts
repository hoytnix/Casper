import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRepositoryFramework, frameworkBadgeLabel } from './framework-detector.ts';
import {
  classifyNextJsRole,
  buildNextJsRepoIndex,
  expandWithNextJsImportClosure,
} from './nextjs-indexer.ts';
import { buildNextJsCodeGraph } from './nextjs-code-graph.ts';
import type { SourceFile } from '../types/index.ts';

const file = (path: string, content: string): SourceFile => ({
  path,
  content,
  size: content.length,
});

test('detects Vite via vite.config.ts tree path', () => {
  const fw = detectRepositoryFramework([], ['vite.config.ts', 'index.html', 'src/main.tsx']);
  assert.equal(fw, 'vite');
});

test('detects Vite via index.html plus vite import', () => {
  const files = [
    file('index.html', '<div id="root"></div><script src="/src/main.tsx"></script>'),
    file('src/main.tsx', "import { defineConfig } from 'vite';\ncreateRoot(document.getElementById('root')!).render(<App />);"),
  ];
  assert.equal(detectRepositoryFramework(files), 'vite');
});

test('detects Vite via package.json vite dependency', () => {
  const files = [
    file(
      'package.json',
      JSON.stringify({ dependencies: { react: '^19.0.0' }, devDependencies: { vite: '^6.0.0' } })
    ),
  ];
  assert.equal(detectRepositoryFramework(files), 'vite');
});

test('does not misclassify Next.js or Hono repos as Vite', () => {
  const nextFiles = [
    file('next.config.ts', 'const nextConfig = {}; export default nextConfig;'),
    file('app/page.tsx', 'export default function Page() { return <h1>hi</h1>; }'),
  ];
  assert.equal(detectRepositoryFramework(nextFiles), 'nextjs');

  const honoFiles = [
    file('src/index.ts', "import { Hono } from 'hono';\nconst app = new Hono();\napp.get('/', (c) => c.text('hi'));"),
  ];
  assert.equal(detectRepositoryFramework(honoFiles), 'hono');

  assert.equal(detectRepositoryFramework([]), 'unknown');
});

test("frameworkBadgeLabel covers Vite and still falls through to unknown", () => {
  assert.equal(frameworkBadgeLabel('vite'), 'Vite SPA & SSR');
  assert.equal(frameworkBadgeLabel('nextjs'), 'Next.js App Router');
  assert.equal(frameworkBadgeLabel('hono'), 'Hono Edge Router');
  assert.equal(frameworkBadgeLabel('unknown'), 'Unknown Framework');
});

test('classifies Vite file roles', () => {
  assert.equal(classifyNextJsRole('vite.config.ts', "import { defineConfig } from 'vite';"), 'vite-config');
  assert.equal(classifyNextJsRole('index.html', '<div id="root"></div>'), 'vite-entry');
  assert.equal(classifyNextJsRole('src/main.tsx', "import App from './App';"), 'vite-entry');
  assert.equal(classifyNextJsRole('src/App.tsx', 'export default function App() { return <h1/>; }'), 'vite-component');
});

test('Vite entry selection expands closure to App component and main entry', () => {
  const files = [
    file('index.html', '<div id="root"></div><script type="module" src="/src/main.tsx"></script>'),
    file('src/main.tsx', "import App from './App';"),
    file('src/App.tsx', 'export default function App() { return <h1/>; }'),
  ];
  const repoIndex = buildNextJsRepoIndex(files);
  const expanded = expandWithNextJsImportClosure(['index.html'], repoIndex);
  assert.ok(expanded.includes('index.html'));
  assert.ok(expanded.includes('src/main.tsx'));
  assert.ok(expanded.includes('src/App.tsx'));
});

test('code graph maps Vite SPA component render tree without throwing on index.html', () => {
  const files = [
    file('index.html', '<div id="root"></div><script type="module" src="/src/main.tsx"></script>'),
    file('src/main.tsx', "import App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);"),
    file('src/App.tsx', 'import Header from "./Header";\nexport default function App() { return (<div><Header /></div>); }'),
    file('src/Header.tsx', 'export default function Header() { return <h1>hi</h1>; }'),
  ];
  const graph = buildNextJsCodeGraph(files);
  assert.ok(
    graph.renderEdges.some((e) => e.parentComponent === 'App' && e.childComponent === 'Header')
  );
  assert.ok(
    graph.routeMap.pages.some((p) => p.path === 'src/App.tsx' && p.components.includes('App'))
  );
});
