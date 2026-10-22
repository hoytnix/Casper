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

- [x] **Full Rebrand to "Casper" (the friendly ghost who reads all ur code lol)**:
  - Root metadata + viewport title (`/app/layout.tsx`), PWA manifest (`/public/manifest.json`), `/metadata.json`, finance page title
  - Header + finance header branding (`/components/Header.tsx`, `/components/FinanceHeader.tsx`)
  - Casper persona in all 6 compile system instructions (`/app/api/compile/route.ts`); routing invariants + Zod/formatting rules intact
  - Welcome state (`/components/ChatCompiler.tsx`), repo grid hero, settings note, workspace progress message, 404, loading fallback, deprecated stub
  - Verified: `eslint` clean, `next build` green (typecheck included), zero lingering `Next.js Expert` / `NextExpert` / `Hono Expert` references in app code

## Current Status
Production-Ready. Dual-framework (Next.js + Hono) cartography live alongside permalinks, clean header, screen-height responsive layout, automated prompt expense logging, and fully synchronized Memory Bank.
