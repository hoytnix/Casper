# Active Context: AST-Aware Incremental Repo Caching & Delta Ingestion

## Active Focus
Successfully engineered and integrated **AST-Aware Incremental Repo Caching & Delta Ingestion** across client state and the GitHub ingestion engine:
- **GitHub Utilities (`/lib/github.ts`)**: Added `fetchRepoDelta` utilizing GitHub's commit compare endpoint (`/repos/{owner}/{repo}/compare/{lastSha}...{currentSha}`) with fast-forward delta detection and modified file status reporting (`added`, `modified`, `removed`). Broadened `downloadSourceFiles` to accept blob path objects.
- **Pure Delta Synchronization Engine (`/lib/delta-sync.ts`)**: Created isolated, zero-dependency delta merge logic (`applyFileDelta`, `canApplyDelta`) strictly unit-tested via `node:test` (`/lib/delta-sync.test.ts`).
- **IndexedDB Snapshot Persistence (`/lib/snapshot-db.ts`)**: Implemented high-capacity client storage for full repository snapshots, commit SHAs, and in-memory source files with robust SSR fallbacks and cleanup hooks.
- **Repository Store Hook (`/hooks/useRepoStore.ts`)**: Hydrated snapshots from IndexedDB on initial mount, persisted snapshots and commit SHAs to IndexedDB and `localStorage`, and added automated cleanup on repository deletion.
- **Interactive Workspace UI (`/components/RepoWorkspace.tsx`)**:
  - Integrated live delta checks on repository mount and branch selection to verify remote HEAD against the cached commit SHA.
  - Implemented fast-forward incremental sync: when commit SHAs diverge, only modified and added blobs are downloaded, while deleted files are purged.
  - When commit SHAs match, redundant downloads are bypassed completely, providing zero-latency compiler transitions.
  - Added visual `Delta Cache` status pill in the workspace sub-header with commit SHA and sync status.
- **Verification**: 8 unit tests passing via `node --test`, successful production compilation (`npm run build`), zero ESLint errors (`npm run lint`), and live browser verification with Playwright.
