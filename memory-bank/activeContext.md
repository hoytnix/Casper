# Active Context: Dynamic Context-Aware Architectural Refactor Recommendations

## Active Focus
Successfully transformed static mock arrays for Suggested Follow-up Refactors and empty-state prompt triggers into dynamic, context-aware architectural recommendations generated live by Gemini based on active repository structure and file snapshots:
- **Types (`/types/index.ts`)**: Added `suggestedRefactors` to `ChatMessage`, `snapshotMeta`, and `SSEEventType`.
- **API Route (`/app/api/compile/route.ts`)**: Extended `NEXTJS_EXPERT_SYSTEM_INSTRUCTION` and response parsing to extract `---SUGGESTED_REFACTORS---` JSON arrays from Gemini and emit `suggested_refactors` SSE events.
- **Chat Compiler (`/components/ChatCompiler.tsx`)**: Replaced static prompt arrays and follow-up buttons with dynamic repo/snapshot-aware recommendations and AI-generated refactor pills.
- **Verification**: Successful production compilation (`npm run build`) and zero ESLint errors (`npm run lint`).

