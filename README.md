<p align="center">
  <a href="https://rendley.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-transparent-light-text.png">
      <img src="https://raw.githubusercontent.com/rendleyhq/integrations/main/assets/rendley-lockup-transparent-dark-text.png" alt="Rendley" width="340">
    </picture>
  </a>
</p>

# Rendley integrations

[![CI](https://github.com/rendleyhq/integrations/actions/workflows/ci.yml/badge.svg)](https://github.com/rendleyhq/integrations/actions/workflows/ci.yml)

Official [Rendley](https://rendley.com) integrations for automation platforms. Rendley lets you **create, edit, and automate video**. These packages put the Rendley AI agent, AI media generation, transcription, dubbing, lip sync, media uploads and MP4 rendering into n8n, Zapier, Make and Apify.

| Package | Platform | Published as |
| --- | --- | --- |
| [n8n-nodes-rendley](packages/n8n-nodes-rendley/) | n8n | npm [`n8n-nodes-rendley`](https://www.npmjs.com/package/n8n-nodes-rendley) (community node) |
| [zapier-rendley](packages/zapier-rendley/) | Zapier | Zapier app `Rendley` |
| [make-rendley](packages/make-rendley/) | Make | Make app `Rendley` |
| [apify-rendley-video-agent](packages/apify-rendley-video-agent/) | Apify | Actor `rendley/rendley-ai-video-agent`, prompt to rendered video |
| [apify-rendley-media-tools](packages/apify-rendley-media-tools/) | Apify | Actor `rendley/rendley-ai-media-tools`, AI media generation and transforms |
| [rendley-client](packages/rendley-client/) | Internal | Not published. The shared Rendley API client bundled into the Zapier and Apify packages |
| [apify-common](packages/apify-common/) | Internal | Not published. Helpers copied into both Apify Actors |

Every integration authenticates with a Rendley API key from [app.rendley.com/settings](https://app.rendley.com/settings) and talks only to the Rendley API. See each package's README for installation, operations and examples.

## Layout

```
.
├── packages/               one folder per platform, plus the shared client
├── assets/                 Rendley icon and logo variants used by the platform listings
└── .github/workflows/
    ├── ci.yml              checks every package on each pull request
    └── publish.yml         deploys from the production branch
```

## Conventions shared by every integration

- **Waiting never loses a job.** Jobs run on Rendley for minutes or longer. n8n polls with retries on transient errors and, when its timeout ends, fails with the job ID and a pointer to Get Job. Zapier polls for about 20 seconds and returns the job ID with Is Complete false. Make returns the job ID at once and Get Job Status reads it. The Apify Actors wait for the rest of the run's own timeout, then hand the job off as running with its ID for a later run to pick up.

- **Outputs follow the Rendley API.** Field names are the API's own, so a job's download link is `url`, its parsed result is `result_data`, and the agent's reply is `last_message`. Where a platform can carry objects, the raw API job is included too, so nothing the API returns is lost.
- **Projects are optional.** The agent creates a project when none is given. AI actions save to the workspace library when no project is given, and offer a Workspace choice for accounts with several workspaces.
- **Catalog data comes from the API, not from the user.** Models, voices and dubbing languages are dropdowns loaded from Rendley, and model-specific parameters are documented in the [model catalog](https://docs.rendley.com/api/models) rather than restated per platform.
- **Inputs use the API's names** where the platform allows, for example `files` on the agent.
- **Agent files are imported first.** Every integration imports a file URL into the project through the API's import endpoint and hands the agent the resulting upload by media ID. Attaching a bare URL to the agent is not reliable.

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

The Rendley API client lives once in `packages/rendley-client` and is bundled into the packages that need it at build time. The Apify Actors also share `packages/apify-common/lib.js`. After editing either, run `npm run build:client` at the root and commit the regenerated files under `packages/apify-rendley-video-agent/src` and `packages/apify-rendley-media-tools/src`; CI fails if they are stale.

The media tools Actor mirrors Rendley's catalog in its input form (models, voices, dubbing languages) and in the Models section of its README. Refresh them with `RENDLEY_API_KEY=... npm run sync:catalog` in `packages/apify-rendley-media-tools` and commit the result whenever the catalog changes.

## Releasing

Deploys happen only from the `production` branch, so merging to `main` never publishes anything. To release a package:

1. Bump the version in its `package.json` and add an entry to its `CHANGELOG.md`.
2. Merge to `main`.
3. Fast-forward `production` to `main`:

```bash
git push origin main:production
```

The Publish workflow compares each package's version with what is already released and deploys only the packages with a new version. The others are skipped, not failed. The n8n package is published to npm with a provenance attestation, the Zapier package is built and attached to a GitHub release (and pushed to Zapier when a `ZAPIER_DEPLOY_KEY` secret is set), and the Apify Actors are pushed when an `APIFY_TOKEN` secret is set. Each deploy is tagged `<package>-v<version>`. The Make app is pushed from a developer machine with `npm run push` in its package, which needs a Make API token (see its README).

## License

[MIT](LICENSE). For support, write to support@rendley.com.
