# Rendley integrations

[![CI](https://github.com/rendleyhq/integrations/actions/workflows/ci.yml/badge.svg)](https://github.com/rendleyhq/integrations/actions/workflows/ci.yml)

Official [Rendley](https://rendley.com) integrations for automation platforms. Bring AI video editing and generation into your workflows: prompt-to-video with the Rendley AI agent, text to speech, transcription, AI dubbing, lip sync, image, video and music generation, media uploads and MP4 rendering.

| Package | Platform | Published as |
| --- | --- | --- |
| [n8n-nodes-rendley](packages/n8n-nodes-rendley/) | n8n | npm [`n8n-nodes-rendley`](https://www.npmjs.com/package/n8n-nodes-rendley) (community node) |
| [zapier-rendley](packages/zapier-rendley/) | Zapier | Zapier app `Rendley` |
| [make-rendley](packages/make-rendley/) | Make | Make app `Rendley` |
| [apify-rendley](packages/apify-rendley/) | Apify | Actor `rendley/rendley-ai-video-editor` |
| [rendley-client](packages/rendley-client/) | Internal | Not published. The shared Rendley API client bundled into the Zapier and Apify packages |

Every integration authenticates with a Rendley API key from [app.rendley.com/settings](https://app.rendley.com/settings) and talks only to the Rendley API. See each package's README for installation, operations and examples.

## Layout

```
.
├── packages/               one folder per platform, plus the shared client
├── assets/                 Rendley icon and logo variants used by the platform listings
└── .github/workflows/
    ├── ci.yml              checks every package on each PR and push
    └── publish.yml         deploys from the production branch
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

The Rendley API client lives once in `packages/rendley-client` and is bundled into the packages that need it at build time. After editing it, run `npm run build:client` at the root and commit the regenerated `packages/apify-rendley/src/rendley.js`; CI fails if it is stale.

## Releasing

Deploys happen only from the `production` branch, so merging to `main` never publishes anything. To release a package:

1. Bump the version in its `package.json` and add an entry to its `CHANGELOG.md`.
2. Merge to `main`.
3. Fast-forward `production` to `main`:

```bash
git push origin main:production
```

The Publish workflow compares each package's version with what is already released and deploys only the packages with a new version. The others are skipped, not failed. The n8n package is published to npm with a provenance attestation, the Zapier package is built and attached to a GitHub release (and pushed to Zapier when a `ZAPIER_DEPLOY_KEY` secret is set), and the Apify Actor is pushed when an `APIFY_TOKEN` secret is set. Each deploy is tagged `<package>-v<version>`. The Make app has no CLI deploy; import the folder with the Make VS Code extension.

## License

[MIT](LICENSE). Support: support@rendley.com.
