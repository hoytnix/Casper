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

- [x] **Token Caching Discounts in Cost Calculations**:
  - Cached input rates per tier + `cachedInputTokens` split in `calculateModelCost` (`/lib/utils.ts`); optional cached fields on `ModelCostDetails`/`TokenCostRecord` (`/types/index.ts`).
  - Threaded through compile-route `costDetails`, workspace ledger + finance POST, finance API schema/record, Context Inspector breakdown + cost tooltip (cached rows render only when > 0).
  - Finance summary aggregates discounted `totalCostUsd` unchanged; streams still use char/4 estimates (no provider `usageMetadata` captured yet), so cached counts default to 0.
  - Verified: 36/36 `node:test` (4 new), `tsc` clean, `eslint` clean, `pnpm build` green.
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
Production-Ready. Triple-framework (Next.js + Hono + Vite) cartography live alongside permalinks, clean header, screen-height responsive layout, automated prompt expense logging, Muse Spark cascade integration, Muse-exclusive thinking effort levels (`xhigh`/`max`), MAX debilitation protocols across Prompt/Ideas/BTW, Muse single-token truncation fix, and fully synchronized Memory Bank.

## Completed Modules (cont.)
- [x] **Muse Single-Token Truncation Fix**:
  - New pure transport module `lib/muse-stream.ts` (parser + request builder, zero value imports); route rewired to it with no behavior change to the happy path
  - Pinned `max_tokens: 16384` in every Muse request; CRLF-aware SSE splitting, EOF trailing-event flush, non-SSE single-JSON fallback, content-block array extraction
  - Committed regression suite `lib/muse-stream.test.ts` 9/9 (5 failures observed pre-fix against verbatim logic)
  - Verified: 51/51 `node:test`, `tsc` clean, `eslint` clean, `pnpm build` green

## Completed Modules (cont.)
- [x] **Muse Spark MAX Debilitation Protocols (Prompt / Ideas / BTW)**:
  - Prompt-mode elevation protocol in both Next.js + Hono expert instructions (`/app/api/compile/route.ts`): boundary-assumption interrogation, dependency-first ordering, edge invariants, @[/path] citation rigor, mandatory dead-code purge
  - Ideas-mode hostile Venture Technologist rewrite (both frameworks): 77→7 via RICE + VRIN-EO, high-effort/low-EO kills, breakdown tables, grounded @[/path] targets
  - BTW-mode uncompromising assistant rewrite (both frameworks): call-graph tracing, exact entry→handler flows, line-precise citations, filler ban
  - `MUSE_MAX_DEBILITATION_OVERLAY` auto-prepended at `xhigh`/`max` thinking; normalization hoisted pre-estimation for accurate token costing
  - Verified: 42/42 `node:test`, `tsc` clean, `eslint` clean, `pnpm build` green

## Completed Modules (cont.)
- [x] **Muse-Exclusive Thinking Effort Levels (`xhigh` / `max`)**:
  - Five-level `ThinkingConfig` with `MuseThinkingLevel` vs `GeminiThinkingLevel` split (`/types/index.ts`); settings/progress/message threading fields
  - Provider helpers + 6 `node:test` cases (`/lib/thinking-levels.ts`, `/lib/thinking-levels.test.ts`): `xhigh`/`max` accepted, Gemini maps them to `high`
  - Compile route forwards full level to Muse (`reasoning_effort` + `thinkingConfig`), mapped config to Gemini (`/app/api/compile/route.ts`)
  - Store defaults + migration-safe validation (`/hooks/useRepoStore.ts`); Thinking Effort panel on `/settings`
  - Dynamic thinking-level indicators (`/components/StepLoader.tsx` with Muse-only badge, `/components/ChatCompiler.tsx`, `/components/RepoWorkspace.tsx`)
  - Verified: 42/42 `node:test`, `tsc` clean, `eslint` clean, `pnpm build` green

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

## Completed Modules (cont.)
- [x] **Opt-In Search Grounding (Muse `web_search` + Gemini `googleSearch`)**:
  - `SearchContextSize` + optional flags on `AppSettings` (`/types/index.ts`); pure normalizer + 3 tests (`/lib/search-grounding.ts`)
  - Conditional `web_search` tool in `buildMuseRequestBody` with byte-identical-off guarantee + regression guard (`/lib/muse-stream.ts`, 1 new test)
  - Flag forwarding to Muse + Gemini payloads (`/app/api/compile/route.ts`); store defaults/backfill (`/hooks/useRepoStore.ts`); compile POST wiring (`/components/RepoWorkspace.tsx`); toggle card + size dropdown (`/app/settings/page.tsx`)
  - Verified: 61/61 `node:test`, `tsc` clean, `eslint` clean, `pnpm build` green
