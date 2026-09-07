# Publishing n8n-nodes-rendley

What n8n requires for a verified community node, and the exact steps for this
package. Sources: n8n's verification guidelines and the submission guide at
docs.n8n.io (Connect → Create nodes).

This package lives in the `rendleyhq/integrations` monorepo at
`packages/n8n-nodes-rendley`. n8n verifies packages published this way (Daytona,
Cognee, Orq.ai, Probo and Picsart among others publish their verified nodes from a
folder of a larger repository); `package.json` declares the monorepo URL plus
`repository.directory`, which is what npm and the provenance check compare.

## Requirements checklist

- [x] Package name `n8n-nodes-rendley`, keyword `n8n-community-node-package`, MIT license.
- [x] `author` with name and email, `repository` with the public GitHub URL and
      `directory: packages/n8n-nodes-rendley`, `homepage`, `files: ["dist"]`,
      `peerDependencies: { "n8n-workflow": "*" }`.
- [x] No runtime `dependencies`, no file-system or environment access, TypeScript, all
      UI text and docs in English.
- [x] Exactly one third-party service (Rendley); no duplicate of a built-in node.
- [x] `n8n-node lint` clean and `npx @n8n/scan-community-package` clean.
- [x] README with installation, credentials, operations and example workflows.
- [ ] **The repository is public on GitHub** under `rendleyhq/integrations`
      (n8n checks that the npm `repository` URL resolves and matches).
- [ ] **Published from GitHub Actions with npm provenance** (mandatory since 1 May
      2026). The workflow is `.github/workflows/publish.yml` at the repository root
      and `@n8n/node-cli` is a devDependency, as the guide requires.
- [ ] Submitted at the n8n Creator Portal.

## First release, step by step

1. **Push the monorepo** to `rendleyhq/integrations` (public) and confirm the CI
   workflow is green.
2. **Reserve the package on npm.** The first publish cannot use Trusted Publishing
   because the package does not exist yet. From this folder, on a machine logged in
   to npm as the Rendley org owner:
   ```bash
   npm run build && npm publish --access public --dry-run   # inspect the tarball
   RELEASE_MODE=true npm publish --access public              # publishes 0.1.0 by hand
   ```
   (`RELEASE_MODE` is what `n8n-node prerelease` checks before allowing a publish.)
   The verified submission must be a provenance-signed version, so the next
   release-please release (0.1.1 or 0.2.0) is the one to submit.
3. **Set up Trusted Publishing** on npmjs.com: package → Settings → Publish access →
   Trusted Publishers → Add a publisher → GitHub Actions, with repository owner
   `rendleyhq`, repository name `integrations`, workflow name `publish.yml`,
   environment `npm`. Create the `npm` environment in the GitHub repository settings.
4. **Release.** Land conventional commits scoped to this package on `main`, for
   example `fix(n8n): …`. release-please opens *chore(main): release
   n8n-nodes-rendley x.y.z*; merging it tags `n8n-nodes-rendley-vx.y.z` and the
   `publish-n8n` job lints, builds, scans and runs `npm publish --provenance`.
   Check the npm page shows the *Provenance* badge.
5. **Verify the published package** the way n8n will:
   ```bash
   npx @n8n/scan-community-package n8n-nodes-rendley
   ```
6. **Submit for verification** at <https://creators.n8n.io/nodes>: sign in, add the
   package name, and submit. n8n fetches the package from npm for review. Until it is
   verified, the node is installable on self-hosted n8n via *Settings → Community
   Nodes* but not on n8n Cloud.
7. **Submit templates** at the Creator Hub (<https://creators.n8n.io>) after the node
   is verified. Each template in [`templates/`](../templates/) needs a description and a
   short tutorial in the submission form.

## Every later release

Merge the open release-please PR for `n8n-nodes-rendley` and watch the *Publish*
workflow. Nothing else needs to change; n8n picks up new versions of a verified
package automatically.
