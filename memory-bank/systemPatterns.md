# System Patterns & Architecture

## System Architecture

```
[ Client: Next.js App Router ]
  ├── View 1: Repo Grid & Add Modal (localStorage state)
  ├── View 2: Repo Workspace & Streaming Chat
  │     ├── Context Drawer (File Tree + Token Calculator + Unix Trace Drawer)
  │     ├── Ingestion Engine (GitHub REST API + Raw Content Batcher)
  │     ├── In-Memory Unix VFS Tools (grep, find, head_tail, inspect_graph)
  │     └── Step Loader (Live Unix Tool Traces & Exploration Trail)
  └── Settings Modal (GitHub PAT & App Options)
         │
         │ POST /api/compile (Targeted Context + Improvements)
         ▼
[ Server: Next.js API Route /api/compile ]
  └── Google GenAI SDK (@google/genai)
        └── Models: Cascading Gemini Models (generateContentStream)
        └── Output: ReadableStream SSE chunks to Browser
```

## Key Ingestion Patterns & CORS Safety
- **Public Repositories**: Fetch tree from `https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1`. Fetch source code files using `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}`, which provides complete CORS safety and avoids GitHub REST content rate limits.
- **Private Repositories / With PAT**: When a user configures a GitHub PAT in settings, send `Authorization: Bearer <PAT>` and fetch blobs via `https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}` with `Accept: application/vnd.github.v3.raw`.
- **In-Memory Unix VFS Toolkit (`/lib/unix-vfs-tools.ts`)**: Zero-latency pure TypeScript tools (`grep`, `find`, `head_tail`, `inspect_graph`) operating directly on in-memory source files with strict match length caps.
- **Multi-Step Agentic Loop (`/lib/local-context-router.ts`)**: Bounded 3-step tool-calling loop for Chrome Gemini Nano (`window.LanguageModel`) and Unix-augmented Snowflake Arctic-Embed-XS fallback.

## Compiler Prompt Format
Enforce Antigravity rules:
1. Every path formatted as `@[/path/to/file.ext]`.
2. No citations or external markers.
3. Encapsulated in ````markdown ... ````.
4. Dependency-first ordering (types -> schema -> logic -> UI).
5. Explicit Blast Radius, Atomic Steps, Dead Code Purge, Verification.
