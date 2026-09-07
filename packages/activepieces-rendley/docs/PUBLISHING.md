# Publishing the Rendley Activepieces piece

Source: the Activepieces developer docs at <https://www.activepieces.com/docs/developers/overview> and the community pieces in `packages/pieces/community`.

## Requirements (satisfied)

- `createPiece` with display name, description, auth, `minimumSupportedRelease`, logo URL, authors, actions and triggers; a `createCustomApiCallAction`.
- `PieceAuth.SecretText` with a `validate` that calls the API.
- Actions with snake_case names, display names, descriptions and typed props; dropdowns disabled until a connection exists.
- Polling triggers built on `pollingHelper` with `DedupeStrategy.LAST_ITEM` and `sampleData`.

## Steps

1. Fork [activepieces/activepieces](https://github.com/activepieces/activepieces). Copy `src/` and `package.json` to `packages/pieces/community/rendley/`; change the framework dependencies to `workspace:*` and copy `project.json`, `tsconfig.json`, `tsconfig.lib.json` and `.eslintrc.json` from a neighbouring piece (for example `heygen`).
2. Add the logo (512×512 PNG) to the pull request as the maintainers ask; `logoUrl` already points at `https://cdn.activepieces.com/pieces/rendley.png`.
3. `npx nx build pieces-rendley`, `npx nx lint pieces-rendley`, then run the piece in a local Activepieces instance (`npm run dev` in the monorepo, with `AP_DEV_PIECES=rendley`).
4. Open a pull request. Community pieces are reviewed by the Activepieces team and released with the next platform version.

For a private deployment, `npm run build` produces `dist/` that can be installed as a custom piece from the admin console.
