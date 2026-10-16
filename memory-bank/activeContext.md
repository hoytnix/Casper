# Active Context: Deprecation of Full Ingestion & Multi-Round Exploration Fix

## Active Focus
Successfully deprecated legacy full-repository ingestion mode across the application, unified all three modes (Prompt, Ideas, and BTW) into the high-performance agentic exploration pipeline, and fixed the multi-round exploration loop counter bug:
- **Deprecating Full-Ingestion Mode (`/types/index.ts`, `/components/RepoWorkspace.tsx`, `/app/api/compile/route.ts`)**:
  - Purged `'full'` from `IngestionMode` type union and removed the monolithic 120-blob download fallback branch.
  - Unified all modes (`'agentic'` displayed as **Prompt**, `'idea'`, `'btw'`) to run through the agentic Unix VFS exploration and streaming pipeline.
- **Multi-Round Exploration Bug Fix (`/app/api/compile/route.ts`, `/components/RepoWorkspace.tsx`, `/components/SettingsModal.tsx`)**:
  - Refactored `app/api/compile/route.ts` so pre-routed client files seed context while the model iteratively expands its blast radius across rounds 1..$N$ (up to `maxRounds`, e.g. Round 1 of 4).
  - Dynamically linked `maxRounds` to `settings.maxAgenticRounds` (defaulting up to 4) instead of hardcoding `maxRounds: 1`.
- **UI & Store Cleanup (`/components/ContextInspector.tsx`, `/components/SettingsModal.tsx`, `/hooks/useRepoStore.ts`)**:
  - Cleaned up strategy displays to reflect "Graph-Aware Agentic VFS" and added sanitizer for legacy `defaultMode === 'full'`.
