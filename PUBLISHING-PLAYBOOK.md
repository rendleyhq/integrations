# Rendley integrations: publishing playbook

How to get each Rendley integration listed, what each platform's rules are, and how the repository is set up so people find them. Written on 5 September 2026 after every package was audited and live-tested against the Rendley API; restructured as a monorepo on 7 September 2026.

Priority order, by platform popularity: **n8n, Zapier, Make, Apify, Pipedream, Power Automate**, then Activepieces and Node-RED.

## 1. Before publishing anything

### 1.1 The monorepo

Every integration lives in one public repository, `github.com/rendleyhq/integrations`, as a package under `packages/` (npm workspaces). This is the layout Daytona, Cognee, Orq.ai, Probo and Picsart use for their n8n nodes and the one Twenty uses for its Zapier app; n8n verifies nodes published from a monorepo as long as `package.json` carries the repository URL plus `repository.directory`, which every package here does. No platform in this playbook requires a dedicated repository: Zapier, Make and Apify upload from the package folder, Pipedream, Activepieces and the Power Platform independent-publisher route are pull requests into someone else's monorepo, and Node-RED only reads npm.

First push, from the repository root:

```bash
cd ~/Workspace/rendley/integrations
gh repo create rendleyhq/integrations --public --source=. --remote=origin --push \
  --description "Rendley integrations for n8n, Zapier, Make, Apify, Pipedream, Activepieces, Node-RED and Power Platform: AI video editing and generation"
```

Then in the repository settings: *Actions → General → Allow GitHub Actions to create and approve pull requests* (release-please needs it), and create an environment named `npm` (the publish jobs run in it).

### 1.2 GitHub listing

Description to paste into "About": *Rendley integrations for n8n, Zapier, Make, Apify, Pipedream, Activepieces, Node-RED and Power Platform: AI video editing, prompt-to-video, text to speech, dubbing, transcription, MP4 rendering.*

GitHub topics (up to 20, lowercase, hyphens): `rendley`, `ai-video`, `ai-video-editor`, `video-generation`, `text-to-video`, `text-to-speech`, `transcription`, `video-dubbing`, `video-automation`, `n8n`, `n8n-community-node`, `zapier-integration`, `make-com`, `apify-actor`, `pipedream`, `power-automate`, `custom-connector`, `activepieces`, `node-red-contrib`, `integrations`. Topics are how GitHub search and the topic pages surface the repository ([GitHub docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)). Social preview: `rendley.com/affiliate-kit/promo/promo-1200x630.png`.

### 1.2a Releases

