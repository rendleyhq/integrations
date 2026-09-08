<p align="center">
  <a href="https://rendley.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-transparent-light-text.png">
      <img src="https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-transparent-dark-text.png" alt="Rendley" width="340">
    </picture>
  </a>
</p>

# @rendley/integrations-client

The Rendley API client shared by the integrations in this repository. It is **not published to npm**: each consumer bundles `src/rendley.ts` into its own tree with esbuild so that every platform package stays self-contained.

| Consumer | How it uses the client |
| --- | --- |
| `packages/zapier-rendley` | imports `@rendley/client` (a tsconfig path alias) and bundles it into `index.js` with `npm run build` |
| `packages/apify-rendley-video-agent` | `npm run build:client` writes `src/rendley.js` (ESM), which is committed |
| `packages/apify-rendley-media-tools` | same as the agent Actor |

After changing `src/rendley.ts`, run `npm run build:client` from the repository root and commit the regenerated bundle.
