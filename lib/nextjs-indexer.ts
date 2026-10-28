import type { SourceFile } from '@/types';
import { hasHonoImportStatement } from './framework-detector.ts';

export interface NextJsFileCard {
  path: string;
  role:
    | 'app-page'
    | 'app-layout'
    | 'route-handler'
    | 'server-action'
    | 'middleware'
    | 'hono-route'
    | 'hono-middleware'
    | 'vite-entry'
    | 'vite-config'
    | 'vite-component'
    | 'client-component'
    | 'server-component'
    | 'hook'
    | 'store'
    | 'types'
    | 'config'
    | 'util';
  exports: string[];
  imports: string[];
  skeletonLine: string;
}

function isStrongHonoFile(path: string, content?: string): boolean {
  const p = path.toLowerCase();
  if (
    p.includes('wrangler.toml') ||
    p.includes('wrangler.json') ||
    p.includes('src/routes/') ||
    p.includes('/routes/')
  ) {
    return true;
  }
  if (!content) return false;
  return hasHonoImportStatement(content);
}

function hasHonoRouteCallShape(content?: string): boolean {
  if (!content) return false;
  // Route-path-shaped first argument only (`app.get('/users', ...)`).
  // Bare `.get('content-type')` / `.use(mw)` Web API calls must not match.
  // (Axios-style `.get('/x')` still matches here but is caught by role
  // ordering below — hook/store/util win over this weak signal.)
  return /\.\s*(get|post|put|delete|patch|options|head|all|use|route)\s*\(\s*['"`]\//.test(content);
}

function isViteConfigPath(path: string): boolean {
  const p = path.toLowerCase();
  return p.includes('vite.config.') || p.endsWith('/vite.config') || p === 'vite.config';
}

function isViteEntryPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p === 'index.html' ||
    p.endsWith('/index.html') ||
    p.includes('src/main.') ||
    p === 'src/main'
  );
}

function isViteComponentPath(path: string, content?: string): boolean {
  const p = path.toLowerCase();
  if (p.includes('src/app.') || p === 'src/app') return true;
  if (!content) return false;
  return (
    p.startsWith('src/') &&
    (p.endsWith('.tsx') || p.endsWith('.jsx')) &&
    (content.includes("from 'vite'") || content.includes('from "vite"'))
  );
}

/** Extracts `<script src="...">` entry injections from Vite index.html files. */
export function extractHtmlEntryImports(content: string): string[] {
  if (!content) return [];
  const imports: string[] = [];
  const matches = content.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi);
  for (const match of matches) {
    if (match[1]) imports.push(match[1]);
  }
  return Array.from(new Set(imports));
}

