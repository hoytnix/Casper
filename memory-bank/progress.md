# Progress: Casper - Drop-Dead Gorgeous Design & Architectural Cartography

## Completed Modules
- [x] Memory Bank initialized and synchronized across all sessions
- [x] PWA static manifest (`public/manifest.json`), icons, and installation hooks
- [x] Full Rebrand to "Next.js Expert" (metadata, layout metadata, top headers, welcome hero banner, add modal, repo cards, workspace controls)
- [x] Next.js Structural Skeleton Indexer (`/lib/nextjs-indexer.ts`)
- [x] In-Memory Unix VFS Toolkit (`/lib/unix-vfs-tools.ts`)
- [x] Multi-Step Agentic Tool Loop & Unix-Augmented Fallback (`/lib/local-context-router.ts`)
- [x] Function-Level Relationship & Call Graph Mapper (`/lib/nextjs-code-graph.ts`)
- [x] Graph-Aware Unix VFS Tools (`/lib/unix-vfs-tools.ts`)
- [x] Gemini Thinking Configuration & Reasoning Traces (`/app/api/compile/route.ts`, `/components/ChatCompiler.tsx`, `/components/StepLoader.tsx`)
- [x] Cascading Model Resilience & Robust Streaming (`/app/api/compile/route.ts`)
- [x] Dynamic API Cost Estimation & Model Pricing Engine (`/types/index.ts`, `/lib/utils.ts`)
- [x] Gemini 4 Argon Support & Customizable Fallback Waterfall (`/types/index.ts`, `/lib/utils.ts`, `/components/SettingsModal.tsx`, `/hooks/useRepoStore.ts`)
- [x] Drop-Dead Gorgeous Visual Design & Anti-Slop Elevation
- [x] Token Costs Over Time & Token Spending Analytics Tracker with Real Data DB
- [x] Automated Prompt Expense Logging & Mock Seed Data Removal
- [x] **Permalinks, Header Cleanup & Screen Height Fit**:
  - Implemented `/chat/[owner]/[repo]` permalink route with auto-resolution from GitHub API for bookmarking favorite repositories.
  - Removed capability text from the header.
  - Configured strict `h-screen flex flex-col overflow-hidden` layouts with inner `overflow-y-auto` scroll areas.

- [x] **Next.js + Hono Dual-Framework Support**:
  - `DetectedFramework` type (`nextjs` | `hono` | `unknown`) on `Repo` and `IngestionSnapshot` (`/types/index.ts`)
  - Framework auto-detection engine (`/lib/framework-detector.ts`)
  - Hono roles (`hono-route`, `hono-middleware`) in indexer and Hono method-chain mapping in code graph
  - Hono-aware local context router (scope notes + scoring boosts) and dual-framework compile instructions (Hono Expert vs. Next.js Expert)
  - Detected-framework badge in workspace sub-header with persistence
  - Verified: `tsc --noEmit` clean, `eslint` clean on all touched files, `next build` green, 19/19 behavioral probe checks pass (`/tmp/fw-probe/run.mjs`)

- [x] **Dedicated Settings Page (`/settings`) Replacing the Modal**:
  - New full-width App Router page (`/app/settings/page.tsx`) with responsive 1→3 column grid: model priority/fallback waterfall, local AI context router engine + warm-up, GitHub PAT, custom API key, exploration rounds, and request timeout — all persisted via `useRepoStore.updateSettings`.
  - `/components/Header.tsx` settings control is now a `<Link href="/settings">` (removed `onOpenSettings`, optional `onOpenAddModal`); `/components/SettingsModal.tsx` deleted; modal state/JSX purged from `/app/page.tsx` and `/app/chat/[owner]/[repo]/page.tsx`.
  - Verified: `eslint` clean on all touched files, `next build` green with `/settings` prerendered as static content.

