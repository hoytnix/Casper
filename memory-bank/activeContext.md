# Active Context: UI Nomenclature & Embedded Model Progress Interstitial

## Active Focus
Successfully completed UI updates and local AI model progress reporting:
- **Button Nomenclature**: Updated workspace mode toggle buttons from "Idea Mode (Top 7)" to **"Ideas"** and "btw Mode" to **"BTW"**.
- **Settings Modal Cleanup**: Purged redundant "Default Compilation Strategy" section and state bindings from `SettingsModal.tsx`.
- **Embedded Model Progress Interstitial**: Upgraded `warmUpLocalContextRouter` and `routeNextJsContext` in `local-context-router.ts` to accept optional `onProgress` callbacks. Integrated live download and embedding progress reporting into `StepLoader.tsx` and `SettingsModal.tsx` for `@mlc-ai/web-llm` and `@huggingface/transformers`.
- **Verification**: Verified successful build and linting.




