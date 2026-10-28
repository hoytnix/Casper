# 👻 Casper — The Friendly Ghost Who Reads All Ur Code

> Human ideas in. Antigravity-ready execution choreographies out.

Casper is a dark-mode Progressive Web App that bridges the gap between a vague
feature request and an autonomous coding agent. Point it at any GitHub repo and
it ingests the live source tree, maps the architecture, and streams a precise,
step-by-step compilation prompt — with exact `@[/path/to/file]` citations,
dependency-first ordering, and a blast radius — that agents like Antigravity
can execute without hallucinating file edits.

## ✨ What it does

- **📦 Repository hub** — Track repos with branch tags, descriptions, stars,
  and sync status. Deep-linkable permalinks (`/chat/owner/repo`).
- **🔍 Live ingestion engine** — Fetches the latest commit SHA and recursive
  git tree on every compile, filters lockfiles/binaries/assets, and downloads
  source files concurrently in batches. Zero CORS issues, zero stale context.
- **🗺️ Triple-framework cartography** — Auto-detects **Next.js App Router**,
  **Hono edge services**, and **Vite SPAs**, then maps pages, route handlers,
  middleware, RPC bindings, and SPA entry points into a queryable code graph.
- **🤖 In-browser local AI router** — A tiered cascade that runs entirely on
  your machine: **Qwen Coder (MLC/WebGPU)** → **Gemini Nano (Chrome built-in)**
  → **Arctic-Embed-XS (Transformers.js)** → deterministic keyword fallback.
  Powers repo-grounded Suggested Architectural Directives on every workspace
  load — offline-safe, zero API cost.
- **🌊 Streaming compiler** — Server-side cascade across **Muse Spark**
  (`muse-spark-1.3` + contributor) and **Gemini** (4 Argon, 3.8/3.6/3.5 Flash)
  models with live SSE streaming, thinking/reasoning trails, and graceful
  fallback passes. Optional web-search grounding per provider.
- **💰 Cost ledger** — Every compile logs input/output/cached tokens and USD
  cost per model, with history charts and a finance workspace. Cached reads
  bill at 10% like the providers do.
- **📲 PWA** — Installable, offline indicator, iOS-ready.

## 🚀 Quickstart

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Requires **Node 20+** and **pnpm exclusively** — never npm, bun, or bunx.

### Environment

| Variable            | Where      | Purpose                                  |
|---------------------|------------|------------------------------------------|
| `GEMINI_API_KEY`    | server only| Gemini synthesis cascade                 |
| `MUSE_API_KEY`      | server only| Muse Spark cascade (or per-user key in `/settings`) |
| `MUSE_API_BASE_URL`| server only| Muse host override (default `https://api.meta.ai/v1`) |

> Keys stay server-side. The browser bundle never sees them. A GitHub PAT can
> optionally be saved in `/settings` for private repos and higher rate limits.

## 🧠 How a compile works

```
You: "add rate limiting to the API"
        │
        ▼
┌─ 1. Live snapshot ─────────────────────────────┐
│ Latest SHA → recursive tree → filtered blobs → │
│ concurrent downloads (zero-download delta      │
│ cache when HEAD is unchanged)                  │
└──────────────────────┬─────────────────────────┘
                       ▼
┌─ 2. Local context router (in-browser) ─────────┐
│ Nano/Qwen agentic Unix tool loop (grep, find,  │
│ head_tail, inspect_graph, trace_call_graph) +  │
│ Arctic embeddings + import-closure expansion   │
└──────────────────────┬─────────────────────────┘
                       ▼
┌─ 3. Server synthesis (streamed) ───────────────┐
│ Muse Spark ⇆ Gemini cascade → SSE chunks →     │
│ step loader, thinking trail, cost meter        │
└──────────────────────┬─────────────────────────┘
                       ▼
        📋 Copy Compiled Prompt → Antigravity
```

Every compiled prompt enforces the house style: `@[]` path syntax,
quadruple-backtick encapsulation, dependency-first ordering
(types → schemas → logic → UI), explicit blast radius, dead-code purge, and
verification checks.

## 🛠️ Scripts

```bash
pnpm dev     # local dev server
pnpm build   # production build
pnpm start   # serve production build
pnpm lint    # eslint
```

`node --test lib/*.test.ts` runs the pure-module regression suites
(66+ cases covering parsers, pricing, grounding, and graph helpers).

## 🗂️ Repo layout

```
app/                  # Next.js App Router: pages, /settings, /finance,
                      # /chat/[owner]/[repo], /api/compile, /api/finance
components/           # RepoWorkspace, ChatCompiler, ContextInspector, …
hooks/                # useRepoStore (localStorage + IndexedDB persistence)
lib/                  # Ingestion, code graph, local AI router, streaming,
                      # pricing, framework detection — see below
types/                # Shared contracts (edge-safe, no runtime imports)
memory-bank/          # Persistent architecture notes across sessions
```

Key modules:

| Module | Role |
|--------|------|
| `lib/github.ts` | Tree fetch, batch downloads, delta sync |
| `lib/nextjs-indexer.ts` | File-role classification + import closure |
| `lib/nextjs-code-graph.ts` | Symbols, call/render edges, route maps |
| `lib/local-context-router.ts` | Tiered local-AI engine + directive generation |
| `lib/suggestion-schemas.ts` | Zod contracts for generated directives |
| `lib/muse-stream.ts` / `lib/chat-history.ts` | Provider transports, bounded history |
| `lib/utils.ts` | Pricing tiers, cost math, prompt formatting |

## 👻 Why "Casper"?

Because he's the friendly ghost who reads all ur code lol — floats through
your repo tree, rattles the right chains (call graphs), and hands your agent
a plan so precise it can't get lost.

---

Built with Next.js 15, TypeScript strict, Tailwind v4, and Motion. Happy haunting. 👻