- [x] **Muse 404 Root-Caused to Env Base URL + Endpoint Echo**:
  - Production 404 path `/hatch/v1/chat/completions` traced to operator `MUSE_API_BASE_URL` (no `/hatch/` in repo code; host alive, path wrong)
  - `buildMuseEndpoint` helper + endpoint in Muse errors (`/lib/muse-stream.ts`, `/app/api/compile/route.ts`, 1 new test); pending: operator corrects env value, commits get pushed/deployed
  - Verified: 57/57 `node:test`, `tsc` clean, `eslint` clean, `pnpm build` green
- [x] **Self-Diagnosing Cascade Failures + Nano Output-Language Fix**:
  - `summarizeCascadeFailures` helper + 4 `node:test` cases (`/lib/cascade-failures.ts`, `/lib/cascade-failures.test.ts`); per-model reasons threaded into the SSE `error` event (`/app/api/compile/route.ts`) and surfaced in the client error notice (`/components/RepoWorkspace.tsx`)
  - `outputLanguage: 'en'` on Gemini Nano session creation (`/lib/local-context-router.ts`)
  - Verified: 56/56 `node:test`, `tsc` clean, `eslint` clean, `pnpm build` green
- [x] **Cached Input Token Visibility + Far-Left Inspector Hamburger**:
  - `TokenCostSummary` cached totals / per-model / per-day fields (`/types/index.ts`); aggregation with `[0, input]` clamping (`/lib/finance-calculations.ts` + 1 new `node:test` case)
  - Amber `Cached Input` breakdown row in `/components/ContextInspector.tsx` (renders only when cached > 0)
  - Cached KPI card + `Cached Input` ledger column with cost tooltips in `/components/FinanceWorkspace.tsx`
  - Optional cached-tokens input with pricing-derived cached cost in `/components/AddTransactionModal.tsx`
  - Icon-only Context Inspector toggle at the far-left sub-header edge; right-aligned trigger removed (`/components/RepoWorkspace.tsx`)
  - Verified: 52/52 `node:test`, `tsc` clean, `eslint` clean (full `pnpm lint`), `pnpm build` green
- [x] **Muse `thinkingConfig` 400 Fix + Nano Execution-Config Check**:
  - `buildMuseThinkingPayload` sends only `reasoning_effort` (`/lib/thinking-levels.ts`); `buildMuseRequestBody` strips stale `thinkingConfig` (`/lib/muse-stream.ts`); Nano `availability({ outputLanguage: 'en' })` matches `create()` options (`/lib/local-context-router.ts`)
  - Regression coverage in `/lib/thinking-levels.test.ts` + `/lib/muse-stream.test.ts`
  - Verified: 62/62 `node:test`, `tsc` clean, `eslint` clean, `pnpm build` green
- [x] **Dual-Provider Search Grounding via Muse Responses API**:
  - Chat-Completions `web_search` 400 root-caused to Responses-only grounding; chat body never emits `tools` (`/lib/muse-stream.ts`)
  - New Responses transport: endpoint builder, request body (`input` array, `max_output_tokens`, nested `reasoning: { effort }`, conditional `web_search`), SSE delta parser (`/lib/muse-stream.ts`, 4 new tests); route branches grounded Muse to `/responses` and defaults base to `https://api.meta.ai/v1` (`/app/api/compile/route.ts`); SSE error/parse logging split (`/components/RepoWorkspace.tsx`); settings copy updated (`/app/settings/page.tsx`)
  - Verified: 66/66 `node:test`, `tsc` clean, `eslint` clean, `pnpm build` green
|- [x] **Local AI Suggested Architectural Directives (empty-state pipeline)**:
  - Directive contract first (`SuggestedDirective` / `DirectiveGenerationContext` / `DirectiveGenerationStatus` in `/types/index.ts`); Zod-first validators second (`/lib/suggestion-schemas.ts`: list schema min 1 max 4, dedupe, deterministic `buildFallbackDirectives`).
  - `generateSuggestedDirectives()` in `/lib/local-context-router.ts`: Qwen MLC → Nano clone → Arctic-Embed-XS templates → nonce-shuffled fallback; shared `parseJsonArray`; compact grounding via `summarizeGraphForDirectives()` + `countRolesForDirectives()`; never throws, always 4, honestly labeled engine.
  - `/components/ChatCompiler.tsx` consumes the hook: static `SUGGESTED_PROMPTS`/`hasApi`/`hasComponents`/`hasHooks` + hardcoded strings purged; skeleton cards, engine badge, refresh-with-nonce, dismiss-X; click populates input without auto-submit.
  - Per-repo `antigravity_directives_` cache + dismissed-prompt filter in `/hooks/useRepoStore.ts`; fire-and-forget pre-warm note in `/components/RepoWorkspace.tsx` (local-only, no API cost, no wrangler changes).
  - Hono invariants held: edge-safe Web APIs only on generation paths, Zod validation before UI wiring, no fabricated Hono routers, `/app/api/compile/route.ts` untouched.
  - Verified: `tsc --noEmit` clean, `eslint` clean, `pnpm build` green, 66/66 `node:test` pass, 10/10 validator/grounding behavior probes pass, zero stale static-prompt references, zero Node-only imports in client path.
