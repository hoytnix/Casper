# Active Context: Gemini 4 Argon Support & Customizable Model Fallback Waterfall

## Active Focus
Implemented support for the new **Gemini 4 Argon** model across the API route handler, settings modal, and model configuration pipeline. Users can now reorder model priorities and granularly toggle individual models on/off, customizing their cascading fallback waterfall.

## Implementation Details
1. **TypeScript Definitions (`types/index.ts`)**:
   - Added `ModelConfig` interface (`id`, `name`, `tag`, `description`, `enabled`, `priority`, `inputPricing`, `outputPricing`).
   - Extended `AppSettings` to include `models?: ModelConfig[]`.

2. **Model Pricing & Cost Calculator (`lib/utils.ts`)**:
   - Added `gemini-4-argon` to `MODEL_PRICING_TIERS`:
     - Pricing: $2/M input, $10/M output ($4/M & $20/M after Nov 30, 2026).
     - Automated date boundary detection (`2026-11-30T23:59:59Z`).
   - Updated `resolveModelPricing` to resolve `argon` / `gemini-4` / `gemini-4-argon` variants.

3. **Compiler Route Handler (`app/api/compile/route.ts`)**:
   - Updated `DEFAULT_CASCADING_MODELS` to include `gemini-4-argon` as the primary tier.
   - Dynamically parses, filters enabled models, and sorts by user-defined priority (`models` / `customModels`) from client request payload.
   - Cascades through enabled user models during agentic exploration and prompt synthesis loops.

4. **Settings Store Initializer (`hooks/useRepoStore.ts`)**:
   - Added `DEFAULT_MODELS` with Gemini 4 Argon, Gemini 3.6 Flash, Gemini 3.5 Flash, Gemini 3.8 Flash, and Gemini 3.5 Flash-Lite.
   - Updated `DEFAULT_SETTINGS` with `preferredModel: 'gemini-4-argon'` and default model list.
   - Added storage migration logic ensuring existing user sessions in `localStorage` automatically receive `gemini-4-argon`.

5. **Settings Modal UI (`components/SettingsModal.tsx`)**:
   - Built interactive model management UI in place of the old static cascading list.
   - Supports priority reordering via up/down buttons and automatic priority re-indexing.
   - Supports individual model enable/disable toggle pills with failsafe to keep at least one model active.
   - Displays pricing details for Gemini 4 Argon and all other tiers, with a one-click Reset to Defaults option.

6. **Repo Workspace Integration (`components/RepoWorkspace.tsx`)**:
   - Forwards `settings.models` to the `/api/compile` route handler during prompt compilation.

## Verification
- `compile_applet`: Production build passed with 0 errors.
- `lint_applet`: ESLint validation passed with 0 warnings or errors.
