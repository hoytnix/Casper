# Active Context: CashierModal Stub Resolution & Build Guardrail

## Active Focus
Resolved Vercel deployment error `Can't resolve '@/components/CashierModal'` by creating a no-op stub component `components/CashierModal.tsx`.

## Implementation Details
1. **`components/CashierModal.tsx`**:
   - Added a lightweight, dependency-free stub component (`return null`).
   - Supports both default and named imports (`import CashierModal` and `import { CashierModal }`).
   - Ensures Webpack and Next.js can resolve `@/components/CashierModal` without throwing module resolution errors during Vercel builds, even if legacy code or cache references it.
2. **Now Payments Cleanup**:
   - Confirmed zero references or dependencies on `@nowpaymentsio/nowpayments-sdk-nodejs`.

## Verification
- `compile_applet`: Successful production build (0 errors).