export function classifyNextJsRole(path: string, content?: string): NextJsFileCard['role'] {
  const p = path.toLowerCase();
  const strongHono = isStrongHonoFile(path, content);
  if (p.includes('middleware.ts') || p.includes('middleware.js')) {
    if (strongHono || hasHonoRouteCallShape(content)) return 'hono-middleware';
    return 'middleware';
  }
  if (strongHono && content && /\.\s*use\s*\(/.test(content)) return 'hono-middleware';
  if (p.includes('route.ts') || p.includes('route.js')) return 'route-handler';
  if (strongHono) return 'hono-route';
  if (isViteConfigPath(path)) return 'vite-config';
  if (isViteEntryPath(path)) return 'vite-entry';
  if (p.includes('layout.tsx') || p.includes('layout.jsx')) return 'app-layout';
  if (p.includes('page.tsx') || p.includes('page.jsx')) return 'app-page';
  if (isViteComponentPath(path, content)) return 'vite-component';
  if (p.includes('action') || (content && content.includes("'use server'"))) return 'server-action';
  if (p.includes('hook') || p.startsWith('hooks/')) return 'hook';
  if (p.includes('store') || p.includes('state')) return 'store';
  if (p.includes('type') || p.includes('interfaces')) return 'types';
  if (p.includes('config') || p.endsWith('.json') || p.endsWith('.mjs') || p.endsWith('.ts')) {
    if (p.includes('tailwind') || p.includes('next.config') || p.includes('tsconfig')) return 'config';
  }
  if (content && content.includes("'use client'")) return 'client-component';
  if (p.startsWith('lib/') || p.startsWith('utils/')) return 'util';
  // Weak Hono signal LAST: structural Next.js roles (hook/store/types/
  // config/util/client-component) all win over a bare method-call shape.
  // Files with a real Hono import never reach here (strongHono returns early).
  if (hasHonoRouteCallShape(content)) return 'hono-route';
  return 'server-component';
}

export function extractExportsAndImports(content: string): { exports: string[]; imports: string[] } {
  const exports: string[] = [];
  const imports: string[] = [];

  if (!content) return { exports, imports };

  // Match export statements
  const exportMatches = content.matchAll(/export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+([a-zA-Z0-9_]+)/g);
  for (const match of exportMatches) {
    if (match[1]) exports.push(match[1]);
  }

  // Match export default
  if (/export\s+default\s+/.test(content)) {
    exports.push('default');
  }

  // Match import statements
  const importMatches = content.matchAll(/import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g);
  for (const match of importMatches) {
    if (match[1]) imports.push(match[1]);
  }

  return { exports: Array.from(new Set(exports)), imports: Array.from(new Set(imports)) };
}

export function buildNextJsRepoIndex(files: SourceFile[]): NextJsFileCard[] {
  return files.map((file) => {
    const role = classifyNextJsRole(file.path, file.content);
    const { exports, imports } = extractExportsAndImports(file.content);
    // Vite HTML entry injection: <script src="/src/main.tsx"> maps the
    // index.html entry point into the module graph closure.
    if (file.path.toLowerCase().endsWith('.html')) {
      for (const entry of extractHtmlEntryImports(file.content)) {
        if (!imports.includes(entry)) imports.push(entry);
      }
    }
    const expStr = exports.length > 0 ? `exp:${exports.slice(0, 4).join(',')}` : 'exp:none';
    const impStr = imports.length > 0 ? `imp:${imports.slice(0, 4).join(',')}` : 'imp:none';
    const skeletonLine = `${file.path} [${role}] ${expStr} ${impStr}`;

    return {
      path: file.path,
      role,
      exports,
      imports,
      skeletonLine,
    };
  });
}

export function countRolesForDirectives(cards: NextJsFileCard[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const card of cards) {
    counts[card.role] = (counts[card.role] ?? 0) + 1;
  }
  return counts;
}

export function expandWithNextJsImportClosure(
  selectedPaths: string[],
  repoIndex: NextJsFileCard[],
  maxExtraFiles: number = 6
): string[] {
  const selectedSet = new Set(selectedPaths.map((p) => p.replace(/^\//, '')));
  const addedPaths: string[] = [];

  // 1. If any page is selected, automatically attach its nearest layout.tsx
  for (const path of Array.from(selectedSet)) {
    if (path.includes('page.tsx') || path.includes('page.jsx')) {
      const parts = path.split('/');
      parts.pop(); // remove page.tsx
      // Search for layout in parent directories or same dir
      while (parts.length >= 0) {
        const candidateLayout = [...parts, 'layout.tsx'].join('/');
        const candidateLayoutJsx = [...parts, 'layout.jsx'].join('/');
        const found = repoIndex.find(
          (f) => f.path === candidateLayout || f.path === candidateLayoutJsx
        );
        if (found && !selectedSet.has(found.path) && addedPaths.length < maxExtraFiles) {
          addedPaths.push(found.path);
          selectedSet.add(found.path);
          break;
        }
        if (parts.length === 0) break;
        parts.pop();
      }
    }
  }

  // 1b. If a Vite entry point is selected, attach its sibling entry files
  // (index.html <-> src/main.* <-> src/App.*) so the SPA mount chain stays whole.
  const hasViteEntry = Array.from(selectedSet).some(
    (p) => isViteEntryPath(p) || p.toLowerCase().includes('src/app.')
  );
  if (hasViteEntry) {
    const entryCandidates = repoIndex.filter(
      (f) => isViteEntryPath(f.path) || f.path.toLowerCase().includes('src/app.')
    );
    for (const candidate of entryCandidates) {
      if (!selectedSet.has(candidate.path) && addedPaths.length < maxExtraFiles) {
        addedPaths.push(candidate.path);
        selectedSet.add(candidate.path);
      }
    }
  }

  // 2. Add 1-hop imported types, hooks, and lib utilities
  for (const path of Array.from(selectedSet)) {
    const card = repoIndex.find((f) => f.path === path);
    if (!card) continue;

    for (const imp of card.imports) {
      // Vite HTML entries inject web-root absolute paths ("/src/main.tsx");
      // strip the leading slash so they resolve against the repo index too.
      const normalizedImp = imp.startsWith('/') && !imp.startsWith('//') ? imp.slice(1) : imp;
      if (
        normalizedImp.startsWith('@/') ||
        normalizedImp.startsWith('./') ||
        normalizedImp.startsWith('../') ||
        normalizedImp !== imp
      ) {
        // Find matching file in repo index
        const cleanImp = normalizedImp.replace(/^@\//, '');
        const matchingFile = repoIndex.find(
          (f) =>
            f.path === cleanImp ||
            f.path.startsWith(cleanImp) ||
            f.path.includes(cleanImp.split('/').pop() || '')
        );
        if (
          matchingFile &&
          !selectedSet.has(matchingFile.path) &&
          addedPaths.length < maxExtraFiles
        ) {
          addedPaths.push(matchingFile.path);
          selectedSet.add(matchingFile.path);
        }
      }
    }
  }

  return Array.from(selectedSet);
}
