'use client';

import React from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Sparkles,
  User,
} from 'lucide-react';
import Markdown from 'react-markdown';
import type { ChatMessage } from '@/types';
import { extractSuggestedRefactors, formatCompiledPrompt } from '@/lib/utils';

export interface ChatMessageItemProps {
  msg: ChatMessage;
  messages: ChatMessage[];
  copiedId: string | null;
  isMinimized: boolean;
  thinkingExpanded: boolean;
  trailExpanded: boolean;
  onToggleMinimize: (id: string) => void;
  onToggleThinking: (id: string) => void;
  onToggleTrail: (id: string) => void;
  onCopy: (id: string, text: string) => void;
  onRetryPrompt?: (promptText: string) => void;
  onUsePrompt: (prompt: string) => void;
}

// Module scope: pure content check, stable by definition — keeps it out of
// the memoized message list's dependency set.
function isHtmlCorrupted(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim().toLowerCase();
  return (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('<title>starting server...</title>') ||
    trimmed.includes('please wait while your application starts')
  );
}

// Memoized Markdown bubble: re-parses only when `content` changes.
// Without this, every textarea keystroke re-runs remark/rehype over every
// assistant bubble — the per-keystroke half of the textarea INP problem.
const MemoMarkdown = React.memo(function MemoMarkdown({ content }: { content: string }) {
  return (
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
            <pre className="p-4 rounded-xl bg-[var(--theme-codebg)] border border-[var(--theme-border)] overflow-x-auto text-xs font-mono text-[var(--theme-text)] shadow-inner leading-[1.8] my-4">
              {children}
            </pre>
          );
        },
      }}
    >
      {formatCompiledPrompt(content)}
    </Markdown>
  );
});

// One conversation bubble, extracted verbatim from ChatCompiler's message
// list: header meta, thinking + exploration accordions, image thumbnails
// (outside Markdown so dataUrls are never parsed), minimized/corrupted
// states, and follow-up refactor cards. Per-keystroke Markdown cost stays
// contained by MemoMarkdown above.
// Memoized: the parent holds the textarea value, so every keystroke
// re-renders the parent — without this, each keystroke would reconcile
// every bubble and re-run the refactor regex over every (large) compiled
// prompt, which is the textarea input-delay half of the INP trace. Props
// stay referentially stable across keystrokes (messages/snapshot arrays
// keep identity until the conversation actually changes), so the default
// shallow compare skips correctly with no custom comparator.
export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(function ChatMessageItem({
  msg,
  messages,
  copiedId,
  isMinimized,
  thinkingExpanded,
  trailExpanded,
  onToggleMinimize,
  onToggleThinking,
  onToggleTrail,
  onCopy,
  onRetryPrompt,
  onUsePrompt,
}) {
  // Refactor extraction runs regexes over the full compiled prompt: memoize
  // on content identity so idle keystrokes never re-parse old bubbles.
  const followUpRefactors = React.useMemo(() => {
    const extracted = extractSuggestedRefactors(msg.content);
    if (msg.suggestedRefactors && msg.suggestedRefactors.length > 0) {
      return msg.suggestedRefactors;
    }
    if (msg.snapshotMeta?.suggestedRefactors && msg.snapshotMeta.suggestedRefactors.length > 0) {
      return msg.snapshotMeta.suggestedRefactors;
    }
    if (extracted.refactors && extracted.refactors.length > 0) {
      return extracted.refactors;
    }
    return null;
  }, [msg.content, msg.suggestedRefactors, msg.snapshotMeta?.suggestedRefactors]);
  return (
    <div
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
              onClick={() => onToggleMinimize(msg.id)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title={isMinimized ? 'Expand message' : 'Minimize (spoil) message'}
            >
              {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>

            {msg.role === 'assistant' && !isHtmlCorrupted(msg.content) && (
              <button
                onClick={() => onCopy(msg.id, formatCompiledPrompt(msg.content))}
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
                onClick={() => onToggleThinking(msg.id)}
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
                    {thinkingExpanded ? 'Collapse Thoughts' : 'Expand Thoughts'}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      thinkingExpanded ? 'rotate-180 text-purple-400' : ''
                    }`}
                  />
                </div>
              </button>

              {thinkingExpanded && (
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
                onClick={() => onToggleTrail(msg.id)}
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
                    trailExpanded ? 'rotate-180 text-indigo-400' : ''
                  }`}
                />
              </button>

              {trailExpanded && (
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
        {msg.images && msg.images.length > 0 && !isMinimized && (
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
        {isMinimized ? (
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
            <MemoMarkdown content={msg.content} />

            {followUpRefactors && followUpRefactors.length > 0 && (
              <div className="mt-6 pt-4 border-t border-white/[0.06] space-y-2.5 animate-in fade-in duration-300">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Suggested Follow-up Refactors</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {followUpRefactors.map((promptText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onUsePrompt(promptText)}
                      className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-white/[0.06] hover:border-indigo-500/40 text-left text-xs text-slate-300 hover:text-white transition flex items-start gap-2.5 group cursor-pointer shadow-sm active:scale-[0.99]"
                    >
                      <span className="font-mono text-slate-500 text-[11px] mt-0.5">0{idx + 1}.</span>
                      <span className="line-clamp-2 leading-relaxed">{promptText}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {msg.role === 'user' && (
        <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex-shrink-0 flex items-center justify-center mt-1">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
});
