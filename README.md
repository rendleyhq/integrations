# Rendley integrations

[![CI](https://github.com/rendleyhq/integrations/actions/workflows/ci.yml/badge.svg)](https://github.com/rendleyhq/integrations/actions/workflows/ci.yml)

Official Rendley integrations for no-code and automation platforms. AI video editing and generation from your workflows: prompt-to-video with the Rendley AI agent, text to speech, transcription, AI dubbing, lip sync, image, video and music generation, and MP4 rendering.

This is a monorepo. Each package under `packages/` is versioned, released and published independently, the same way [Daytona](https://github.com/daytona/integrations) and [Cognee](https://github.com/topoteretes/cognee-integrations) ship their integrations. Start with [PUBLISHING-PLAYBOOK.md](PUBLISHING-PLAYBOOK.md) for each platform's rules, steps and links.

| Package | Platform | Published as |
| --- | --- | --- |
| [n8n-nodes-rendley](packages/n8n-nodes-rendley/) | n8n | npm [`n8n-nodes-rendley`](https://www.npmjs.com/package/n8n-nodes-rendley) (verified community node) |
| [zapier-rendley](packages/zapier-rendley/) | Zapier | Zapier developer platform app `Rendley` |
| [make-rendley](packages/make-rendley/) | Make | Make custom app `Rendley` |
| [apify-rendley](packages/apify-rendley/) | Apify | Actor `rendley/rendley-ai-video-editor` |
| [pipedream-rendley](packages/pipedream-rendley/) | Pipedream | PR to `PipedreamHQ/pipedream` (`components/rendley`) |
| [activepieces-rendley](packages/activepieces-rendley/) | Activepieces | PR to `activepieces/activepieces` (`packages/pieces/community/rendley`) |
| [node-red-rendley](packages/node-red-rendley/) | Node-RED | npm [`@rendley/node-red-rendley`](https://www.npmjs.com/package/@rendley/node-red-rendley) + flow library |
| [power-platform-rendley](packages/power-platform-rendley/) | Power Automate / Power Apps / Logic Apps | Custom connector, certification through Partner Center |
| [rendley-client](packages/rendley-client/) | (internal) | Not published. The shared API client bundled into the Zapier, Apify and Node-RED packages |

## Layout

```
.
├── packages/               one folder per platform, plus the shared client
├── assets/                 generated icon variants (official brand files live in each package's assets/)
├── .github/workflows/
│   ├── ci.yml              runs every package's checks on each PR and push
│   └── publish.yml         release-please + npm publishing with provenance
├── release-please-config.json
└── .release-please-manifest.json
```

## Development

Node 20 or newer and npm 10 or newer. One install at the root sets up every package (npm workspaces):

```bash
npm install
npm test                                   # offline checks for every package
RENDLEY_API_KEY=... npm run test:live      # live suites against the Rendley API
```

Work on one package from its folder or with `-w`:

```bash
cd packages/n8n-nodes-rendley && npm run lint && npm run build
npm test -w packages/zapier-rendley
```

The Rendley API client lives once in `packages/rendley-client` and is bundled into the packages that need it at build time. After editing it, run `npm run build:client` at the root and commit the regenerated `packages/node-red-rendley/nodes/lib/rendley.js` and `packages/apify-rendley/src/rendley.js`; CI fails if they are stale.

## Releasing

Commits on `main` follow [Conventional Commits](https://www.conventionalcommits.org) with the package as scope, for example `feat(n8n): add Get Brand Kit operation` or `fix(zapier): handle 429 on job polling`. [release-please](https://github.com/googleapis/release-please) keeps one release pull request open per package that has unreleased changes. Merging it:

1. bumps that package's `package.json` version and `CHANGELOG.md`,
2. tags the commit `<package>-v<version>` (for example `n8n-nodes-rendley-v0.2.0`) and creates a GitHub release,
3. publishes the npm packages (n8n, Node-RED) from GitHub Actions with a provenance attestation, and attaches the Zapier `build.zip` to the release.

Platforms without a registry (Zapier push, Make, Apify, Pipedream, Activepieces, Power Platform) are pushed by hand after the release, as described in the playbook.

## License

MIT, Rendley. Support: support@rendley.com.
