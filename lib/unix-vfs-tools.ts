import { SourceFile, NextJsFileCard } from '@/types';
import { buildNextJsRepoIndex } from './nextjs-indexer';
import { buildNextJsCodeGraph, traceDependencies, NextJsCodeGraph, serializeCodeGraphForPrompt } from './nextjs-code-graph';

export interface FindFilesArgs {
  pattern?: string;
  directory?: string;
  role?: NextJsFileCard['role'];
  maxResults?: number;
}

export interface GrepFilesArgs {
  pattern: string;
  pathPrefix?: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  maxMatches?: number;
}

export interface ReadLinesArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface InspectGraphArgs {
  path: string;
}

export interface TraceCallGraphArgs {
  symbol: string;
}

export interface FindRelatedSymbolsArgs {
  query: string;
}

const SKIP_FILES_REGEX = /(bun\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.(png|jpg|jpeg|webp|gif|ico|svg|woff|woff2|ttf|eot|pdf|zip|tar|gz|wasm|mp4|mp3))$/i;

export function findFiles(
  args: FindFilesArgs,
  files: SourceFile[],
  repoIndex?: NextJsFileCard[]
): { matches: string[]; count: number; summary: string } {
  const index = repoIndex || buildNextJsRepoIndex(files);
  const maxResults = args.maxResults || 20;
  const pattern = (args.pattern || '').toLowerCase();
  const directory = (args.directory || '').toLowerCase();
  const role = args.role;

  const matched = index.filter((card) => {
    const p = card.path.toLowerCase();
    if (SKIP_FILES_REGEX.test(p)) return false;

    if (directory && !p.startsWith(directory) && !p.includes(`/${directory}`)) {
      return false;
    }
    if (role && card.role !== role) {
      return false;
    }
    if (pattern) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      const matchesPattern = new RegExp(regexPattern, 'i').test(card.path) || p.includes(pattern);
      if (!matchesPattern) return false;
    }
    return true;
  });

  const sliced = matched.slice(0, maxResults);
  const matches = sliced.map((m) => m.path);
  const summary = `Found ${matched.length} files matching find query (showing top ${sliced.length}):\n` +
    sliced.map((m) => `  - ${m.path} [${m.role}]`).join('\n');

  return { matches, count: matched.length, summary };
}

export function grepFiles(
  args: GrepFilesArgs,
  files: SourceFile[]
): { results: string[]; count: number; summary: string } {
  const pattern = args.pattern || '';
  const pathPrefix = (args.pathPrefix || '').toLowerCase();
  const caseSensitive = Boolean(args.caseSensitive);
  const maxMatches = args.maxMatches || 25;

  if (!pattern) {
    return { results: [], count: 0, summary: 'Error: empty pattern for grep' };
  }

  let regex: RegExp;
  try {
    regex = args.isRegex
      ? new RegExp(pattern, caseSensitive ? 'g' : 'gi')
      : new RegExp(escapeRegExp(pattern), caseSensitive ? 'g' : 'gi');
  } catch {
    regex = new RegExp(escapeRegExp(pattern), caseSensitive ? 'g' : 'gi');
  }

  const results: string[] = [];
  let totalMatches = 0;

  for (const file of files) {
    if (SKIP_FILES_REGEX.test(file.path)) continue;
    if (pathPrefix && !file.path.toLowerCase().startsWith(pathPrefix) && !file.path.toLowerCase().includes(pathPrefix)) {
      continue;
    }

    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (regex.test(line)) {
        totalMatches++;
        if (results.length < maxMatches) {
          results.push(`${file.path}:${i + 1}: ${line.trim()}`);
        }
      }
      regex.lastIndex = 0;
    }
  }

  const summary = `Grep "${pattern}" matched ${totalMatches} lines across repository (showing top ${results.length}):\n` +
    results.map((r) => `  ${r}`).join('\n');

  return { results, count: totalMatches, summary };
}

