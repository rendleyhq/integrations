# Publishing the Rendley Power Platform connector

Source: Microsoft's [certification submission requirements](https://learn.microsoft.com/en-us/connectors/custom-connectors/certification-submission).

## What Microsoft requires (already satisfied by the files)

- Title without "API" or "Connector", at most 30 characters: `Rendley`.
- Description between 30 and 500 characters, no Power Platform product names.
- Every operation has an `operationId`, a summary of at most 80 alphanumeric characters, a full-sentence description, `x-ms-visibility`, and exact response schemas (no default responses, no empty schemas).
- Every parameter and schema property has a description and `x-ms-summary`.
- API key connection parameter as `securestring` with `clearText: false` and `required: "true"`.
- Production host only (`api.rendley.com`), HTTPS only.
- `iconBrandColor` set (verified publishers use the brand color; independent publishers must use `#da3b01`).

`npm test` re-checks all of these. `paconn validate` additionally runs Microsoft's own swagger validator; it needs `paconn login` and cannot run in CI.

## Steps

1. **Try it in an environment.** In Power Automate, *Custom connectors → New custom connector → Import an OpenAPI file* with `apiDefinition.swagger.json`, set the icon and brand color, then in *Security* choose API key with header `Authorization`. Or from a signed-in machine: `paconn create --api-def apiDefinition.swagger.json --api-prop apiProperties.json --icon icon.png`.
2. **Test each operation at least 10 times** in the connector's test tab (Microsoft's checklist), and build a test flow that polls **Get job** after **Run AI action**.
3. **Run the solution checker**: add the connector to a solution and validate it.
4. **Package**: export the connector solution and a flow solution, add `intro.md`, zip them as the certification article shows, and validate the zip with `ConnectorPackageValidator.ps1` (PowerShell).
5. **Submit**:
   - Verified publisher (recommended for Rendley as the API owner): upload the package to a blob with a SAS URL and submit through [Partner Center](https://partner.microsoft.com/dashboard/home). Requires the publisher account to be verified.
   - Independent publisher: open a pull request in [microsoft/PowerPlatformConnectors](https://github.com/microsoft/PowerPlatformConnectors) under `independent-publisher-connectors/Rendley/` with the swagger, properties and `intro.md` (named `readme.md` in that repo), and set `iconBrandColor` to `#da3b01`.
6. **Certification** takes several weeks; Microsoft publishes the connector to all regions after approval and expects updates through the same channel.

## Icon

`icon.png` is included: 230×230, the Rendley mark within 70% of the canvas on the `iconBrandColor` background (#0C0C0C). Regenerate it from `assets/logo.svg` if the brand changes.
