# @rendley/integrations-client

The one Rendley API client shared by the integrations in this monorepo. It is **not published to npm**: each consumer bundles `src/rendley.ts` into its own tree with esbuild so that every platform package stays self-contained and publishable on its own.

| Consumer | How it uses the client |
| --- | --- |
| `packages/zapier-rendley` | imports `@rendley/client` (a tsconfig path alias) and bundles it into `index.js` with `npm run build` |
| `packages/node-red-rendley` | `npm run build:client` writes `nodes/lib/rendley.js` (CommonJS), which is committed |
| `packages/apify-rendley` | `npm run build:client` writes `src/rendley.js` (ESM), which is committed |

After changing `src/rendley.ts`, run `npm run build:client --workspaces --if-present` from the repository root and commit the regenerated bundles.
