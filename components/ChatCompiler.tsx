'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Copy,
  Check,
  Sparkles,
  User,
  Bot,
  RotateCcw,
  Layers,
  ChevronDown,
  ChevronUp,
  Compass,
  AlertTriangle,
  GitBranch,
  RefreshCw,
  Loader2,
  X,
  ImagePlus,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { ChatMessage, ImageAttachment, IngestionProgress, IngestionSnapshot, Repo, SuggestedDirective, DirectiveGenerationStatus } from '@/types';
import { StepLoader } from './StepLoader';
import { formatCompiledPrompt, extractSuggestedRefactors } from '@/lib/utils';
import { generateSuggestedDirectives } from '@/lib/local-context-router';
import {
  MAX_IMAGES_PER_MESSAGE,
  chatImagesSchema,
  clipboardItemsToFiles,
  fileToImageAttachment,
} from '@/lib/image-attachments';
import { loadCachedDirectives, saveCachedDirectives, loadDismissedPrompts, saveDismissedPrompt } from '@/hooks/useRepoStore';

interface ChatCompilerProps {
  repo: Repo;
  messages: ChatMessage[];
  progress: IngestionProgress;
  onSendMessage: (promptText: string, images?: ImageAttachment[]) => void;
  onClearChat: () => void;
  onDeleteMessage?: (id: string) => void;
  onRetryPrompt?: (promptText: string) => void;
  onToggleMinimize?: (id: string) => void;
  snapshot: IngestionSnapshot | null;
}

