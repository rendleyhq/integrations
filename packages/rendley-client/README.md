# @rendley/integrations-client

The Rendley API client shared by the integrations in this repository. It is **not published to npm**: each consumer bundles `src/rendley.ts` into its own tree with esbuild so that every platform package stays self-contained.

| Consumer | How it uses the client |
| --- | --- |
| `packages/zapier-rendley` | imports `@rendley/client` (a tsconfig path alias) and bundles it into `index.js` with `npm run build` |
| `packages/apify-rendley` | `npm run build:client` writes `src/rendley.js` (ESM), which is committed |

After changing `src/rendley.ts`, run `npm run build:client` from the repository root and commit the regenerated bundle.
