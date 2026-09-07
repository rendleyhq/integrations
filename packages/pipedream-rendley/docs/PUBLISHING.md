# Publishing the Rendley Pipedream components

Source: Pipedream's [component guidelines](https://pipedream.com/docs/components/contributing/guidelines).

## Requirements (satisfied)

- Layout `components/rendley/rendley.app.mjs`, `actions/`, `sources/`, `common/`, `package.json` named `@pipedream/rendley` depending on `@pipedream/platform`.
- ES modules only; requests through `@pipedream/platform` axios; app auth read from `this.$auth`.
- Component keys `rendley-<slug>`, semantic versions starting at `0.1.0`, names in title case, descriptions with a documentation link, `annotations` on every action, `dedupe: "unique"` and `sampleEmit` on sources.
- Async options on ID props (projects, workspaces, voices, languages, models).

## Steps

1. The `rendley` app must exist in Pipedream's app catalog with API key auth (fields `api_key`, optional `api_base_url`). Request it through the partner form linked from the guidelines, or note it in the pull request; Pipedream staff create the app entry.
2. Fork `PipedreamHQ/pipedream`, copy `components/rendley/` into `components/`, run `pnpm install` and `npx eslint components/rendley --fix`.
3. Open a pull request titled `[Components] rendley` describing the actions and sources. Reviews happen in the `#contribute` channel of Pipedream's Slack and on the PR.
4. After merge, Pipedream publishes the components; version bumps follow semver and shared-file changes bump every dependent component.