export const ChatCompiler: React.FC<ChatCompilerProps> = ({
  repo,
  messages,
  progress,
  onSendMessage,
  onClearChat,
  onDeleteMessage,
  onRetryPrompt,
  onToggleMinimize,
  snapshot,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTrails, setExpandedTrails] = useState<Set<string>>(new Set());
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [minimizedMsgs, setMinimizedMsgs] = useState<Set<string>>(new Set());
  const [directives, setDirectives] = useState<SuggestedDirective[]>([]);
  const [directiveStatus, setDirectiveStatus] = useState<DirectiveGenerationStatus>('idle');
  const [directiveEngine, setDirectiveEngine] = useState<string>('');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const directiveReqId = useRef(0);

  const toggleMinimize = (msgId: string) => {
    setMinimizedMsgs((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
    onToggleMinimize?.(msgId);
  };

  const isMsgMinimized = (msg: ChatMessage) =>
    msg.isMinimized ? !minimizedMsgs.has(msg.id) : minimizedMsgs.has(msg.id);

  const toggleThinking = (msgId: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const isHtmlCorrupted = (content: string): boolean => {
    if (!content) return false;
    const trimmed = content.trim().toLowerCase();
    return (
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<html') ||
      trimmed.includes('<title>starting server...</title>') ||
      trimmed.includes('please wait while your application starts')
    );
  };

  const toggleTrail = (msgId: string) => {
    setExpandedTrails((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const isBusy =
    progress.step !== 'idle' &&
    progress.step !== 'completed' &&
    progress.step !== 'error';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, progress]);

  // Synchronous submit lock: `isBusy` arrives via parent re-render
  // (async), so rapid double-click / double-Enter would otherwise fire
  // onSendMessage twice on the same stale closure. The ref guards the
  // event tick; the state mirrors it for the disabled button render.
  const submitLockRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || isBusy) return;
    if (!inputText.trim() && attachments.length === 0) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    onSendMessage(inputText.trim(), attachments.length > 0 ? attachments : undefined);
    setInputText('');
    setAttachments([]);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }, 300);
  };

  const ingestImageFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setImageError(null);
    const room = MAX_IMAGES_PER_MESSAGE - attachments.length;
    if (room <= 0) {
      setImageError(`Limit ${MAX_IMAGES_PER_MESSAGE} images per message — remove one first.`);
      return;
    }
    const accepted = files.slice(0, room);
    if (files.length > room) {
      setImageError(`Only ${room} more image${room === 1 ? '' : 's'} fit (limit ${MAX_IMAGES_PER_MESSAGE} at 5MB each).`);
    }
    for (const file of accepted) {
      try {
        const attachment = await fileToImageAttachment(file);
        setAttachments((prev) => {
          if (prev.length >= MAX_IMAGES_PER_MESSAGE) return prev;
          const checked = chatImagesSchema.safeParse([...prev, attachment]);
          if (!checked.success) {
            setImageError('Image rejected: exceeds size limits (5MB each, 7MB total).');
            return prev;
          }
          return [...prev, attachment];
        });
      } catch (err) {
        setImageError(err instanceof Error ? err.message : `Could not attach ${file.name}.`);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = clipboardItemsToFiles(e.clipboardData?.items);
    if (files.length === 0) return;
    // Image payload present: keep it out of the text, into attachments.
    e.preventDefault();
    void ingestImageFiles(files);
  };

  const handleRemoveImage = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error('Failed to copy prompt to clipboard:', e);
    }
  };

  const repoKey = `${repo.owner}/${repo.repo}/${repo.branch}`;
  const snapshotFilesKey = (snapshot?.files || []).length;

  const refreshDirectives = React.useCallback(async (isManual = false) => {
    const files = snapshot?.files || [];
    if (messages.length > 0 && !isManual) return;
    const reqId = ++directiveReqId.current;
    setDirectiveStatus('generating');
    try {
      // Instant hydrate from last-good cache, then refresh in background.
      if (!isManual) {
        const cached = loadCachedDirectives(repoKey);
        if (cached.length > 0 && reqId === directiveReqId.current) {
          setDirectives(cached);
        }
      }
      const dismissed = loadDismissedPrompts(repoKey);
      const seed = `${repo.owner}/${repo.repo}-${Date.now()}-${Math.random()}`;
      const result = await generateSuggestedDirectives(seed, files.slice(0, 40), `${repo.owner}/${repo.repo}-${repo.branch}`);
      if (reqId !== directiveReqId.current) return;
      const filtered = result.directives.filter(
        (d) => !dismissed.has(d.prompt.toLowerCase().trim())
      );
      const finalList = filtered.length > 0 ? filtered.slice(0, 4) : result.directives.slice(0, 4);
      setDirectives(finalList);
      setDirectiveEngine(result.engineUsed);
      setDirectiveStatus(result.engineUsed === 'Fallback Keyword' ? 'fallback' : 'ready');
      if (finalList.length > 0) saveCachedDirectives(repoKey, finalList);
    } catch {
      // Local try/catch with fallback (app.onError equivalent): never blank grid, never throw to render.
      if (reqId !== directiveReqId.current) return;
      const cached = loadCachedDirectives(repoKey);
      if (cached.length > 0) {
        setDirectives(cached);
        setDirectiveStatus('fallback');
      } else {
        setDirectiveStatus('error');
      }
    }
  }, [messages.length, repo.branch, repo.owner, repo.repo, repoKey, snapshot]);

  // Generate fresh repo-grounded directives on workspace load / branch switch.
  // Debounced so rapid branch switches collapse into one generation.
  useEffect(() => {
    if (messages.length > 0) return;
    if (!snapshot || !snapshot.files || snapshot.files.length === 0) return;
    if (isBusy) return;
    const t = setTimeout(() => {
      refreshDirectives(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotFilesKey, repo.owner, repo.repo, repo.branch, messages.length]);

  const handleDismissDirective = (e: React.MouseEvent, prompt: string) => {
    e.stopPropagation();
    saveDismissedPrompt(repoKey, prompt);
    setDirectives((prev) => prev.filter((d) => d.prompt !== prompt));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#07090e]/60 overflow-hidden">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto py-12 text-center space-y-6 animate-in fade-in duration-300">
            {/* Visual Anchor: Architectural Geometric Core */}
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 blur-xl pointer-events-none" />
              <div className="relative w-14 h-14 rounded-2xl border border-white/[0.1] bg-[#0b0f19] flex items-center justify-center shadow-lg shadow-indigo-950/50">
                <Layers className="w-7 h-7 text-sky-400" />
              </div>
            </div>

            <div className="space-y-2.5">
              <h3 className="text-xl font-bold text-white tracking-tight">
                Casper is ready to compile execution directives for{' '}
                <span className="text-indigo-300 font-mono">
                  {repo.owner}/{repo.repo}
                </span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed text-balance">
                Casper the friendly ghost reads all ur code lol, traverses the repository tree, executes in-memory Unix VFS tools, and produces an Antigravity-ready step-by-step choreography with exact <code className="text-indigo-300 bg-slate-900/90 px-1.5 py-0.5 rounded font-mono text-xs">@[/paths]</code>.
              </p>
            </div>

            {/* Quick Directive Cards */}
            <div className="space-y-3 text-left max-w-xl mx-auto pt-4">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-400">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span>Suggested Architectural Directives</span>
                  {directiveEngine && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-white/[0.06]">
                      {directiveEngine}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => refreshDirectives(true)}
                  disabled={directiveStatus === 'generating'}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
                  title="Refresh directives (fresh Local AI generation)"
                >
                  {directiveStatus === 'generating' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {directiveStatus === 'generating' && directives.length === 0 ? (
                  [0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-xl bg-slate-900/60 border border-white/[0.06] animate-pulse"
                    >
                      <div className="h-3 rounded bg-slate-800 w-3/4 mb-2" />
                      <div className="h-3 rounded bg-slate-800/70 w-full" />
                    </div>
                  ))
                ) : (
                  directives.map((d, idx) => (
                    <div
                      key={d.id}
                      className="relative p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-white/[0.06] hover:border-indigo-500/40 text-left text-xs text-slate-300 hover:text-white transition shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => setInputText(d.prompt)}
                        className="flex items-start gap-2.5 w-full text-left cursor-pointer active:scale-[0.99]"
                      >
                        <span className="font-mono text-slate-500 text-[11px] mt-0.5">0{idx + 1}.</span>
                        <span className="flex-1 min-w-0">
                          <span className="block leading-relaxed line-clamp-2">{d.title}</span>
                          <span className="block mt-1 text-[11px] text-slate-500 leading-relaxed">
                            {d.rationale || d.engine}
                            {d.anchorPaths.length > 0 && (
                              <span className="ml-1.5 font-mono px-1 py-px rounded bg-slate-800 text-slate-400">
                                {d.anchorPaths.length} anchor{d.anchorPaths.length === 1 ? '' : 's'}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDismissDirective(e, d.prompt)}
                        className="absolute top-1.5 right-1.5 p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition"
                        title="Dismiss this directive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Render Conversation */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 max-w-4xl mx-auto ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex-shrink-0 flex items-center justify-center mt-1">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`rounded-2xl p-5 max-w-3xl ${
                msg.role === 'user'
                  ? 'bg-indigo-600/20 border border-indigo-500/40 text-slate-100 ml-12'
                  : 'glass-panel text-slate-100 w-full'
              }`}
            >
              {/* Header inside bubble */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.06] text-xs text-slate-400">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white">
                    {msg.role === 'user'
                      ? 'Requested Improvements'
                      : isHtmlCorrupted(msg.content)
                      ? 'Upstream Interruption'
                      : 'Compiled Antigravity Execution Prompt'}
                  </span>

                  {msg.role === 'assistant' && isHtmlCorrupted(msg.content) && (
                    <span className="font-mono text-[11px] text-rose-300 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      <span>Warmup HTML Intercepted</span>
                    </span>
                  )}

                  {msg.snapshotMeta && !isHtmlCorrupted(msg.content) && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="text-slate-600" aria-hidden="true">&bull;</span>
                      {msg.snapshotMeta.mode === 'agentic' ? (
                        <span className="font-mono text-indigo-300">
                          Agentic Loop &middot; {msg.snapshotMeta.filesCount} targeted
                          {msg.snapshotMeta.tokensCount > 0 && (
                            <span> &middot; ~{msg.snapshotMeta.tokensCount.toLocaleString()} input tokens</span>
                          )}
                          {msg.snapshotMeta.outputTokensCount && (
                            <span className="text-slate-400"> / ~{msg.snapshotMeta.outputTokensCount.toLocaleString()} out</span>
                          )}
                        </span>
                      ) : (
                        <span className="font-mono text-indigo-300">
                          {msg.snapshotMeta.filesCount} files &middot; ~{msg.snapshotMeta.tokensCount.toLocaleString()} input tokens
                          {msg.snapshotMeta.outputTokensCount && (
                            <span className="text-slate-400 ml-1">/ ~{msg.snapshotMeta.outputTokensCount.toLocaleString()} out</span>
                          )}
                        </span>
                      )}

                      {msg.snapshotMeta.modelUsed && (
                        <>
                          <span className="text-slate-600" aria-hidden="true">&bull;</span>
                          <span className="font-mono text-slate-300">
                            {msg.snapshotMeta.modelUsed}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  <button
                    onClick={() => toggleMinimize(msg.id)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title={isMsgMinimized(msg) ? 'Expand message' : 'Minimize (spoil) message'}
                  >
                    {isMsgMinimized(msg) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>

                  {msg.role === 'assistant' && !isHtmlCorrupted(msg.content) && (
                    <button
                      onClick={() => handleCopy(msg.id, formatCompiledPrompt(msg.content))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition active:scale-95"
                      title="Copy raw compiled prompt for Antigravity"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Compiled Prompt</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Thinking / Reasoning Trail Accordion */}
              {msg.role === 'assistant' &&
                (msg.thinkingContent || msg.snapshotMeta?.thinkingContent) && (
                  <div className="mb-4 rounded-xl bg-purple-950/15 border border-purple-500/25 overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => toggleThinking(msg.id)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-purple-900/20 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        <span className="font-semibold text-purple-200">
                          Agent Reasoning &amp; Thinking Trail
                        </span>
                        <span className="text-[11px] font-mono text-purple-300">
                          &middot; thinkingLevel:{' '}
                          {msg.thinkingLevel || msg.snapshotMeta?.thinkingLevel || 'high'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-purple-300">
                        <span className="text-[11px]">
                          {expandedThinking.has(msg.id) ? 'Collapse Thoughts' : 'Expand Thoughts'}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            expandedThinking.has(msg.id) ? 'rotate-180 text-purple-400' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {expandedThinking.has(msg.id) && (
                      <div className="p-3.5 border-t border-purple-500/20 bg-slate-950/80 font-mono text-[11px] text-purple-200/90 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                        {msg.thinkingContent || msg.snapshotMeta?.thinkingContent}
                      </div>
                    )}
                  </div>
                )}

              {/* Exploration Trail Accordion for Agentic Mode */}
              {msg.role === 'assistant' &&
                msg.snapshotMeta?.explorationTrail &&
                msg.snapshotMeta.explorationTrail.length > 0 && (
                  <div className="mb-4 rounded-xl bg-slate-900/90 border border-white/[0.08] overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => toggleTrail(msg.id)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/60 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Compass className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="font-semibold text-slate-200">
                          Sequential Agent Exploration Trail
                        </span>
                        <span className="text-[11px] text-slate-400">
                          &middot; {msg.snapshotMeta.explorationTrail.length} step(s)
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                          expandedTrails.has(msg.id) ? 'rotate-180 text-indigo-400' : ''
                        }`}
                      />
                    </button>

                    {expandedTrails.has(msg.id) && (
                      <div className="p-4 border-t border-white/[0.06] bg-slate-950/90 space-y-3 font-mono text-[11px]">
                        {msg.snapshotMeta.explorationTrail.map((step, idx) => (
                          <div key={idx} className="space-y-1.5 pb-2 border-b border-slate-900 last:border-b-0">
                            <div className="flex items-center gap-2 text-indigo-400 font-semibold">
                              <span>Round {step.round}:</span>
                              <span className="text-slate-300 font-sans">{step.reason || 'Exploration phase'}</span>
                            </div>
                            <div className="pl-3 text-slate-400">
                              Investigated: <span className="text-slate-200">{(step.paths || []).join(', ') || 'Root repository tree'}</span>
                            </div>
                            {step.status && (
                              <div className="pl-3 text-slate-400">
                                Status: <span className="text-emerald-400 font-sans capitalize">{step.status}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              {/* Attached images render above text, outside Markdown so dataUrls are never parsed */}
              {msg.images && msg.images.length > 0 && !isMsgMinimized(msg) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {msg.images.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => window.open(img.dataUrl, '_blank', 'noopener')}
                      title={`${img.name} — open full size`}
                      className="relative group/img cursor-zoom-in"
                    >
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="w-20 h-20 rounded-lg object-cover border border-white/10 group-hover/img:border-indigo-500/50 transition"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Message Content */}
              {isMsgMinimized(msg) ? (
                <div className="text-xs font-mono text-slate-500 italic py-1">
                  Message minimized (spoiled) &middot; Click expand to view content.
                  {msg.images && msg.images.length > 0 && (
                    <span className="ml-2 not-italic px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/[0.06]">
                      {msg.images.length} image{msg.images.length === 1 ? '' : 's'} attached
                    </span>
                  )}
                </div>
              ) : isHtmlCorrupted(msg.content) ? (
                <div className="space-y-3 p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-200 text-xs">
                  <p className="font-semibold text-rose-300">
                    The compiler received a temporary dev server initialization page instead of a streaming completion.
                  </p>
                  <p className="text-slate-300">
                    This occurs occasionally when cloud run containers cold-start. Please recompile prompt to stream the clean output.
                  </p>
                  {onRetryPrompt && (
                    <button
                      onClick={() => onRetryPrompt(messages.find((m) => m.id === `user-${msg.id.replace('asst-', '')}`)?.content || 'Refactor codebase')}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition active:scale-95"
                    >
                      Recompile Prompt
                    </button>
                  )}
                </div>
              ) : (
                <div className="prose prose-invert prose-xs max-w-none text-slate-300 leading-relaxed">
                  <Markdown
                    components={{
                      code({ className, children, ...props }) {
                        const isInline = !className;
                        return isInline ? (
                          <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/[0.08] text-indigo-300 font-mono text-xs" {...props}>
                            {children}
                          </code>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                      pre({ children }) {
                        return (
                          <pre className="p-4 rounded-xl bg-[#06080e] border border-white/[0.08] overflow-x-auto text-xs font-mono text-slate-200 shadow-inner leading-[1.8] my-4">
                            {children}
                          </pre>
                        );
                      },
                    }}
                  >
                    {formatCompiledPrompt(msg.content)}
                  </Markdown>

                  {(() => {
                    const extracted = extractSuggestedRefactors(msg.content);
                    const realRefactors =
                      msg.suggestedRefactors && msg.suggestedRefactors.length > 0
                        ? msg.suggestedRefactors
                        : msg.snapshotMeta?.suggestedRefactors && msg.snapshotMeta.suggestedRefactors.length > 0
                        ? msg.snapshotMeta.suggestedRefactors
                        : extracted.refactors && extracted.refactors.length > 0
                        ? extracted.refactors
                        : null;

                    if (!realRefactors || realRefactors.length === 0) {
                      return null;
                    }

                    return (
                      <div className="mt-6 pt-4 border-t border-white/[0.06] space-y-2.5 animate-in fade-in duration-300">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Suggested Follow-up Refactors</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {realRefactors.map((promptText, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setInputText(promptText)}
                              className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-white/[0.06] hover:border-indigo-500/40 text-left text-xs text-slate-300 hover:text-white transition flex items-start gap-2.5 group cursor-pointer shadow-sm active:scale-[0.99]"
                            >
                              <span className="font-mono text-slate-500 text-[11px] mt-0.5">0{idx + 1}.</span>
                              <span className="line-clamp-2 leading-relaxed">{promptText}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex-shrink-0 flex items-center justify-center mt-1">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {/* Step Loader during ingestion / compilation */}
        <div className="max-w-4xl mx-auto">
          <StepLoader progress={progress} />
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Input Command Deck Bar */}
      <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-[#07090e]/90 backdrop-blur-xl">
        <form
          onSubmit={handleSubmit}
          onDragOver={(e) => {
            if (isBusy) return;
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (isBusy) return;
            const files = clipboardItemsToFiles(e.dataTransfer?.items);
            void ingestImageFiles(files);
          }}
          className="max-w-4xl mx-auto space-y-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              void ingestImageFiles(files);
            }}
          />
          <div className={`relative rounded-2xl glass-panel border transition-all p-2.5 ${dragActive ? 'border-indigo-400 ring-1 ring-indigo-500' : 'border-white/[0.08] focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500'}`}>
            {dragActive && (
              <div className="absolute inset-0 z-10 rounded-2xl bg-indigo-950/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                <span className="text-xs font-semibold text-indigo-200">Drop screenshots to attach</span>
              </div>
            )}
            {/* Attachment preview strip */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2.5 pt-1 pb-2.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="relative w-[72px] rounded-lg overflow-hidden border border-white/10 bg-slate-900"
                  >
                    <img src={att.dataUrl} alt={att.name} className="w-[72px] h-[72px] object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(att.id)}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-md bg-slate-950/80 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                      title={`Remove ${att.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="px-1 py-0.5 text-[9px] font-mono text-slate-400 truncate" title={att.name}>
                      {att.name}
                    </div>
                    <div className="px-1 pb-1 text-[9px] font-mono text-slate-500">
                      {Math.max(1, Math.round(att.sizeBytes / 1024))} KB
                    </div>
                  </div>
                ))}
              </div>
            )}
            {imageError && (
              <div className="mx-2.5 mb-2 px-2.5 py-1.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-[11px] text-rose-300">
                {imageError}
              </div>
            )}
            <textarea
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmit(e);
                }
              }}
              placeholder={`Describe the improvements or features for ${repo.owner}/${repo.repo}... (Cmd+Enter to compile, Ctrl+V to paste screenshots)`}
              disabled={isBusy}
              className="w-full bg-transparent px-2.5 py-1 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none resize-none"
            />

            <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.06] px-2 text-xs">
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                <span className="inline-flex items-center gap-1 text-slate-300">
                  <GitBranch className="w-3 h-3 text-indigo-400" />
                  <span>{repo.branch}</span>
                </span>
                {snapshot && (
                  <span className="hidden sm:inline text-slate-500">
                    &bull; Snapshot: <strong className="text-slate-300 font-normal">{snapshot.includedFilesCount} files</strong>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
                  title="Attach screenshots (PNG, JPEG, WebP, GIF — max 4, 5MB each)"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                </button>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearChat}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title="Clear history for this repo"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isBusy || isSubmitting || (!inputText.trim() && attachments.length === 0)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs shadow-sm hover:shadow-indigo-500/20 transition active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Compile for Antigravity</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span>Every submission executes a fresh, live snapshot from GitHub.</span>
            <span>Press Cmd+Enter or click Compile</span>
          </div>
        </form>
      </div>
    </div>
  );
};
