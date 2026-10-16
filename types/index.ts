export type IngestionMode = 'agentic' | 'full' | 'idea' | 'btw';

export interface VRINEScore {
  value: number; // 1-10
  relativity: number; // 1-10
  inimitability: number; // 1-10
  nonSubstitutability: number; // 1-10
  engineOptimization: number; // 1-10
  total: number;
}

export interface RICEScore {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  score: number;
}

export interface IdeaItem {
  id: string;
  title: string;
  category: 'Feature' | 'Performance' | 'Architecture' | 'DX' | 'Security';
  description: string;
  rice: RICEScore;
  vrinEo: VRINEScore;
  compositeRank: number;
  implementationHint: string;
  targetedFiles: string[];
}

export interface BtwAnswer {
  question: string;
  answerMarkdown: string;
  referencedFiles: string[];
  confidenceScore: number;
}

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
  preferredMode?: IngestionMode;
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

export interface ModelPricingTier {
  name: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface ModelCostDetails {
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  modelName: string;
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
  mode?: IngestionMode;
  explorationTrail?: ExplorationStep[];
  toolTraces?: RouterToolTrace[];
  costDetails?: ModelCostDetails;
  inputTokens?: number;
  outputTokens?: number;
  totalCostUsd?: number;
  modelPricing?: ModelPricingTier;
  ideas?: IdeaItem[];
  btwAnswer?: BtwAnswer;
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
  costDetails?: ModelCostDetails;
  suggestedRefactors?: string[];
  snapshotMeta?: {
    filesCount: number;
    tokensCount: number; // Represents Input Context Tokens
    inputTokensCount?: number;
    outputTokensCount?: number;
    commitSha: string;
    branch: string;
    modelUsed?: string;
    fallbackPass?: number;
    mode?: IngestionMode;
    explorationTrail?: ExplorationStep[];
    routerEngine?: string;
    routerLatencyMs?: number;
    toolTraces?: RouterToolTrace[];
    thinkingContent?: string;
    costDetails?: ModelCostDetails;
    inputTokens?: number;
    outputTokens?: number;
    totalCostUsd?: number;
    modelPricing?: ModelPricingTier;
    ideas?: IdeaItem[];
    btwAnswer?: BtwAnswer;
    suggestedRefactors?: string[];
  };
}

export interface ModelConfig {
  id: string;
  name: string;
  tag: string;
  description: string;
  enabled: boolean;
  priority: number;
  inputPricing?: string;
  outputPricing?: string;
}

export interface AppSettings {
  githubPat?: string;
  customApiKey?: string;
  preferredModel?: string;
  defaultMode?: IngestionMode;
  maxAgenticRounds?: number;
  routerEngine?: RouterEngineType;
  models?: ModelConfig[];
  requestTimeout?: number;
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
  costDetails?: ModelCostDetails;
  inputTokens?: number;
  outputTokens?: number;
  progressPercent?: number;
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
  | 'suggested_refactors'
  | 'error' 
  | 'done';



