'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  RotateCcw,
  GitBranch,
  Loader2,
  X,
  ImagePlus,
} from 'lucide-react';
import { ChatMessage, ImageAttachment, IngestionProgress, IngestionSnapshot, Repo } from '@/types';
import { StepLoader } from './StepLoader';
import { SuggestedDirectivesGrid } from './SuggestedDirectivesGrid';
import { ChatMessageItem } from './ChatMessageItem';
import { useChatAttachments } from '@/hooks/useChatAttachments';

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
  const {
    attachments,
    dragActive,
    setDragActive,
    imageError,
    isProcessingImages,
    fileInputRef,
    ingestImageFiles,
    handlePaste,
    handleDropItems,
    handleRemoveImage,
    resetAttachments,
  } = useChatAttachments();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Stable callbacks (functional setState only): the memoized message
  // list below depends on their identity, so they must not change per
  // keystroke — otherwise every textarea input re-parses all Markdown.
  const toggleMinimize = React.useCallback(
    (msgId: string) => {
      setMinimizedMsgs((prev) => {
        const next = new Set(prev);
        if (next.has(msgId)) next.delete(msgId);
        else next.add(msgId);
        return next;
      });
      onToggleMinimize?.(msgId);
    },
    [onToggleMinimize]
  );

  const isMsgMinimized = React.useCallback(
    (msg: ChatMessage) =>
      msg.isMinimized ? !minimizedMsgs.has(msg.id) : minimizedMsgs.has(msg.id),
    [minimizedMsgs]
  );

  const toggleThinking = React.useCallback((msgId: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }, []);

  const toggleTrail = React.useCallback((msgId: string) => {
    setExpandedTrails((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }, []);

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
    if (submitLockRef.current || isBusy || isProcessingImages) return;
    if (!inputText.trim() && attachments.length === 0) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    onSendMessage(inputText.trim(), attachments.length > 0 ? attachments : undefined);
    setInputText('');
    resetAttachments();
    setTimeout(() => {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }, 300);
  };


  const handleCopy = React.useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error('Failed to copy prompt to clipboard:', e);
    }
  }, []);


  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#07090e]/60 overflow-hidden">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
        {messages.length === 0 && (
          <SuggestedDirectivesGrid
            repo={repo}
            snapshot={snapshot}
            messagesLength={messages.length}
            isBusy={isBusy}
            onUsePrompt={setInputText}
          />
        )}

        {/* Render Conversation */}
        {messages.map((msg) => (
          <ChatMessageItem
            key={msg.id}
            msg={msg}
            messages={messages}
            copiedId={copiedId}
            isMinimized={isMsgMinimized(msg)}
            thinkingExpanded={expandedThinking.has(msg.id)}
            trailExpanded={expandedTrails.has(msg.id)}
            onToggleMinimize={toggleMinimize}
            onToggleThinking={toggleThinking}
            onToggleTrail={toggleTrail}
            onCopy={handleCopy}
            onRetryPrompt={onRetryPrompt}
            onUsePrompt={setInputText}
          />
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
            handleDropItems(e.dataTransfer?.items);
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
            {isProcessingImages && (
              <div className="mx-2.5 mb-2 px-2.5 py-1.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-300 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Attaching screenshots…
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
                  disabled={isBusy || isSubmitting || isProcessingImages || (!inputText.trim() && attachments.length === 0)}
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
