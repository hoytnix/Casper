# Tech Context: Antigravity Prompt Compiler

## Technology Stack
- **Framework**: Next.js 15.4 (App Router)
- **Language**: TypeScript 5.9 (Strict mode)
- **Styling**: Tailwind CSS v4, tw-animate-css, Lucide React icons
- **Animations**: `motion/react` (Motion v12)
- **AI SDK**: `@google/genai` (v2.4.0) with `process.env.GEMINI_API_KEY`
- **Models**: `gemini-2.5-pro` (or `gemini-3.8-flash` fallback)
- **Persistence**: Browser `localStorage` for repository manifests, custom exclusion rules, and GitHub PAT credentials.
- **PWA**: Native App Router manifest (`manifest.ts`), service worker, and install prompts.

## Constraints & Environment Notes
- Next.js runs on Port 3000.
- Gemini API key MUST remain on the server side (`process.env.GEMINI_API_KEY`), never exposed to browser bundles.
- GitHub API public requests without PAT are subject to 60 requests/hour IP rate limits on git trees, so caching or PAT configuration is supported.
- `output: 'standalone'` in Next.js config.
