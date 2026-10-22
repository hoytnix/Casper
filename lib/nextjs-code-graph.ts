import { SourceFile } from '@/types';

export interface CodeSymbol {
  name: string;
  type: 'function' | 'component' | 'hook' | 'server-action' | 'route-handler' | 'constant';
  filePath: string;
  line: number;
  calls: string[];
  renders: string[];
  isExported: boolean;
  httpMethod?: string;
}

export interface NextJsCodeGraph {
  symbols: Record<string, CodeSymbol>;
  fileToSymbols: Record<string, string[]>;
  callEdges: { from: string; to: string; filePath: string }[];
  renderEdges: { parentComponent: string; childComponent: string; filePath: string }[];
  routeMap: {
    routeHandlers: { path: string; methods: string[]; symbols: string[] }[];
    pages: { path: string; components: string[] }[];
  };
}

export function buildNextJsCodeGraph(files: SourceFile[]): NextJsCodeGraph {
  const symbols: Record<string, CodeSymbol> = {};
  const fileToSymbols: Record<string, string[]> = {};
  const callEdges: { from: string; to: string; filePath: string }[] = [];
  const renderEdges: { parentComponent: string; childComponent: string; filePath: string }[] = [];
  
  const routeHandlersMap: Map<string, { methods: string[]; symbols: string[] }> = new Map();
  const pagesMap: Map<string, string[]> = new Map();

  for (const file of files) {
    const lines = file.content.split('\n');
    const fileSymbols: string[] = [];
    const isRouteHandler = file.path.includes('route.ts') || file.path.includes('route.js');
    const isPage = file.path.includes('page.tsx') || file.path.includes('page.jsx');
    const hasUseServer = file.content.includes("'use server'") || file.content.includes('"use server"');
    const isHonoFile =
      file.content.includes("from 'hono'") ||
      file.content.includes('from "hono"') ||
      file.content.includes('hono/zod-validator') ||
      file.content.includes('hono/client') ||
      file.content.includes('new Hono(');

    const routeMethods: string[] = [];
    const pageComponents: string[] = [];

    let currentSymbolKey: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/);
      const constFuncMatch = line.match(/(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/);
      const constAssignMatch = line.match(/(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?function/);

      let detectedName: string | null = null;
      let isExported = line.includes('export');

      if (funcMatch) detectedName = funcMatch[1];
      else if (constFuncMatch) detectedName = constFuncMatch[1];
      else if (constAssignMatch) detectedName = constAssignMatch[1];

      if (isRouteHandler && (line.includes('export async function GET') || line.includes('export function GET'))) {
        detectedName = 'GET';
        routeMethods.push('GET');
      } else if (isRouteHandler && (line.includes('export async function POST') || line.includes('export function POST'))) {
        detectedName = 'POST';
        routeMethods.push('POST');
      } else if (isRouteHandler && (line.includes('export async function PUT') || line.includes('export function PUT'))) {
        detectedName = 'PUT';
        routeMethods.push('PUT');
      } else if (isRouteHandler && (line.includes('export async function DELETE') || line.includes('export function DELETE'))) {
        detectedName = 'DELETE';
        routeMethods.push('DELETE');
      }

      // Hono route handler chains: app.get('/path', ...), app.post(...),
      // app.route('/base', subApp), app.use(middleware) — framework-agnostic
      // endpoint cartography alongside Next.js App Router conventions.
      let isHonoRouteSymbol = false;
      if (isHonoFile || isRouteHandler) {
        const honoRouteMatch = line.match(/\.((?:get|post|put|delete|patch|options|head|all|use|route))\s*\(\s*['"`]([^'"`]+)['"`]/i);
        if (honoRouteMatch) {
          const method = honoRouteMatch[1].toUpperCase();
          const routePath = honoRouteMatch[2];
          if (!routeMethods.includes(method)) {
            routeMethods.push(method);
          }
          if (!detectedName) {
            detectedName = `${method} ${routePath}`;
            isExported = true;
            isHonoRouteSymbol = true;
          }
        } else if (isHonoFile) {
          const honoBareMatch = line.match(/\.((?:get|post|put|delete|patch|options|head|all))\s*\(/i);
          if (honoBareMatch && !detectedName) {
            const method = honoBareMatch[1].toUpperCase();
            if (!routeMethods.includes(method)) {
              routeMethods.push(method);
            }
          }
        }
      }

      if (detectedName) {
        let type: CodeSymbol['type'] = 'function';
        if (isHonoRouteSymbol) {
          type = 'route-handler';
        } else if (isRouteHandler && ['GET', 'POST', 'PUT', 'DELETE'].includes(detectedName)) {
          type = 'route-handler';
        } else if (hasUseServer || file.path.includes('action')) {
          type = 'server-action';
        } else if (detectedName.startsWith('use') && detectedName.length > 3 && detectedName[3] === detectedName[3].toUpperCase()) {
          type = 'hook';
        } else if (/^[A-Z]/.test(detectedName) && (file.path.endsWith('.tsx') || file.path.endsWith('.jsx'))) {
          type = 'component';
          pageComponents.push(detectedName);
        }

        let symbolKey = `${file.path}#${detectedName}`;
        if (symbols[symbolKey]) {
          symbolKey = `${file.path}#${detectedName}:${lineNum}`;
        }
        const symbol: CodeSymbol = {
          name: detectedName,
          type,
          filePath: file.path,
          line: lineNum,
          calls: [],
          renders: [],
          isExported,
          httpMethod:
            type === 'route-handler'
              ? isHonoRouteSymbol
                ? detectedName.split(' ')[0]
                : detectedName
              : undefined,
        };

        symbols[symbolKey] = symbol;
        fileSymbols.push(symbolKey);
        currentSymbolKey = symbolKey;
      }

      const callMatches = line.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
      for (const cm of callMatches) {
        const calledName = cm[1];
        if (!['if', 'for', 'while', 'switch', 'catch', 'map', 'filter', 'reduce', 'forEach', 'some', 'every'].includes(calledName)) {
          if (currentSymbolKey && symbols[currentSymbolKey]) {
            if (!symbols[currentSymbolKey].calls.includes(calledName)) {
              symbols[currentSymbolKey].calls.push(calledName);
            }
            callEdges.push({ from: currentSymbolKey, to: calledName, filePath: file.path });
          }
        }
      }

      const jsxMatches = line.matchAll(/<([A-Z][a-zA-Z0-9_]+)\b/g);
      for (const jm of jsxMatches) {
        const childComp = jm[1];
        if (currentSymbolKey && symbols[currentSymbolKey] && symbols[currentSymbolKey].type === 'component') {
          if (!symbols[currentSymbolKey].renders.includes(childComp)) {
            symbols[currentSymbolKey].renders.push(childComp);
          }
          renderEdges.push({
            parentComponent: symbols[currentSymbolKey].name,
            childComponent: childComp,
            filePath: file.path,
          });
        }
      }
    }

    fileToSymbols[file.path] = fileSymbols;

    if ((isRouteHandler || isHonoFile) && routeMethods.length > 0) {
      routeHandlersMap.set(file.path, {
        methods: Array.from(new Set(routeMethods)),
        symbols: fileSymbols,
      });
    }

    if (isPage && pageComponents.length > 0) {
      pagesMap.set(file.path, pageComponents);
    }
  }

  const routeHandlers = Array.from(routeHandlersMap.entries()).map(([path, data]) => ({
    path,
    methods: data.methods,
    symbols: data.symbols,
  }));

  const pages = Array.from(pagesMap.entries()).map(([path, components]) => ({
    path,
    components,
  }));

  return {
    symbols,
    fileToSymbols,
    callEdges,
    renderEdges,
    routeMap: {
      routeHandlers,
      pages,
    },
  };
}

export function serializeCodeGraphForPrompt(graph: NextJsCodeGraph): string {
  const symbolCount = Object.keys(graph.symbols).length;
  const renderCount = graph.renderEdges.length;
  const routeCount = graph.routeMap.routeHandlers.length;
  const pageCount = graph.routeMap.pages.length;

  let summary = `=== FUNCTION & COMPONENT CODE GRAPH (Next.js + Hono) ===\n`;
  summary += `Total Symbols: ${symbolCount} | Route Handlers: ${routeCount} | Pages: ${pageCount} | Render Edges: ${renderCount}\n\n`;

  if (graph.routeMap.routeHandlers.length > 0) {
    summary += `--- API ROUTE HANDLERS (Next.js route.ts + Hono endpoints) ---\n`;
    for (const rh of graph.routeMap.routeHandlers) {
      summary += `  • @[/${rh.path}] [Methods: ${rh.methods.join(', ')}]\n`;
    }
    summary += `\n`;
  }

  if (graph.routeMap.pages.length > 0) {
    summary += `--- APP PAGES & RENDERED COMPONENTS ---\n`;
    for (const pg of graph.routeMap.pages) {
      summary += `  • @[/${pg.path}] -> Components: ${pg.components.join(', ') || 'none'}\n`;
    }
    summary += `\n`;
  }

  summary += `--- KEY EXPORTED SYMBOLS & HOOKS ---\n`;
  let shown = 0;
  for (const [key, sym] of Object.entries(graph.symbols)) {
    if (sym.isExported && shown < 25) {
      summary += `  • ${sym.type} [${sym.name}] in @[/${sym.filePath}] (calls: ${sym.calls.slice(0, 4).join(', ') || 'none'}, renders: ${sym.renders.slice(0, 3).join(', ') || 'none'})\n`;
      shown++;
    }
  }

  return summary;
}

export function traceDependencies(
  symbolOrPath: string,
  graph: NextJsCodeGraph
): {
  target: string;
  oneHop: string[];
  twoHop: string[];
  outgoingCalls: string[];
  incomingCallers: string[];
  renderedComponents: string[];
  summary: string;
} {
  const target = symbolOrPath.replace(/^\//, '');
  const outgoingCalls = new Set<string>();
  const incomingCallers = new Set<string>();
  const renderedComponents = new Set<string>();

  const matchingSymbolKeys = Object.keys(graph.symbols).filter(
    (k) => k.includes(target) || graph.symbols[k].name.toLowerCase() === target.toLowerCase()
  );

  for (const skey of matchingSymbolKeys) {
    const sym = graph.symbols[skey];
    sym.calls.forEach((c) => outgoingCalls.add(c));
    sym.renders.forEach((r) => renderedComponents.add(r));
  }

  for (const edge of graph.callEdges) {
    if (edge.to.toLowerCase() === target.toLowerCase() || matchingSymbolKeys.includes(edge.to)) {
      incomingCallers.add(edge.from);
    }
  }

  const oneHop = Array.from(new Set([...outgoingCalls, ...incomingCallers, ...renderedComponents]));
  const twoHop = new Set<string>();

  for (const hop of oneHop) {
    const subSymKeys = Object.keys(graph.symbols).filter((k) => k.includes(hop) || graph.symbols[k].name === hop);
    for (const skey of subSymKeys) {
      const sym = graph.symbols[skey];
      sym.calls.forEach((c) => {
        if (!oneHop.includes(c) && c !== target) twoHop.add(c);
      });
      sym.renders.forEach((r) => {
        if (!oneHop.includes(r) && r !== target) twoHop.add(r);
      });
    }
  }

  const hop2Array = Array.from(twoHop);

  const summary = `Relationship Trace for "${symbolOrPath}":\n` +
    `  • Matching Symbols: ${matchingSymbolKeys.length}\n` +
    `  • 1-Hop Connected (Calls/Renders/CalledBy): ${oneHop.join(', ') || 'none'}\n` +
    `  • 2-Hop Expanded Reach: ${hop2Array.slice(0, 10).join(', ') || 'none'}`;

  return {
    target,
    oneHop,
    twoHop: hop2Array,
    outgoingCalls: Array.from(outgoingCalls),
    incomingCallers: Array.from(incomingCallers),
    renderedComponents: Array.from(renderedComponents),
    summary,
  };
}
