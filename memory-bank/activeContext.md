# Active Context: Casper Rebrand + Dual-Framework Cartography (Next.js + Hono) + Dedicated Settings Page

## Active Focus
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
