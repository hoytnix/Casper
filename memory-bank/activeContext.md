# Active Context: Configurable Max Agentic Rounds & Sequential Exploration Fix

## Active Focus
Successfully resolved the agentic exploration round limitation bug:
- **Server API Route (`/app/api/compile/route.ts`)**: Extracted `maxRounds` from the request body, bounded it safely via `Math.min(Math.max(1, Number(rawMaxRounds) || 3), 4)`, and updated the agentic iteration loop to execute up to `maxRounds`.
- **Repo Workspace (`/components/RepoWorkspace.tsx`)**: Passed `maxRounds: settings.maxAgenticRounds || 3` into the initial exploration progress state and the `/api/compile` fetch payload.
- **Step Loader (`/components/StepLoader.tsx`)**: Verified dynamic round badge rendering reflecting `Round {currentRound} of {maxRounds}`.
- **Verification**: Successful production compilation (`npm run build`) and zero ESLint errors (`npm run lint`).
