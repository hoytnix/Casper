# Project Brief: Antigravity Prompt Compiler

## Executive Summary
Antigravity Prompt Compiler is a sleek, dark-mode Progressive Web App (PWA) designed to bridge human development requests with autonomous coding agents (specifically Antigravity). It maintains a persistent grid of GitHub repositories, dynamically inspects live repository trees and source files directly from GitHub with zero CORS issues, flattens repository context with strict token/file hygiene, and streams high-precision, architectural prompts compiled via Google Gemini (`gemini-2.5-pro` / `gemini-3.8-flash` via `@google/genai`).

## Core Objectives
1. **GitHub Repository Management**:
   - Manage and persist repositories in `localStorage` with metadata, branches, descriptions, and sync timestamps.
   - Support public and private repos (optional GitHub Personal Access Token stored client-side in settings).
   - Fast URL and `owner/repo` validation via GitHub API.

2. **Live Ingestion Engine**:
   - On every compile request, execute a live fetch of the latest commit SHA and recursive git tree.
   - Filter out lockfiles, binary files, assets, `.git`, `node_modules`, `dist`, etc.
   - Download source files concurrently in batches of 15 (CORS-safe raw GitHub / GitHub API with token).
   - Compute character and estimated token counts (`Math.ceil(chars / 4)`).
   - Assemble a structured `@/path` repository snapshot and directory tree.

3. **Compiler LLM & Streaming Prompt Engine**:
   - Server-side Next.js route calling `@google/genai` with streaming response (SSE / ReadableStream).
   - Strict Antigravity compiler system prompt enforcing `@[]` syntax, quadruple-backtick encapsulation, dependency ordering, target manifest, blast radius, step-by-step choreographies, dead code purge, and verification checks.
   - Sleek multi-stage step loader UI during repo ingestion and generation.
   - One-click "Copy Compiled Prompt" for raw Markdown extraction.

4. **PWA Compliance**:
   - Native App Router manifest (`app/manifest.ts`), iOS meta tags, SVG and PNG icons, offline indicator banner, and in-app install prompt.
