# Product Context: Antigravity Prompt Compiler

## Problem Domain
Autonomous coding agents like Antigravity require precise architectural choreographies, explicit target file manifests with `@[]` references, blast radius definitions, and ordered execution steps to prevent build breaks or hallucinated file edits. Manually inspecting a repository, gathering relevant files, and writing these structured prompts is tedious and error-prone.

## UX & Workflows
1. **Repository Hub (View 1)**:
   - High-contrast, dark slate visual identity (`bg-slate-950`, glassmorphism, indigo/violet glows).
   - Bento grid with cards displaying `owner/repo`, branch tags, description, stars/metadata, and quick launch.
   - Settings dialog to input/update GitHub PAT (for private repos and avoiding 60 req/hr rate limits) and optional custom API key override.
   - "+ Add Repository" modal supporting `owner/repo` strings or full GitHub URLs (`https://github.com/owner/repo`), with live pre-check and branch resolution.

2. **Repo Workspace & Chat Compiler (View 2)**:
   - Top status header with branch picker, live ingestion status pill, and drawer toggles.
   - **Collapsible Context Inspector**:
     - Real-time directory tree with file sizes and estimated token consumption.
     - Interactive exclude patterns (e.g., exclude tests, docs, or specific subfolders) with file selection toggles.
   - **Main Chat & Execution Interface**:
     - Input improvements list (e.g., Markdown checklist or feature specs).
     - Live 3-phase animated step-loader:
       1. "Fetching latest commit tree from GitHub..."
       2. "Downloading & unpacking X source files in memory..."
       3. "Streaming architectural choreography from Gemini..."
     - Assistant response rendered with code formatting and dedicated "Copy Compiled Prompt" action.
     - History of prompt compilation runs for the current repository session.
