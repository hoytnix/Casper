import type { SourceFile, DetectedFramework } from '@/types';

// Matches a REAL Hono module import — `import { Hono } from 'hono'`,
// `import 'hono/validator'`, `require('hono')` — anchored to import/require
// statement syntax. Bare prose mentions ("mention hono/zod-validator in
// docs") must NOT match: this repo's own compile-route system prompt
// embeds Hono vocabulary, and substring scanning self-poisons on it.
const HONO_BINDING_RE = String.raw`(?:const|let|var)\s+(?:[\w$]+|\{[^}]*\}|\[[^\]]*\])\s*=\s*`;
const HONO_IMPORT_STATEMENT_RE = new RegExp(
  `(?:^\\s*import\\b[^;]*?\\bfrom\\s*['"]hono(?:\\/[^'"]*)?['"]` +
    `|^\\s*import\\s*['"]hono(?:\\/[^'"]*)?['"]` +
    `|^\\s*(?:${HONO_BINDING_RE})?require\\(\\s*['"]hono(?:\\/[^'"]*)?['"]\\s*\\))`,
  'm'
);

// Matches genuine Hono app construction (`const app = new Hono()` at
// statement start), not prose ("call new Hono()") and not code quoted
// inside another file's string literals (e.g. `*.test.ts` fixtures, which
// embed Hono samples mid-line and ship in ingestion snapshots).
const HONO_CONSTRUCT_RE = /^\s*(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=\s*new\s+Hono\s*\(/m;

export function hasHonoImportStatement(content?: string): boolean {
  if (!content) return false;
  return HONO_IMPORT_STATEMENT_RE.test(content) || HONO_CONSTRUCT_RE.test(content);
}

/**
 * Robust framework auto-detection engine.
 * Inspects package.json dependencies, framework config files, and
 * directory-tree patterns to classify a repository as Next.js, Hono, or Vite.
 * Framework-agnostic by design: returns 'unknown' when no indicator matches
 * instead of assuming every repository is a Next.js App Router project.
 */
export function detectRepositoryFramework(
  files: SourceFile[],
  treePaths?: string[]
): DetectedFramework {
  const safeFiles = Array.isArray(files) ? files : [];
  const filePaths = safeFiles.map((f) => (f?.path || '').toLowerCase());
  const extraPaths = Array.isArray(treePaths)
    ? treePaths.map((p) => (p || '').toLowerCase())
    : [];
  const allPaths = filePaths.concat(extraPaths);

  const hasViteConfig = allPaths.some(
    (p) => p.includes('vite.config.') || p === 'vite.config'
  );
  const hasIndexHtml = allPaths.some(
    (p) => p === 'index.html' || p.endsWith('/index.html')
  );
  const hasViteImport = safeFiles.some(
    (f) =>
      f?.content &&
      (f.content.includes("from 'vite'") ||
        f.content.includes('from "vite"') ||
        f.content.includes("from 'vite/") ||
        f.content.includes('from "vite/'))
  );

  if (hasViteConfig || (hasIndexHtml && hasViteImport)) {
    return 'vite';
  }

  const hasNextConfig = allPaths.some(
    (p) => p.includes('next.config.') || p === 'next.config'
  );
  const hasAppDir = allPaths.some(
    (p) => p.includes('app/layout.') || p.includes('app/page.')
  );
  const hasPagesDir = allPaths.some(
    (p) => p.includes('pages/index.') || p.includes('pages/_app.')
  );

  const hasWrangler = allPaths.some(
    (p) => p.includes('wrangler.json') || p.includes('wrangler.toml')
  );
  const hasHonoPathHint = allPaths.some(
    (p) =>
      p.includes('src/routes/') ||
      p.includes('/routes/') ||
      p.includes('src/index.ts') ||
      p.includes('src/app.ts') ||
      p === 'index.ts' ||
      p === 'app.ts'
  );

  // Statement-shaped import evidence only: bare prose mentions of Hono
  // vocabulary (docs, comments, embedded prompt strings) must not flip the
  // verdict — this repo's own compile route embeds such strings.
  const hasHonoImport = safeFiles.some(
    (f) => f?.content && hasHonoImportStatement(f.content)
  );

  // Route-call chains count only in files that also carry a real Hono
  // import: `headers.get('content-type')` is a Web API, not a router.
  const hasHonoRouteCall = safeFiles.some(
    (f) =>
      f?.content &&
      hasHonoImportStatement(f.content) &&
      /\.\s*(get|post|put|delete|patch|options|head|all|use|route)\s*\(\s*['"`/]/.test(
        f.content
      )
  );

  if (hasHonoImport || hasHonoRouteCall || hasWrangler) {
    // A Next.js config alongside Hono markers means a hybrid repo;
    // Hono backend markers win for cartography purposes.
    void hasHonoPathHint;
    return 'hono';
  }

  if (hasNextConfig || hasAppDir || hasPagesDir) {
    return 'nextjs';
  }

  // Fallback: scan package.json dependency fields directly.
  const pkgFile = safeFiles.find((f) => f?.path?.endsWith('package.json'));
  if (pkgFile?.content) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      const deps: Record<string, string> = {
        ...(pkg?.dependencies || {}),
        ...(pkg?.devDependencies || {}),
        ...(pkg?.peerDependencies || {}),
      };
      if ('vite' in deps || '@vitejs/plugin-react' in deps) return 'vite';
      if ('hono' in deps || 'hono/zod-validator' in deps) return 'hono';
      if ('next' in deps) return 'nextjs';
    } catch {
      // Malformed package.json: fall back to raw substring scan.
      if (pkgFile.content.includes('"vite"')) return 'vite';
      if (pkgFile.content.includes('"hono"')) return 'hono';
      if (pkgFile.content.includes('"next"')) return 'nextjs';
    }
  }

  return 'unknown';
}

/** Human-readable label for the workspace framework badge. */
export function frameworkBadgeLabel(framework: DetectedFramework): string {
  if (framework === 'hono') return 'Hono Edge Router';
  if (framework === 'nextjs') return 'Next.js App Router';
  if (framework === 'vite') return 'Vite SPA & SSR';
  return 'Unknown Framework';
}
