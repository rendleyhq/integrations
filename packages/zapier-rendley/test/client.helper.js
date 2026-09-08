// Exposes the bundled client for test cleanup (cancel jobs, delete the test project).
const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const out = path.join(__dirname, ".rendley-client.cjs");
if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(path.join(__dirname, "..", "..", "rendley-client", "src", "rendley.ts")).mtimeMs) {
  execSync(
    `npx esbuild ${path.join(__dirname, "..", "..", "rendley-client", "src", "rendley.ts")} --bundle --platform=node --format=cjs --outfile=${out} --log-level=warning`,
    { stdio: "inherit" },
  );
}
module.exports = require(out);
