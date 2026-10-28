'use client';

import React, { useState } from 'react';
import {
  FileCode,
  FileJson,
  FileText,
  Filter,
  Hash,
  Plus,
  Search,
} from 'lucide-react';
import type { IngestionSnapshot, SourceFile } from '@/types';

export interface InspectorExcludesProps {
  excludedPatterns: string[];
  onUpdateExcludes: (patterns: string[]) => void;
}

export interface InspectorFileListProps {
  files: SourceFile[];
  snapshot: IngestionSnapshot | null;
}

const COMMON_EXCLUDES = [
  'test/',
  'tests/',
  'docs/',
  'examples/',
  '*.spec.ts',
  '*.test.tsx',
  '*.md',
  '*.stories.tsx',
];

// Tree exclude patterns, always visible above the tab content.
export const InspectorExcludes: React.FC<InspectorExcludesProps> = ({
  excludedPatterns,
  onUpdateExcludes,
}) => {
  const [newExcludeInput, setNewExcludeInput] = useState('');

  const handleAddExclude = (pattern: string) => {
    const trimmed = pattern.trim();
    if (!trimmed || excludedPatterns.includes(trimmed)) return;
    onUpdateExcludes([...excludedPatterns, trimmed]);
    setNewExcludeInput('');
  };

  const handleRemoveExclude = (pattern: string) => {
    onUpdateExcludes(excludedPatterns.filter((p) => p !== pattern));
  };

  return (
    <div className="p-4 border-b border-slate-800 space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-indigo-400" />
          Tree Exclude Patterns
        </label>
        <span className="text-[10px] text-slate-500 font-mono">
          {excludedPatterns.length} active
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {COMMON_EXCLUDES.map((comm) => {
          const isExcluded = excludedPatterns.includes(comm);
          return (
            <button
              key={comm}
              onClick={() =>
                isExcluded ? handleRemoveExclude(comm) : handleAddExclude(comm)
              }
              className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition cursor-pointer ${
                isExcluded
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-slate-900 border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/20'
              }`}
            >
              {isExcluded ? '✓ ' : '+ '}
              {comm}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 pt-1">
        <input
          type="text"
          value={newExcludeInput}
          onChange={(e) => setNewExcludeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddExclude(newExcludeInput);
            }
          }}
          placeholder="Add custom pattern (e.g. mock/)"
          className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-white/[0.08] text-xs font-mono text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => handleAddExclude(newExcludeInput)}
          disabled={!newExcludeInput.trim()}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition"
          aria-label="Add exclude pattern"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// File search + sized file list with per-extension icons.
export const InspectorFileList: React.FC<InspectorFileListProps> = ({
  files,
  snapshot,
}) => {
  const [fileFilter, setFileFilter] = useState('');

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = (bytes / 1024).toFixed(1);
    return `${kb} KB`;
  };

  const getFileIcon = (path: string) => {
    if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) {
      return <FileCode className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />;
    }
    if (path.endsWith('.json')) {
      return <FileJson className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
    }
    if (path.endsWith('.css') || path.endsWith('.scss')) {
      return <Hash className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />;
    }
    return <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />;
  };

  const filteredFiles = files.filter((f) =>
    f.path.toLowerCase().includes(fileFilter.toLowerCase())
  );

  return (
      <div className="flex-1 min-h-0 flex flex-col p-4">
        {/* File Search + List */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={fileFilter}
            onChange={(e) => setFileFilter(e.target.value)}
            placeholder="Filter files..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {filteredFiles.length > 0 ? (
            filteredFiles.map((file) => (
              <div
                key={file.path}
                className="group flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900/80 text-xs transition"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {getFileIcon(file.path)}
                  <span className="font-mono text-slate-300 truncate" title={file.path}>
                    {file.path}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-500 group-hover:text-slate-400 flex-shrink-0">
                  {formatFileSize(file.size)}
                </span>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-slate-500 leading-relaxed">
              {snapshot ? 'No files matching search filter.' : 'Submit a prompt to fetch and inspect repository.'}
            </div>
          )}
        </div>
      </div>
  );
};
