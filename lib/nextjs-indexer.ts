import { SourceFile } from '@/types';

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
  return (
    content.includes("from 'hono'") ||
    content.includes('from "hono"') ||
    content.includes('hono/zod-validator') ||
    content.includes('hono/client') ||
    content.includes('new Hono(')
  );
}

function hasHonoRouteCallShape(content?: string): boolean {
  if (!content) return false;
  return /\.\s*(get|post|put|delete|patch|options|head|all|use|route)\s*\(\s*['"`/]/.test(content);
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
  if (p.includes('layout.tsx') || p.includes('layout.jsx')) return 'app-layout';
  if (p.includes('page.tsx') || p.includes('page.jsx')) return 'app-page';
  if (p.includes('action') || (content && content.includes("'use server'"))) return 'server-action';
  // Weak Hono signal (method-call shape without an explicit hono import):
  // checked after Next.js structural roles so pages/layouts/actions keep priority.
  if (hasHonoRouteCallShape(content)) return 'hono-route';
  if (p.includes('hook') || p.startsWith('hooks/')) return 'hook';
  if (p.includes('store') || p.includes('state')) return 'store';
  if (p.includes('type') || p.includes('interfaces')) return 'types';
  if (p.includes('config') || p.endsWith('.json') || p.endsWith('.mjs') || p.endsWith('.ts')) {
    if (p.includes('tailwind') || p.includes('next.config') || p.includes('tsconfig')) return 'config';
  }
  if (content && content.includes("'use client'")) return 'client-component';
  if (p.startsWith('lib/') || p.startsWith('utils/')) return 'util';
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

  // 2. Add 1-hop imported types, hooks, and lib utilities
  for (const path of Array.from(selectedSet)) {
    const card = repoIndex.find((f) => f.path === path);
    if (!card) continue;

    for (const imp of card.imports) {
      if (imp.startsWith('@/') || imp.startsWith('./') || imp.startsWith('../')) {
        // Find matching file in repo index
        const cleanImp = imp.replace(/^@\//, '');
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
