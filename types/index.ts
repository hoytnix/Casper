export interface Repo {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  description: string;
  stars: number;
  lastSyncedAt: number | null;
  defaultBranch: string;
  isPrivate: boolean;
  excludedPatterns?: string[];
  preferredMode?: 'agentic' | 'full';
}

export interface GitTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
}

export interface SourceFile {
  path: string;
  content: string;
  size: number;
}

export interface IngestionSnapshot {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  totalTreeBlobs: number;
  includedFilesCount: number;
  estimatedTokens: number;
  charCount: number;
  timestamp: number;
  treeListing: string;
  files: SourceFile[];
  mode?: 'agentic' | 'full';
  explorationTrail?: ExplorationStep[];
}

export interface RouterToolTrace {
  id: string;
  tool: 'grep' | 'find' | 'head_tail' | 'inspect_graph';
  args: any;
  outputSummary: string;
  durationMs: number;
  timestamp: number;
}

export interface ExplorationStep {
  id: string;
  round: number;
  paths: string[];
  reason?: string;
  timestamp: number;
  status: 'investigating' | 'completed' | 'error';
  filesSummary?: { path: string; size: number }[];
  toolTraces?: RouterToolTrace[];
}

export interface RoutingResult {
  selectedPaths: string[];
  engineUsed: 'Gemini Nano' | 'Arctic-Embed-XS' | 'Fallback Keyword' | 'Qwen2.5-Coder-0.5B' | 'Qwen2.5-Coder-1.5B' | string;
  latencyMs: number;
  scores?: Record<string, number>;
  toolTraces?: RouterToolTrace[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  thinkingContent?: string;
  snapshotMeta?: {
    filesCount: number;
    tokensCount: number;
    commitSha: string;
    branch: string;
    modelUsed?: string;
    fallbackPass?: number;
    mode?: 'agentic' | 'full';
    explorationTrail?: ExplorationStep[];
    routerEngine?: string;
    routerLatencyMs?: number;
    toolTraces?: RouterToolTrace[];
    thinkingContent?: string;
  };
}

export interface AppSettings {
  githubPat: string;
  customApiKey?: string;
  preferredModel?: string;
  defaultMode?: 'agentic' | 'full';
  maxAgenticRounds?: number;
  routerEngine?: RouterEngineType;
}

export interface IngestionProgress {
  step:
    | 'idle'
    | 'fetching_tree'
    | 'downloading_files'
    | 'agentic_exploring'
    | 'compiling_prompt'
    | 'completed'
    | 'error';
  message: string;
  totalFiles?: number;
  loadedFiles?: number;
  error?: string;
  currentRound?: number;
  maxRounds?: number;
  activePaths?: string[];
  explorationTrail?: ExplorationStep[];
  toolTraces?: RouterToolTrace[];
  thinkingContent?: string;
  thinkingLogs?: string[];
}

export interface NextJsFileCard {
  path: string;
  role:
    | 'app-page'
    | 'app-layout'
    | 'route-handler'
    | 'server-action'
    | 'middleware'
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

export type RouterEngineType = 
  | 'auto' 
  | 'gemini-nano-only' 
  | 'arctic-embed-xs-only' 
  | 'qwen-0.5b-coder-mlc' 
  | 'qwen-1.5b-coder-mlc';

export interface ThinkingConfig {
  thinkingLevel: 'low' | 'medium' | 'high';
  thinkingSummaries: 'auto' | 'enabled' | 'disabled';
}

export type SSEEventType = 
  | 'step' 
  | 'agent_start'
  | 'agent_round'
  | 'agent_inspect'
  | 'agent_files_loaded'
  | 'compiling_start'
  | 'thinking_start' 
  | 'thinking_chunk' 
  | 'thinking_end' 
  | 'prompt_chunk'
  | 'error' 
  | 'done';



