# Progress: Next.js Expert with Gemini 4 Argon & Customizable Model Waterfall

## Completed Modules
- [x] Memory Bank initialized and synchronized across all sessions
- [x] PWA static manifest (`public/manifest.json`), icons, and installation hooks
- [x] Full Rebrand to "Next.js Expert" (metadata, PWA manifest, layout metadata, top headers, welcome hero banner, add modal, repo cards, workspace controls)
- [x] Next.js Structural Skeleton Indexer (`/lib/nextjs-indexer.ts`)
- [x] In-Memory Unix VFS Toolkit (`/lib/unix-vfs-tools.ts`)
- [x] Multi-Step Agentic Tool Loop & Unix-Augmented Fallback (`/lib/local-context-router.ts`)
- [x] Qwen-Coder MLC Integration (`@mlc-ai/web-llm`)
- [x] **Function-Level Relationship & Call Graph Mapper (`/lib/nextjs-code-graph.ts`)**
- [x] **Graph-Aware Unix VFS Tools (`/lib/unix-vfs-tools.ts`)**
- [x] **Local Router & UI Integration**
- [x] **Interactive Assistant Suggestion Chips (`/components/ChatCompiler.tsx`)**
- [x] **Gemini Thinking Configuration & Reasoning Traces (`/app/api/compile/route.ts`, `/components/ChatCompiler.tsx`, `/components/StepLoader.tsx`)**
- [x] **Cascading Model Resilience & Robust Streaming Fix (`/app/api/compile/route.ts`)**
- [x] **Complete Removal of Cashier & NOWPayments (Free App Confirmation)**
- [x] **Dynamic API Cost Estimation & Model Pricing Engine (`/types/index.ts`, `/lib/utils.ts`, `/app/api/compile/route.ts`, `/components/ChatCompiler.tsx`, `/components/RepoWorkspace.tsx`, `/components/ContextInspector.tsx`, `/components/StepLoader.tsx`)**
- [x] **Gemini 4 Argon Support & Customizable Fallback Waterfall (`/types/index.ts`, `/lib/utils.ts`, `/app/api/compile/route.ts`, `/components/SettingsModal.tsx`, `/hooks/useRepoStore.ts`, `/components/RepoWorkspace.tsx`)**:
  - Added `ModelConfig` interface and `models?: ModelConfig[]` to `AppSettings`.
  - Added Gemini 4 Argon to pricing tiers ($2/M input, $10/M output; $4/M & $20/M after Nov 30, 2026).
  - Updated API route handler to dynamically sort and filter cascading models by user priority.
  - Implemented interactive priority reordering (Up/Down controls) and enable/disable toggles in SettingsModal.
  - Added auto-migration in `useRepoStore` so existing local storage configurations immediately include Gemini 4 Argon.
  - Verified `compile_applet` and `lint_applet` with 0 errors.

## Current Status
Production Ready. Gemini 4 Argon model tier and fully customizable fallback waterfall with per-model enable/disable toggles and priority reordering are fully operational.
