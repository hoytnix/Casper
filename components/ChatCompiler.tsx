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
  Terminal,
  Layers,
  Clock,
  ChevronDown,
  Compass,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { ChatMessage, IngestionProgress, IngestionSnapshot, Repo } from '@/types';
import { StepLoader } from './StepLoader';
import { formatCompiledPrompt } from '@/lib/utils';

interface ChatCompilerProps {
  repo: Repo;
  messages: ChatMessage[];
  progress: IngestionProgress;
  onSendMessage: (promptText: string) => void;
  onClearChat: () => void;
  onDeleteMessage?: (id: string) => void;
  onRetryPrompt?: (promptText: string) => void;
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
  snapshot,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTrails, setExpandedTrails] = useState<Set<string>>(new Set());
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isBusy) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleCopy = (id: string, text: string) => {
    const rawToCopy = formatCompiledPrompt(text);
    navigator.clipboard.writeText(rawToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const SUGGESTED_PROMPTS = [
    'Refactor state management into a clean custom hook architecture and eliminate prop drilling.',
    'Implement complete error boundaries, retry backoff logic, and graceful offline toasts.',
    'Add strict Zod schemas to validate all external API payloads and enhance TypeScript types.',
    'Upgrade UI to dark-mode glassmorphism with high-contrast accessibility and smooth animations.',
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950/60 overflow-hidden">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto py-12 text-center space-y-6 animate-in fade-in duration-300">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <Terminal className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">
                Ready to Compile Execution Prompt for{' '}
                <span className="text-indigo-400 font-mono">
                  {repo.owner}/{repo.repo}
                </span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                Enter your requested improvements or architectural refactors. The compiler dynamically pulls the latest commit tree, inlines all source files, and produces an Antigravity-ready step-by-step prompt with exact <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded">@[/paths]</code>.
              </p>
            </div>

            {/* Quick Templates */}
            <div className="space-y-2.5 text-left max-w-xl mx-auto pt-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Suggested Directives:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInputText(prompt)}
                    className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 text-left text-xs text-slate-300 hover:text-white transition flex items-start gap-2 group"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <span className="line-clamp-2">{prompt}</span>
                  </button>
                ))}
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
              <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex-shrink-0 flex items-center justify-center mt-1">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`rounded-2xl p-4 sm:p-5 max-w-3xl ${
                msg.role === 'user'
                  ? 'bg-indigo-600/20 border border-indigo-500/40 text-slate-100 ml-12'
                  : 'glass-panel text-slate-100 w-full'
              }`}
            >
              {/* Header inside bubble */}
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800/80 text-[11px] text-slate-400">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-300">
                    {msg.role === 'user'
                      ? 'Requested Improvements'
                      : isHtmlCorrupted(msg.content)
                      ? 'Upstream Interruption'
                      : 'Compiled Antigravity Execution Prompt'}
                  </span>
                  {msg.role === 'assistant' && isHtmlCorrupted(msg.content) && (
                    <span className="font-mono text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                      <span>Warmup HTML Intercepted</span>
                    </span>
                  )}
                  {msg.snapshotMeta && !isHtmlCorrupted(msg.content) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {msg.snapshotMeta.mode === 'agentic' ? (
                        <span className="font-mono text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <span>Agentic Loop</span>
                          <span className="text-slate-400">&bull; {msg.snapshotMeta.filesCount} targeted</span>
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-indigo-300 border border-slate-800">
                          {msg.snapshotMeta.filesCount} files &bull; ~{msg.snapshotMeta.tokensCount.toLocaleString()} tokens
                        </span>
                      )}
                      {msg.snapshotMeta.modelUsed && (
                        <span className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                          <span>{msg.snapshotMeta.modelUsed}</span>
                          {msg.snapshotMeta.fallbackPass && msg.snapshotMeta.fallbackPass > 1 && (
                            <span className="text-[9px] text-amber-300 font-bold">(Pass {msg.snapshotMeta.fallbackPass})</span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {msg.role === 'assistant' && !isHtmlCorrupted(msg.content) && (
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition active:scale-95"
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
                  <div className="mb-4 rounded-xl bg-purple-950/10 border border-purple-500/30 overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => toggleThinking(msg.id)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-purple-900/20 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                        <span className="font-semibold text-purple-200">
                          Agent Reasoning & Thinking Trail
                        </span>
                        <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                          thinkingLevel: high &bull; auto
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-purple-300">
                        <span className="text-[10px]">
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
                  <div className="mb-4 rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => toggleTrail(msg.id)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/60 transition"
                    >
                      <div className="flex items-center gap-2">
                        <Compass className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="font-semibold text-slate-200">
                          Agent Exploration Trail
                        </span>
                        <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                          {msg.snapshotMeta.explorationTrail.length} round
                          {msg.snapshotMeta.explorationTrail.length > 1 ? 's' : ''} &bull;{' '}
                          {msg.snapshotMeta.filesCount} targeted file
                          {msg.snapshotMeta.filesCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400">
                        <span className="text-[10px]">
                          {expandedTrails.has(msg.id) ? 'Collapse' : 'Inspect Steps'}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            expandedTrails.has(msg.id)
                              ? 'rotate-180 text-indigo-400'
                              : ''
                          }`}
                        />
                      </div>
                    </button>

                    {expandedTrails.has(msg.id) && (
                      <div className="p-3 border-t border-slate-800/80 space-y-2 bg-slate-950/50">
                        {msg.snapshotMeta.explorationTrail.map((step) => (
                          <div
                            key={step.id}
                            className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                Round {step.round}: Inspected {step.paths.length} file
                                {step.paths.length > 1 ? 's' : ''}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(step.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>
                            {step.reason && (
                              <p className="text-[11px] text-slate-400 italic">
                                &ldquo;{step.reason}&rdquo;
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {step.paths.map((p) => (
                                <span
                                  key={p}
                                  className="font-mono text-[10px] text-indigo-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800"
                                >
                                  @[/{p}]
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              {/* Message Content */}
              {msg.role === 'user' ? (
                <div className="text-xs sm:text-sm whitespace-pre-wrap leading-[2.25] font-sans">
                  {msg.content}
                </div>
              ) : isHtmlCorrupted(msg.content) ? (
                <div className="p-4 sm:p-5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-xs sm:text-sm text-rose-200">
                      Upstream Gateway Warmup / Timeout Intercepted
                    </span>
                  </div>
                  <p className="text-xs text-rose-300/80 leading-[2.25]">
                    The development gateway returned a server startup page instead of an Antigravity Markdown prompt. This occurs when repository ingestion exceeds the upstream reverse-proxy timeout window or models hit transient spikes.
                  </p>
                  <div className="flex items-center gap-2.5 pt-1 flex-wrap">
                    {onRetryPrompt && (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = messages.findIndex((m) => m.id === msg.id);
                          const prevUserMsg = messages
                            .slice(0, idx)
                            .reverse()
                            .find((m) => m.role === 'user');
                          if (prevUserMsg) {
                            onRetryPrompt(prevUserMsg.content);
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-indigo-500/20 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Recompile Prompt</span>
                      </button>
                    )}
                    {onDeleteMessage && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-600 font-medium text-xs transition active:scale-95 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="prose prose-invert prose-slate max-w-none text-xs sm:text-sm leading-[2.25] [&_p]:leading-[2.25] [&_li]:leading-[2.25] [&_blockquote]:leading-[2.25] [&_p]:my-4 [&_ul]:my-4 [&_ol]:my-4 [&_li]:my-2 overflow-x-auto">
                  <Markdown
                    components={{
                      h1({ children }) {
                        return (
                          <h1 className="text-base sm:text-lg font-bold text-white mt-6 mb-3 pb-2 border-b border-slate-800 leading-snug">
                            {children}
                          </h1>
                        );
                      },
                      h2({ children }) {
                        return (
                          <h2 className="text-sm sm:text-base font-bold text-white mt-5 mb-2.5 leading-snug">
                            {children}
                          </h2>
                        );
                      },
                      h3({ children }) {
                        return (
                          <h3 className="text-xs sm:text-sm font-semibold text-slate-200 mt-4 mb-2 leading-snug">
                            {children}
                          </h3>
                        );
                      },
                      p({ children }) {
                        return (
                          <p className="leading-[2.25] my-3.5 text-slate-200">
                            {children}
                          </p>
                        );
                      },
                      ul({ children }) {
                        return (
                          <ul className="list-disc list-inside space-y-2 my-4 text-slate-200 leading-[2.25]">
                            {children}
                          </ul>
                        );
                      },
                      ol({ children }) {
                        return (
                          <ol className="list-decimal list-inside space-y-2 my-4 text-slate-200 leading-[2.25]">
                            {children}
                          </ol>
                        );
                      },
                      li({ children }) {
                        return (
                          <li className="leading-[2.25] my-1 text-slate-200">
                            {children}
                          </li>
                        );
                      },
                      hr() {
                        return <hr className="my-5 border-slate-800/80" />;
                      },
                      blockquote({ children }) {
                        return (
                          <blockquote className="border-l-2 border-indigo-500/50 pl-4 my-4 italic text-slate-400 leading-[2.25]">
                            {children}
                          </blockquote>
                        );
                      },
                      code({ node, className, children, ...props }) {
                        const codeString = String(children).replace(/\n$/, '');
                        const isAtMention = codeString.startsWith('@[') && codeString.endsWith(']');

                        if (isAtMention) {
                          return (
                            <span className="inline-flex items-center font-mono text-[11px] font-semibold text-indigo-300 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-500/30">
                              {codeString}
                            </span>
                          );
                        }

                        return (
                          <code
                            className={`${className || ''} bg-slate-900 text-indigo-200 px-1.5 py-0.5 rounded font-mono text-xs`}
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      pre({ children }) {
                        return (
                          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 overflow-x-auto text-xs font-mono text-slate-200 shadow-inner leading-[1.8] my-4">
                            {children}
                          </pre>
                        );
                      },
                    }}
                  >
                    {formatCompiledPrompt(msg.content)}
                  </Markdown>

                  <div className="mt-6 pt-4 border-t border-slate-800/80 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Suggested Follow-up Refactors:</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        "Refactor all data-fetching to leverage React Server Components with parallel Suspense boundaries and granular error boundaries.",
                        "Implement rigorous Zod validation schemas across all Server Actions and Route Handlers with explicit type safety.",
                        "Optimize middleware and routing rules for secure role-based access control and edge caching.",
                        "Purge legacy client state by migrating global stores to searchParams/URL state and Server Actions.",
                      ].map((promptText, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setInputText(promptText)}
                          className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/40 text-left text-xs text-slate-300 hover:text-white transition flex items-start gap-2 group cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-indigo-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                          <span className="line-clamp-2">{promptText}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 flex-shrink-0 flex items-center justify-center mt-1">
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

      {/* Input Form Bar */}
      <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-2">
          <div className="relative rounded-2xl glass-panel border border-slate-700/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all p-2">
            <textarea
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={`Describe the improvements or features for ${repo.owner}/${repo.repo}... (Cmd+Enter to compile)`}
              disabled={isBusy}
              className="w-full bg-transparent px-2 py-1 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none resize-none"
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 px-2 text-xs">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                <span>Branch: <strong className="text-slate-300">{repo.branch}</strong></span>
                {snapshot && (
                  <span className="hidden sm:inline">
                    &bull; Snapshot: <strong className="text-indigo-400">{snapshot.includedFilesCount} files</strong>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearChat}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
                    title="Clear history for this repo"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isBusy || !inputText.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 transition active:scale-95"
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
