# Active Context: Casper Rebrand + Dual-Framework Cartography (Next.js + Hono) + Dedicated Settings Page

## Active Focus
Implemented Muse Spark model integration across types, pricing, settings, and compile cascade (`muse-spark-1.3-contributor` $0.10/$0.20 per M, `muse-spark-1.3` $1.25/$4.25 per M):
- **Types (`/types/index.ts`)**: `AppSettings.museApiKey?`, `ModelPricingTier.cachedInputCostPerMillion?`.
- **Pricing (`/lib/utils.ts`)**: both Muse tiers in `MODEL_PRICING_TIERS`; `resolveModelPricing` matches contributor → standard → Gemini; `calculateModelCost` unchanged in shape. Three new `node:test` cases in `/lib/utils.test.ts` (10/10 pass).
- **Store (`/hooks/useRepoStore.ts`)**: Muse models at cascade priorities 1–2 (Gemini renumbered 3–7); `DEFAULT_SETTINGS.museApiKey = ''`; stored-settings migration backfills missing Muse/Argon entries.
- **Settings UI (`/app/settings/page.tsx`)**: Muse AI API Key password field persisted via `updateSettings`; model-list init merges missing Muse/Argon defaults (fixed stale `DEFAULT_MODELS[0]`-as-Argon assumption).
- **Compile route (`/app/api/compile/route.ts`)**: `customMuseApiKey`/`museApiKey` body key + `MUSE_API_KEY` env fallback (base override via `MUSE_API_BASE_URL`, default `https://api.muse.ai/v1` unconfirmed); `muse-` tags stream via edge-safe fetch SSE adapter into the shared pipeline; exploration stays Gemini-only; missing-key Muse tags skip with warn so the Gemini cascade still serves; muse-only cascade without key returns a 500 naming the missing key. Client (`RepoWorkspace`) forwards `settings.museApiKey`.
- Verified: `node --test lib/utils.test.ts` 10/10, `tsc --noEmit` clean, `eslint` clean on all touched files, `next build` green (`/settings` static, `/api/compile` dynamic).

Implemented dedicated full-width settings page (`/app/settings/page.tsx`, permalink `/settings`):
- **Settings Modal Removal**: Deleted `/components/SettingsModal.tsx`; all GitHub PAT, custom API key, model priority waterfall, router engine, warm-up, rounds, and timeout controls now live on the `/settings` page in a responsive 1→3 column grid.
- **Header Navigation**: `/components/Header.tsx` settings button is now a Next.js `<Link href="/settings">`; removed the `onOpenSettings` prop (made `onOpenAddModal` optional) and updated all callers (`/app/page.tsx`, `/app/chat/[owner]/[repo]/page.tsx`), which also dropped modal state and `<SettingsModal />` JSX.
- Verified: `eslint` clean on all touched files, `next build` green (types valid, `/settings` prerendered as static).

Implemented Next.js/Hono dual-mode repository cartography:
- **Permalinks (`/chat/[owner]/[repo]`)**: Added dynamic App Router route allowing users to visit and bookmark favorite repositories directly via URLs like `/chat/hoytnix/return` (with auto-resolution from GitHub API if not already in store).
- **Header Cleanup**: Removed the capability pills (`App Router Cartography • Server Component Graph • In-Memory Unix VFS • Gemini 4 Argon`) from the top header.
- **Screen Height & Scroll Optimization**: Locked app root, workspace, and chat containers to `h-screen flex flex-col overflow-hidden` with dedicated inner scrolling (`overflow-y-auto`) for messages and grids, preventing unnecessary document-level huge scroll bars.
- **Framework Detection (`/lib/framework-detector.ts`)**: New `detectRepositoryFramework(files, treePaths)` engine classifying repos as `nextjs` / `hono` / `unknown` via Hono imports, `new Hono()`, wrangler configs, Next.js configs, App/Pages dir patterns, and parsed `package.json` deps. No hardcoded Next.js-only default.
- **Hono Cartography**: Indexer classifies `hono-route` / `hono-middleware` roles; code graph maps `app.get/post/put/delete/patch/all/use/route` chains into routeMap with `route-handler` symbols and `httpMethod`.
- **Dual-Mode Compile (`/app/api/compile/route.ts`)**: Server detects framework per request and injects Hono Expert instructions (edge runtime, Zod validators, RPC bindings) for Hono repos; Next.js instructions otherwise. Classification streamed in `compiling_start` / `done` events.
- **Workspace Badge (`/components/RepoWorkspace.tsx`)**: Sub-header shows Next.js App Router (indigo) vs. Hono Edge Router (orange) badge; classification persisted on `Repo` and `IngestionSnapshot`.
- **Local Router Hono Support (`/lib/local-context-router.ts`)**: Framework-aware agent scope notes plus Hono scoring boosts (routes/, middleware, RPC, validators) in Arctic-Embed-XS and keyword fallback tiers.