Commits on `main` use Conventional Commits scoped to the package (`feat(n8n): …`, `fix(zapier): …`). [release-please](https://github.com/googleapis/release-please) opens one release PR per package with unreleased changes; merging it bumps the version and CHANGELOG, tags `<package>-v<version>` and creates a GitHub release. `.github/workflows/publish.yml` then publishes `n8n-nodes-rendley` and `@rendley/node-red-rendley` to npm with a provenance attestation and attaches the Zapier build zip to the release. Everything else is pushed by hand as described per platform below.

### 1.3 Brand assets

The source of truth is the affiliate kit in `rendley.com/affiliate-kit` (`logo/`, `brand/brand-one-pager.png`). Every package carries a copy in its `assets/`; `assets/` at the repository root holds generated icon variants:

| File | Use it for |
| --- | --- |
| `rendley-mark.svg` / `rendley-mark.png` (512×512, transparent) | Zapier logo (needs a transparent PNG ≥256), n8n and Node-RED node icons, Pipedream and Activepieces logo uploads |
| `rendley-mark-on-graphite-512.png` (mark on Graphite #0C0C0C) | Apify Store logo, Make app logo, anywhere a filled square is required |
| `rendley-lockup-light.*` (mark + white wordmark, for dark backgrounds) and `rendley-lockup-dark.*` (dark wordmark, for light backgrounds) | READMEs, docs pages, listing banners |
| `power-platform-rendley/icon.png` (230×230, mark on Graphite) | The Power Platform connector icon, matching `iconBrandColor` #0C0C0C |
| `rendley.com/affiliate-kit/promo/promo-1200x630.png` | GitHub social preview for the repository |

Brand colours from the one-pager: Graphite #0C0C0C, Graphite 2 #141414, Lime accent #ABF92E, Paper #F4F2EC, Mark violet #7664E9, Mark pink #FF63A1, Mark amber #FFA928. Typefaces: Inter, Instrument Serif italic, JetBrains Mono. Use Mark violet as the theme colour where a platform asks for one (Make).

### 1.4 Author and contact

Every `package.json` and the Power Platform swagger `contact` name **Rendley** as the author with `support@rendley.com` as the public email. n8n requires the npm author to match the GitHub repository owner, so publish from an npm account that belongs to the Rendley organisation.

### 1.5 Naming and discoverability rules applied everywhere

- **Names follow each platform's convention** so directory search matches: `n8n-nodes-rendley` (required prefix), `@rendley/node-red-rendley` (Node-RED requires scoped names), `@activepieces/piece-rendley`, `@pipedream/rendley`, and `Rendley` as the app name inside Zapier, Make and Power Platform. npm asks for names that are "unique" and "descriptive" with no uppercase ([npm naming guidelines](https://docs.npmjs.com/package-name-guidelines)).
- **One pitch sentence** opens every README and every package description, carrying the terms people search for: *AI video editing and generation, prompt-to-video, text to speech, transcription, AI dubbing, lip sync, image, video and music generation, MP4 rendering*. npm, GitHub and the platform directories index the first paragraph and the description field.
- **Keywords** in `package.json` cover the platform names and the feature terms; npm search weights name, description and keywords.
- **Operation labels use the platform's vocabulary** (Title Case names, sentence-case descriptions, "Triggers when" for Zapier triggers, `x-ms-summary` for Power Platform) so in-product search finds them. n8n additionally gets a codex file (`nodes/Rendley/Rendley.node.json`) with categories and search aliases such as "text to video" and "dubbing" for its nodes panel.
- **Apify READMEs are landing pages**: the Rendley Actor README uses question-style H2 headings ("How much does it cost to generate a video with Rendley on Apify?") because Apify's guide says H2s and H3s feed search results and "People also ask" ([Apify README guide](https://docs.apify.com/actors/publishing/actor-readme)).

## 2. n8n (`n8n-nodes-rendley`)

**Status:** ready. `n8n-node lint` clean (two optional icon warnings), `@n8n/scan-community-package` passes, stub and live suites pass.

**Rules** ([verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines), [submission guide](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes)):

- Package name starts with `n8n-nodes-`, keyword `n8n-community-node-package`, MIT license.
- "Ensure that your package does not include any external dependencies"; "The code must not interact with environment variables or attempt to read/write files".
- "npm repository URL must match GitHub repository", "package author/maintainer must align across npm and repository", "git link must be functional and repository must be public".
- "Each package should integrate exactly one third-party service"; no duplicate of an existing node; no logic or flow-control nodes.
- Linter must pass: `npx @n8n/scan-community-package n8n-nodes-rendley`.
- "From May 1st 2026 you must publish ALL community nodes using a GitHub action and include a provenance statement"; the workflow must be named `publish.yml` and `@n8n/node-cli` 0.23.0 or newer must be a devDependency (both done).
- English only in the node and docs; README with installation, credentials, operations and examples.

**Steps:**

1. Push the monorepo to GitHub (public), see 1.1.
2. First publish, from `packages/n8n-nodes-rendley` on a machine logged in to npm: `npm run build && RELEASE_MODE=true npm publish --access public`. The first version cannot use Trusted Publishing because the package does not exist yet.
3. On npmjs.com: package → Settings → Publish access → Trusted Publishers → Add publisher → GitHub Actions, owner `rendleyhq`, repository `integrations`, workflow `publish.yml`, environment `npm`.
4. Release the version you submit: merge the release-please PR for `n8n-nodes-rendley`; the `publish-n8n` job lints, builds, scans and publishes with provenance. Confirm the npm page shows the *Provenance* badge.
5. Submit at <https://creators.n8n.io/nodes>. n8n reviews the npm package and, once verified, the node appears in the nodes panel of n8n Cloud and self-hosted instances with a shield icon.
6. Templates: submit the nine workflows in `templates/` through the Creator Hub after the node is verified; each needs a description and a short tutorial.

**Listing copy:** the npm description is already the pitch sentence. The node's display name is `Rendley`; its description is "Generate and edit videos with Rendley: prompt-to-video, AI media, projects, and MP4 export".

## 3. Zapier (`zapier-rendley`)

**Status:** ready. `zapier-platform validate` clean, `zapier-platform build` produces the zip, live suite passes. Remaining style notices are advisory (ID fields without dropdowns for job IDs, which have no list to pick from).

**Rules** ([publishing requirements](https://docs.zapier.com/platform/publish/integration-publishing-requirements), [integration checks](https://docs.zapier.com/platform/publish/integration-checks-reference), [operating constraints](https://docs.zapier.com/platform/build/operating-constraints)):

- Ownership: the owning account must have an admin with a `rendley.com` email; you must own the API and trademarks.
- Name exactly as in your branding (`Rendley`), unique in the directory, no "app", "integration", TM or domain.
- App description 40 to 140 characters, starting "Rendley is a…", no mention of Zapier or syncing (check M002).
- Logo: square PNG, at least 256×256, RGBA with transparency (M004). Use `assets/rendley-mark.png`.
- HTTPS only; credentials only in the authentication block; connection label without secrets; English only; production API only.
- Every trigger, action and search needs a live Zap with at least one successful run (T001), and three users with live Zaps before public review (S001).
- A non-expiring test account shared with `integration-testing@zapier.com`, with credits and an active subscription.
- Actions stop after 30 seconds, which is why the actions wait at most 20 seconds and expose `is_complete` plus Get Job Status.

**Steps:**

1. `npx zapier-platform login`, then `npx zapier-platform register "Rendley"` from the folder; fill homepage `https://rendley.com`, category (Video & Audio), description and logo.
2. `npm run validate && npm run test:live`, then `npm run push`.
3. In the developer platform, invite your own account, connect Rendley, and build one Zap per operation with a successful run.
4. Private beta: share the invite link with a few customers to accumulate live Zaps.
5. Request public review from the developer platform (<https://developer.zapier.com>) and answer the launch questionnaire.

**Listing copy:** app description (127 characters): *Rendley is an AI video editor and API that turns prompts into edited, rendered videos with AI voices, dubbing and captions.*

## 4. Make (`make-rendley`)

**Status:** ready. Structure tests and the IML-runtime live suite pass. Deployment needs the Make Apps Editor or the VS Code SDK; `makecomapp.json` has a placeholder `appId` until the app exists.

**Rules** ([review overview](https://developers.make.com/custom-apps-documentation/app-review/overview), [prerequisites](https://developers.make.com/custom-apps-documentation/app-review/prerequisites), [request review](https://developers.make.com/custom-apps-documentation/app-review/request-app-review)):

- "Your custom app uses a web service that is not already available in Make."
- "The base and connection have sanitization of sensitive data" and "error handling"; "Modules have correct labels and descriptions"; "The app has a universal module"; "All modules have the correct interface"; "Search modules, trigger modules, and RPCs have a limit parameter" and pagination where the API supports it.
- "You must create test scenarios"; "Use each module of the custom app in at least one test scenario"; logs without personal data; "Run your search and list modules to have logs with pagination".
- The review form asks for: your relationship with the API vendor, a support contact, categories and subcategories, the company logo, the service URL, the API documentation link, links to test scenarios, trademark and terms confirmations.

**Steps:**

1. Create the app in Make (Custom apps → Create) named `Rendley`, theme color `#7664E9`, logo from `assets/`, language English.
2. Load the components: paste each file into its tab, or use the VS Code "Make Apps SDK" extension with `makecomapp.json` (fill `appId`, region `baseUrl`, and put the Make API key in `.secrets/make-apikey`).
3. Set module types (search modules: List Projects, List Workspaces; universal: Make an API Call; the rest actions) and attach the connection everywhere.
4. Build one test scenario per module; run the search modules with a `limit`; keep the app invite-only.
5. Developer Hub → Custom apps → App review → Request app review, with API docs `https://docs.rendley.com` and service URL `https://rendley.com`. Approved apps are listed in the Make integrations directory.

**Listing copy:** *Rendley: AI video editing and generation. Turn prompts into edited videos with the Rendley AI agent, generate voiceovers, images, video and music, transcribe and dub media, and render MP4s.* Categories: AI, Video & Audio, Content & Files.

## 5. Apify (`apify-rendley`)

**Status:** ready. `apify validate-schema` passes, offline tests pass, `apify run` live suite passes.

**Rules** ([publishing overview](https://docs.apify.com/platform/actors/publishing), [publish](https://docs.apify.com/actors/publishing/publish), [README guide](https://docs.apify.com/actors/publishing/actor-readme), [quality score](https://docs.apify.com/actors/publishing/quality-score), [actor.json](https://docs.apify.com/platform/actors/development/actor-definition/actor-json)):

- Publication tab: logo, description, sample output, output schema, permissions; then "Publish on Store".
- README "clear, detailed, concise and readable", at least 300 words, H2/H3 headings with keywords, pricing section, input and output examples, FAQ.
- Quality score rewards an input schema, high run success, clear titles and descriptions, transparent pricing and least-privilege permissions.
- Maintenance expectation of about two hours a week; breaking changes announced in advance.

**Steps:**

1. `npx apify login`, then `npm run push` from `packages/apify-rendley` (creates `rendley/rendley-ai-video-editor`). To build from GitHub instead, set the Actor source to `https://github.com/rendleyhq/integrations#main:packages/apify-rendley`.
2. In Apify Console → Actor → Publication: upload the logo (`assets/rendley-mark-on-graphite-512.png`), set the categories (AI, Video, Automation), the SEO title and description below, choose the pricing model (free Actor with users paying Rendley credits is the simplest), and set permissions to the minimum.
3. Run it once from the Console with your own key so the store page shows a successful run, then *Publish on Store*.

**Listing copy:** title `Rendley AI Video Editor`; description: *Turn a prompt into an edited, rendered video, or run Rendley's AI actions: text to speech, transcription, dubbing, image, video and music generation, background removal and MP4 export.* SEO title: *Rendley AI Video Editor: prompt to video, TTS, dubbing and rendering on Apify*.

## 6. Pipedream (`pipedream-rendley`)

**Status:** ready. Structure tests and the live harness pass. Publishing is a pull request to Pipedream's registry.

**Rules** ([component guidelines](https://pipedream.com/docs/components/contributing/guidelines)):

- Layout `components/rendley/rendley.app.mjs`, `actions/`, `sources/`, `package.json`; ES modules only; requests through `@pipedream/platform`.
- Keys `rendley-<slug>`, semantic versions, title-case names, descriptions with a documentation link, `annotations` on actions, async options for ID props, secret props for sensitive input.
- Lint with the registry's config: `npx eslint components/rendley`.

**Steps:**

1. The `rendley` app must exist in Pipedream's app catalog with API key auth (`api_key`, optional `api_base_url`). Ask Pipedream through the form linked from the guidelines or in the PR.
2. Fork `PipedreamHQ/pipedream`, copy `components/rendley/` into `components/`, run `pnpm install` and the linter.
3. Open a pull request `[Components] rendley`; reviews happen on the PR and in Pipedream's Slack `#contribute` channel. Pipedream publishes after merge.

## 7. Power Automate (`power-platform-rendley`)

**Status:** ready for an environment import and the solution checker. The definition validates as OpenAPI 2.0 and passes the certification rules encoded in `npm test`; all 18 operations pass live. Microsoft's own `paconn validate` needs a signed-in machine.

**Rules** ([certification submission](https://learn.microsoft.com/en-us/connectors/custom-connectors/certification-submission)):

- Title in English, unique, at most 30 characters, no "API", "Connector" or Power Platform product names (`Rendley`).
- Description 30 to 500 characters, no product names.
- Operation and parameter summaries at most 80 alphanumeric characters; descriptions are full sentences; every operation has `operationId`, summary, description and `x-ms-visibility`; exact response schemas, no default responses, no empty schemas.
- API key connection parameter as `securestring`, `clearText: false`, `required: "true"`.
- Production host only; HTTPS only.
- Icon 1:1 between 100×100 and 230×230, non-white background matching `iconBrandColor`, logo within 70% (`icon.png` on Graphite `#0C0C0C`). Independent publishers must use `#da3b01`.
- Test each operation at least 10 times; run the solution checker; package with `intro.md`; validate with `ConnectorPackageValidator.ps1`.

**Steps:**

1. Import into a Power Automate environment (Custom connectors → Import an OpenAPI file) or `paconn create` from a signed-in machine; test operations and a polling flow.
2. Add the connector to a solution, run the solution checker, export the connector and flow solutions, add `intro.md`, zip, validate with the PowerShell script.
3. Verified publisher route (Rendley owns the API): upload the package to a blob with a SAS URL and submit in [Partner Center](https://partner.microsoft.com/dashboard/home). Independent publisher route: pull request to [microsoft/PowerPlatformConnectors](https://github.com/microsoft/PowerPlatformConnectors).
4. Certification takes weeks; Microsoft then lists the connector for all regions.

## 8. Activepieces (`activepieces-rendley`)

**Status:** ready. Typecheck, build, structure tests and the live harness pass. Published through a pull request to the Activepieces monorepo ([developer docs](https://www.activepieces.com/docs/developers/overview)).

Steps: fork `activepieces/activepieces`, copy `src/` and `package.json` to `packages/pieces/community/rendley`, switch the framework dependencies to `workspace:*`, copy `project.json` and configs from a neighbouring piece, add the 512×512 logo, `npx nx build pieces-rendley`, open the PR. `logoUrl` already points at the CDN path the maintainers assign.

## 9. Node-RED (`node-red-rendley`)

**Status:** ready. Offline tests and the live suite pass inside Node-RED's test helper.

**Rules** ([packaging guide](https://nodered.org/docs/creating-nodes/packaging)): scoped package name, `node-red` section in `package.json`, `node-red` keyword, README, license, one HTML file per node.

Steps: first version by hand from `packages/node-red-rendley` with `npm publish --access public` on a machine logged in to the `@rendley` npm scope, then add a Trusted Publisher on npm (owner `rendleyhq`, repository `integrations`, workflow `publish.yml`, environment `npm`) so later versions ship from the `publish-node-red` job when a release-please PR is merged. Add the node at <https://flows.nodered.org> (*Add node*). Later versions need a refresh request on the package page.

## 10. Final checklist

- [ ] Monorepo pushed to `rendleyhq/integrations`; Actions allowed to open PRs; `npm` environment created.
- [ ] npm account used for publishing belongs to the Rendley organisation (author is Rendley, support@rendley.com).
- [ ] GitHub description, topics and social preview set as in section 1.2.
- [ ] Logos uploaded where the platform asks (Zapier, Make, Apify, Activepieces, Power Platform icon), from `assets/` (official affiliate kit files).
- [ ] n8n: first npm publish, Trusted Publishing, provenance release, Creator Portal submission, then templates.
- [ ] Zapier: register, push, one Zap per operation, private beta, test account for Zapier, public review.
- [ ] Make: app created, components loaded, test scenarios, review requested.
- [ ] Apify: pushed, publication tab completed, published on Store.
- [ ] Pipedream, Activepieces: pull requests opened.
- [ ] Power Automate: solution checker, package, Partner Center submission.
- [ ] Node-RED: npm publish, Flow Library entry.
