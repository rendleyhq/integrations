# Publishing the Rendley Node-RED nodes

Source: Node-RED's [packaging guide](https://nodered.org/docs/creating-nodes/packaging) and the Flow Library requirements.

## Requirements (satisfied)

- Scoped package name (`@rendley/node-red-rendley`); new packages must be scoped.
- `package.json` with a `node-red` section listing the node files and a minimum `version`, the `node-red` keyword, `README.md`, `LICENSE`, and the `files` whitelist.
- One HTML file per node with the registration, the edit template and the help text.
- Credentials stored through Node-RED's credential store (`rendley-config`), never in flow JSON.

## Steps

1. `npm test` and `RENDLEY_API_KEY=... npm run test:live` pass.
2. Bump `version` in `package.json` and `npm publish --access public` from a machine logged in to the `@rendley` npm scope.
3. Add the node to the Flow Library: sign in at <https://flows.nodered.org>, choose *Add node*, and enter the package name. Later versions are picked up by requesting a refresh on the package page.
4. Keep the `node-red` keyword only once the nodes are stable, as the guide asks.

## Local install for manual testing

```bash
cd ~/.node-red && npm install /path/to/node-red-rendley && node-red
```
