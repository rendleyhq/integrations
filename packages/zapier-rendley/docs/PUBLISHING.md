# Publishing the Rendley Zapier integration

Sources: Zapier's [integration publishing requirements](https://docs.zapier.com/platform/publish/integration-publishing-requirements) and [integration checks reference](https://docs.zapier.com/platform/publish/integration-checks-reference).

## What Zapier requires

- **Ownership.** The integration must be owned by an account whose email domain matches rendley.com, with at least one admin team member on that domain. You must own the API and the trademarks.
- **Naming.** The app name is exactly `Rendley`, no "app", "integration", TM or domain. The description in the platform UI must start with "Rendley is a..." and be 40 to 140 characters without mentioning Zapier.
- **Branding.** A square PNG logo, at least 256×256, RGBA with transparency; a homepage URL; a category.
- **Authentication.** Credentials only in the authentication block (done: API key), HTTPS-only endpoints (done), a connection label without secrets (done: the first workspace name).
- **Quality.** Production endpoints only, English only, every visible trigger, action and search has a live Zap with at least one successful run, no unhandled errors. The automated checks (D001 to D028, Z001) are satisfied by the code: title-case labels, trigger descriptions starting with "Triggers when", help text on every field, samples matching output fields, dynamic dropdowns on ID fields.
- **Launch.** A non-expiring test account shared with `integration-testing@zapier.com` that has credits and an active subscription; at least three users with live Zaps before public review; the app must be fully launched (not invite-only) when review is requested.

## Steps

1. **Log in and register** (once, from this folder):
   ```bash
   npx zapier-platform login
   npx zapier-platform register "Rendley"
   ```
   Fill in the homepage, description, category and logo when prompted, or later in the [developer platform](https://developer.zapier.com).
2. **Validate and push**:
   ```bash
   npm run validate
   npm run test:live        # with RENDLEY_API_KEY set
   npm run push             # builds and uploads version 1.0.0
   ```
3. **Test inside Zapier.** Invite yourself, connect an account, and turn on one Zap per trigger, action and search with a successful run. Zapier's check T001 needs a run for every visible operation, S001 needs three users with live Zaps.
4. **Private beta.** Share the invite link with a few customers to accumulate the required live Zaps.
5. **Request public review** in the developer platform, providing the test account and answering the launch questionnaire.

## Versions

Bump `version` in `package.json` before each `npm run push`; Zapier keys versions by that field. After a version is public, promote or migrate users from the developer platform; keep input field keys and sample keys stable (checks C002 and C003).
