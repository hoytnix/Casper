export type IngestionMode = 'agentic' | 'idea' | 'btw';

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

export type DetectedFramework = 'nextjs' | 'hono' | 'vite' | 'unknown';

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
  detectedFramework?: DetectedFramework;
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
  cachedInputCostPerMillion?: number;
  outputCostPerMillion: number;
}

export interface ModelCostDetails {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  inputCostUsd: number;
  outputCostUsd: number;
  cachedInputCostUsd?: number;
  totalCostUsd: number;
  modelName: string;
  cacheHitRate?: number;
}

export interface IngestionSnapshot {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  totalTreeBlobs: number;
  includedFilesCount: number;
  estimatedTokens: number;
  estimatedInputTokens?: number;
  measuredInputTokens?: number;
  cachedInputTokens?: number;
  cachedInputCostUsd?: number;
  cacheHitRate?: number;
  charCount: number;
  timestamp: number;
  treeListing: string;
  files: SourceFile[];
  detectedFramework?: DetectedFramework;
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
  imageCount?: number;
  imageBytes?: number;
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

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: ImageMime;
  sizeBytes: number;
  width?: number;
  height?: number;
  dataUrl: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isMinimized?: boolean;
  thinkingContent?: string;
  thinkingLevel?: ThinkingLevel;
  costDetails?: ModelCostDetails;
  suggestedRefactors?: string[];
  images?: ImageAttachment[];
  imageTokensCount?: number;
  snapshotMeta?: {
    filesCount: number;
    tokensCount: number; // Represents Input Context Tokens
    inputTokensCount?: number;
    outputTokensCount?: number;
    estimatedInputTokens?: number;
    measuredInputTokens?: number;
    cachedInputTokens?: number;
    cachedInputCostUsd?: number;
    cacheHitRate?: number;
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
    thinkingLevel?: ThinkingLevel;
    costDetails?: ModelCostDetails;
    inputTokens?: number;
    outputTokens?: number;
    totalCostUsd?: number;
    modelPricing?: ModelPricingTier;
    ideas?: IdeaItem[];
    btwAnswer?: BtwAnswer;
    suggestedRefactors?: string[];
    imageCount?: number;
    imageBytes?: number;
    compileId?: string;
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
  museApiKey?: string;
  searchGrounding?: boolean;
  searchContextSize?: SearchContextSize;
  thinkingLevel?: ThinkingLevel;
  thinkingSummaries?: ThinkingSummaryMode;
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
  estimatedInputTokens?: number;
  measuredInputTokens?: number;
  cachedInputTokens?: number;
  cachedInputCostUsd?: number;
  cacheHitRate?: number;
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
  thinkingLevel?: ThinkingLevel;
  thinkingLogs?: string[];
  costDetails?: ModelCostDetails;
  inputTokens?: number;
  outputTokens?: number;
  progressPercent?: number;
  activeImageCount?: number;
  compileId?: string;
}

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
    | 'vite-entry'
    | 'vite-config'
    | 'vite-component'
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

export type MuseThinkingLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type GeminiThinkingLevel = 'low' | 'medium' | 'high';
export type ThinkingLevel = MuseThinkingLevel;
export type ThinkingSummaryMode = 'auto' | 'enabled' | 'disabled';
export type SearchContextSize = 'low' | 'medium' | 'high';

export interface ThinkingConfig {
  thinkingLevel: ThinkingLevel;
  thinkingSummaries: ThinkingSummaryMode;
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

export type TransactionType = 'expense' | 'income';

export interface TokenCostRecord {
  id: string;
  repoName: string; // e.g. owner/repo or session title
  modelName: string; // e.g. gemini-4-argon, gemini-2.5-pro, gemini-3.8-flash
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cachedInputCostUsd?: number;
  totalCostUsd: number;
  date: string; // ISO string YYYY-MM-DD
  notes?: string;
  title?: string;
  amount?: number;
  category?: string;
  type?: TransactionType;
}

export interface TokenCostSummary {
  totalSpentUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedInputTokens: number;
  totalCachedCostUsd: number;
  totalRuns: number;
  byModel: Record<string, { cost: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; cachedInputCostUsd: number; runs: number }>;
  historicalTrend: {
    date: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    runs: number;
    amount?: number;
    expenseAmount?: number;
    incomeAmount?: number;
  }[];
}

export interface SuggestedDirective {
  id: string;
  title: string;
  prompt: string;
  rationale: string;
  anchorPaths: string[];
  engine: string;
}

export interface DirectiveGenerationContext {
  repoLabel: string;
  fileCount: number;
  roles: Record<string, number>;
  graphSummary: string;
  relatedPaths: string[];
}

export type DirectiveGenerationStatus = 'idle' | 'generating' | 'ready' | 'fallback' | 'error';

// Backwards compatibility aliases
export type Transaction = TokenCostRecord;
export type SpendingSummary = TokenCostSummary;

