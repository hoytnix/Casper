import { SourceFile, DetectedFramework } from '@/types';

/**
 * Robust framework auto-detection engine.
 * Inspects package.json dependencies, framework config files, and
 * directory-tree patterns to classify a repository as Next.js or Hono.
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

  const hasHonoImport = safeFiles.some(
    (f) =>
      f?.content &&
      (f.content.includes("from 'hono'") ||
        f.content.includes('from "hono"') ||
        f.content.includes('require("hono")') ||
        f.content.includes("require('hono')") ||
        f.content.includes('new Hono(') ||
        f.content.includes('hono/zod-validator') ||
        f.content.includes('hono/client'))
  );

  const hasHonoRouteCall = safeFiles.some(
    (f) =>
      f?.content &&
      /\.\s*(get|post|put|delete|patch|options|head|all|use|route)\s*\(\s*['"`/]/.test(
        f.content
      ) &&
      (f.content.includes('hono') ||
        f.content.includes('new Hono(') ||
        f.content.includes('Hono('))
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
      if ('hono' in deps || 'hono/zod-validator' in deps) return 'hono';
      if ('next' in deps) return 'nextjs';
    } catch {
      // Malformed package.json: fall back to raw substring scan.
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
  return 'Unknown Framework';
}