export function readLines(
  args: ReadLinesArgs,
  files: SourceFile[]
): { content: string; totalLines: number; summary: string } {
  const targetPath = args.path.replace(/^\//, '');
  const startLine = Math.max(1, args.startLine || 1);
  const endLine = Math.min(startLine + 50, args.endLine || 40);

  const file = files.find((f) => f.path.replace(/^\//, '') === targetPath || f.path.endsWith(targetPath));
  if (!file) {
    return { content: '', totalLines: 0, summary: `File not found: ${args.path}` };
  }

  const lines = file.content.split('\n');
  const slice = lines.slice(startLine - 1, endLine);
  const numbered = slice.map((line, idx) => `${startLine + idx}: ${line}`).join('\n');
  const summary = `File @[/${file.path}] (lines ${startLine}-${startLine + slice.length - 1} of ${lines.length}):\n${numbered}`;

  return { content: numbered, totalLines: lines.length, summary };
}

export function inspectGraph(
  args: InspectGraphArgs,
  files: SourceFile[],
  repoIndex?: NextJsFileCard[]
): { role: string; exports: string[]; imports: string[]; importedBy: string[]; summary: string } {
  const targetPath = args.path.replace(/^\//, '');
  const index = repoIndex || buildNextJsRepoIndex(files);

  const card = index.find((f) => f.path.replace(/^\//, '') === targetPath || f.path.endsWith(targetPath));
  if (!card) {
    return { role: 'unknown', exports: [], imports: [], importedBy: [], summary: `File card not found for ${args.path}` };
  }

  const importedBy: string[] = [];
  const baseName = card.path.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';

  for (const other of index) {
    if (other.path === card.path) continue;
    for (const imp of other.imports) {
      if (
        imp.includes(card.path) ||
        imp.includes(baseName) ||
        (imp.startsWith('@/') && card.path.includes(imp.replace('@/', '')))
      ) {
        if (!importedBy.includes(other.path)) {
          importedBy.push(other.path);
        }
      }
    }
  }

  const summary = `Graph Inspection for @[/${card.path}]:\n` +
    `  Role: ${card.role}\n` +
    `  Exports: ${card.exports.join(', ') || 'none'}\n` +
    `  Direct Imports: ${card.imports.join(', ') || 'none'}\n` +
    `  Imported By (${importedBy.length} files): ${importedBy.join(', ') || 'none'}`;

  return {
    role: card.role,
    exports: card.exports,
    imports: card.imports,
    importedBy,
    summary,
  };
}

export function traceCallGraph(
  args: TraceCallGraphArgs,
  files: SourceFile[],
  repoIndex?: NextJsFileCard[],
  codeGraph?: NextJsCodeGraph
): { symbol: string; trace: ReturnType<typeof traceDependencies>; summary: string } {
  const symbol = args.symbol || '';
  const graph = codeGraph || buildNextJsCodeGraph(files);
  const trace = traceDependencies(symbol, graph);
  return {
    symbol,
    trace,
    summary: trace.summary,
  };
}

export function getNextJsRouteMap(
  files: SourceFile[],
  codeGraph?: NextJsCodeGraph
): { routeMap: NextJsCodeGraph['routeMap']; summary: string } {
  const graph = codeGraph || buildNextJsCodeGraph(files);
  const summary = serializeCodeGraphForPrompt(graph);
  return {
    routeMap: graph.routeMap,
    summary,
  };
}

export function findRelatedSymbols(
  args: FindRelatedSymbolsArgs,
  files: SourceFile[],
  repoIndex?: NextJsFileCard[],
  codeGraph?: NextJsCodeGraph
): { query: string; relatedPaths: string[]; relatedSymbols: string[]; summary: string } {
  const query = args.query || '';
  const graph = codeGraph || buildNextJsCodeGraph(files);
  const index = repoIndex || buildNextJsRepoIndex(files);
  const tokens = extractQueryTokensForUnix(query);

  const matchedPaths = new Set<string>();
  const matchedSymbols = new Set<string>();

  for (const comp of tokens.pascalComponents) {
    const trace = traceDependencies(comp, graph);
    if (trace.target) {
      matchedSymbols.add(comp);
      trace.oneHop.forEach((h) => matchedSymbols.add(h));
      for (const [fpath, syms] of Object.entries(graph.fileToSymbols)) {
        if (syms.some((s) => s.toLowerCase().includes(comp.toLowerCase()))) {
          matchedPaths.add(fpath);
        }
      }
    }
  }

  for (const kw of tokens.keywords) {
    const grepRes = grepFiles({ pattern: kw, maxMatches: 5 }, files);
    grepRes.results.forEach((r) => matchedPaths.add(r.split(':')[0]));
  }

  const relatedPathsArray = Array.from(matchedPaths);
  const relatedSymbolsArray = Array.from(matchedSymbols);

  const summary = `Related Symbols & Code Graph Search for "${query}":\n` +
    `  • Matching Symbols: ${relatedSymbolsArray.join(', ') || 'none'}\n` +
    `  • Connected Files: ${relatedPathsArray.join(', ') || 'none'}`;

  return {
    query,
    relatedPaths: relatedPathsArray,
    relatedSymbols: relatedSymbolsArray,
    summary,
  };
}

export function extractQueryTokensForUnix(userPrompt: string): {
  pascalComponents: string[];
  hooks: string[];
  apiRoutes: string[];
  keywords: string[];
} {
  const pascalComponents = Array.from(userPrompt.matchAll(/\b([A-Z][a-zA-Z0-9]+)\b/g)).map((m) => m[1]);
  const hooks = Array.from(userPrompt.matchAll(/\b(use[A-Z][a-zA-Z0-9]*)\b/g)).map((m) => m[1]);
  const apiRoutes = Array.from(userPrompt.matchAll(/\/api\/[a-zA-Z0-9_\-\/]+/g)).map((m) => m[0]);
  
  const words = userPrompt.replace(/[^a-zA-Z0-9_\s]/g, ' ').split(/\s+/);
  const keywords = Array.from(new Set(words.filter((w) => w.length > 3 && !['this', 'that', 'with', 'from', 'code', 'file', 'app'].includes(w.toLowerCase()))));

  return {
    pascalComponents: Array.from(new Set(pascalComponents)),
    hooks: Array.from(new Set(hooks)),
    apiRoutes: Array.from(new Set(apiRoutes)),
    keywords: keywords.slice(0, 10),
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