|- [x] **Screenshot Upload + Attach in Chat (base64, Ctrl+V paste)**:
  - Contract first (`ImageMime` / `ImageAttachment` / message + snapshot + progress fields in `/types/index.ts`); validators second (`/lib/image-attachments.ts`: Zod limits 4 / 5MB / 7MB, downscale + JPEG recompress, Gemini/Muse mappers; 13 `node:test` cases).
  - Client ingestion (`/components/ChatCompiler.tsx`): paste interception, Attach picker, drag/drop, preview strip, inline user-bubble thumbnails outside Markdown, minimized count badge; copy stays text-only.
  - Orchestration (`/components/RepoWorkspace.tsx`): validated `handleCompilePrompt(prompt, images=[])`, text-only history, counts (not blobs) in snapshot, `+N images` finance notes.
  - Synthesis last (`/app/api/compile/route.ts` + `/lib/muse-stream.ts`): 400 on invalid/oversized, Gemini `inlineData`, Muse `image_url`/`input_image` (text-only bodies byte-identical), token uplift, `imageCount` in `compiling_start`.
  - Persistence (`/hooks/useRepoStore.ts`): load validation + 4.5MB quota guard with strip-oldest/text-only fallback; StepLoader image badge (`/components/StepLoader.tsx`).
  - Hono boundary: repo is Next.js App Router, no Hono routers/bindings exist — invariants applied as Next.js Server/Client boundaries + Zod route contracts instead; no wrangler changes, no new secrets.
  - Verified: `tsc --noEmit` clean, `eslint` 0 errors, `pnpm build` green, 79/79 `node:test` pass (13 new), zero Node-only imports in client path, zero browser globals in route.
|- [x] **False-Positive Hono Classification Fix (this repo is pure Next.js)**:
  - Reproduced live: 6 phantom `hono-route` + 2 phantom `hono-middleware` roles; detector returned `hono` on the repo's own tree.
  - Correction to the report: role counts never fed the detector/instruction choice — the flip came from substring scans hitting route.ts's embedded Hono prompt prose, then `*.test.ts` fixtures; fixed all three layers plus the router's bare-`hono` skeleton boost (now `[hono-` role-label only).
  - Statement-shaped `hasHonoImportStatement()` shared by detector/indexer/code-graph (`/lib/framework-detector.ts`, `/lib/nextjs-indexer.ts`, `/lib/nextjs-code-graph.ts`, `/lib/local-context-router.ts`); 8 regression tests in `/lib/hono-detection.test.ts` (4 failed pre-fix).
  - Verified: 87/87 `node:test` (8 new), `tsc` clean, `eslint` 0 errors, `pnpm build` green; probe now `nextjs`, zero Hono roles; stale persisted badge values self-heal on next compile.
|- [x] **Measured Cache-Read Telemetry (Cached Input no longer always 0)**:
  - Confirmed the trace: route passed 3 args (cached defaulted 0), chunk handler ignored `usageMetadata`, Muse parser surfaced text only.
  - Capture added: Gemini `usageMetadata.cachedContentTokenCount` max-accumulation (`extractGeminiCachedTokens` in `/lib/utils.ts`); Muse OpenAI-compatible usage via `parser.cachedInputTokens` + `usageCapture` out-param (`/lib/muse-stream.ts`, `/app/api/compile/route.ts`); 4th arg in the `done`-event `calculateModelCost`.
  - Deliberate deviations: Anthropic `cache_read_input_tokens` not read (wrong transport — repo's Muse API is OpenAI-compatible); no `stream_options` request change (400 risk on undocumented Meta API); utils/ContextInspector/finance untouched (contracts already supported it).
  - Verified: 92/92 `node:test` (5 new), `tsc` clean, `eslint` 0 errors, `pnpm build` green.
|- [x] **Single-Compile Ownership vs Double-Rendered Responses**:
  - Traced before coding: double-submit race + stale-closure finalization CONFIRMED in `/components/RepoWorkspace.tsx`; stream double-append NOT FOUND (functional appends, once-only firstChunk, emit-once flush — guards added as insurance, parser Step 3 reduced to a pinning test).
  - `compileId` ownership end-to-end (`/types/index.ts`, `/app/api/compile/route.ts` echo wrapper, workspace abort + stale-ignore + functional finalization, `/hooks/useRepoStore.ts` load/save dedupe, `/components/ChatCompiler.tsx` sync submit lock); `isDuplicateDelta`/`dedupeConsecutiveAssistantMessages`/`replaceAssistantContent` in `/lib/utils.ts`.
  - Deviations: equal-length resends swallowed (`<=`, sketch omitted it); dup-swallow is pure (no accumulation skew); icon-removal purge rejected (all four rendered); no duplicate thinkingLevel normalization existed.
  - Verified: 96/96 `node:test` (4 new), `tsc` clean, `eslint` 0 errors, `pnpm build` green.
