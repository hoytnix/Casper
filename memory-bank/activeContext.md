# Active Context: Vercel Build Cache Invalidation & Clean Build Script

## Active Focus
Identified root cause of persistent Vercel build failures: Vercel restored a stale build cache (`6ipUocfzghUjvZtYLWRZB8HSGqff`) containing cached Webpack resolution graphs for `@/components/CashierModal` and `@nowpaymentsio/nowpayments-sdk-nodejs` from a previous deployment, even though those files and dependencies do not exist in the repository.

## Implementation Details
1. **`package.json` Build Script**:
   - Updated `"build"` script to `"rm -rf .next && next build"` so Vercel builds purge any restored `.next` build cache before compiling.
2. **Remote Verification**:
   - Confirmed via raw GitHub check that `main` branch `app/page.tsx` and `package.json` do not contain `CashierModal` or `nowpayments`.

## Verification
- `compile_applet`: Successful production build (0 errors).