- [x] **Collapsible Chat Spoilers + Muse Spark Pricing Precedence**:
  - `ChatMessage.isMinimized?` (`/types/index.ts`); minimize/maximize chevron + spoiled banner in `/components/ChatCompiler.tsx` with unused-import purge.
  - Explicit contributor → standard → Gemini ordering in `resolveModelPricing` (`/lib/utils.ts`); existing `/lib/utils.test.ts` Muse assertions (10/10) confirm $0.10/$0.20 and $1.25/$4.25 tiers.
  - Verified: 32/32 `node:test`, `tsc` clean, `eslint` clean, `pnpm build` green.
- [x] **Full Rebrand to "Casper" (the friendly ghost who reads all ur code lol)**:
  - Root metadata + viewport title (`/app/layout.tsx`), PWA manifest (`/public/manifest.json`), `/metadata.json`, finance page title
  - Header + finance header branding (`/components/Header.tsx`, `/components/FinanceHeader.tsx`)
  - Casper persona in all 6 compile system instructions (`/app/api/compile/route.ts`); routing invariants + Zod/formatting rules intact
  - Welcome state (`/components/ChatCompiler.tsx`), repo grid hero, settings note, workspace progress message, 404, loading fallback, deprecated stub
  - Verified: `eslint` clean, `next build` green (typecheck included), zero lingering `Next.js Expert` / `NextExpert` / `Hono Expert` references in app code

## Current Status
Production-Ready. Triple-framework (Next.js + Hono + Vite) cartography live alongside permalinks, clean header, screen-height responsive layout, automated prompt expense logging, Muse Spark cascade integration, and fully synchronized Memory Bank.

## Completed Modules (cont.)
- [x] **Multi-Turn Compilation with History Context Caching**:
  - Bounded history normalizer + provider mappers (`/lib/chat-history.ts`, `/lib/chat-history.test.ts` 7/7)
  - Stateful Gemini chat sessions per cascade attempt + history-aware Muse path (`/app/api/compile/route.ts`)
  - Client forwards prior turns; snapshot delta cache keeps file downloads at zero (`/components/RepoWorkspace.tsx`)
  - Verified: 32/32 `node:test` pass, `tsc --noEmit` clean, `eslint` clean, `pnpm build` green
- [x] **Vite SPA Cartography Support**:
  - `DetectedFramework` extended with `'vite'` (`/types/index.ts`); new `vite-entry` / `vite-config` / `vite-component` file roles
  - Detection via `vite.config.*`, `index.html` + vite imports, and package.json vite deps (`/lib/framework-detector.ts`); `Vite SPA & SSR` workspace badge label
  - Entry classifiers, HTML `<script src>` import extraction, and sibling-entry closure (`/lib/nextjs-indexer.ts`)
  - `spaEntries` mount mapping + `src/App.*` as SPA render-tree root (`/lib/nextjs-code-graph.ts`)
  - Vite router scope note + scoring boosts in embedding and keyword tiers (`/lib/local-context-router.ts`)
  - Verified: 8/8 new (`/lib/vite-support.test.ts`) + 17/17 existing `node:test` pass, `tsc --noEmit` clean, `eslint` clean, `pnpm build` green

## Completed Modules (cont.)
- [x] **Muse Spark Model Integration (`muse-spark-1.3-contributor` + `muse-spark-1.3`)**:
  - Pricing tiers + tag resolver (`/lib/utils.ts`); `AppSettings.museApiKey` + cached pricing field (`/types/index.ts`)
  - Defaults at cascade priorities 1–2 with stored-settings backfill (`/hooks/useRepoStore.ts`)
  - Muse AI API Key field + priority controls (`/app/settings/page.tsx`); key forwarded by client (`/components/RepoWorkspace.tsx`)
  - Dual-provider cascade in compile route (`/app/api/compile/route.ts`): Bearer-key Muse SSE streaming, Gemini-only tool exploration, graceful skip/fallback
  - Verified: `node --test lib/utils.test.ts` 10/10 (3 new), `tsc --noEmit` clean, `eslint` clean, `next build` green
  - Open item: default `MUSE_API_BASE_URL` (`https://api.muse.ai/v1`) is unconfirmed — override via env if Muse publishes a different chat-completions host
