// The n8n Creator Portal verification pre-check follows the npm "repository" url to the
// GitHub repo root and looks for credentials/ there. It ignores "repository.directory", so
// a monorepo package fails the check with "Can't find credential file in repo" unless the
// credential also exists at the root. This mirrors packages/n8n-nodes-rendley/credentials
// (source + icons) and dist/credentials (compiled js) into <repo root>/credentials.
//
// The copies are committed, since the Portal reads them from GitHub. They are rewritten by
// every `npm run build` in this package, so commit the result when the credential changes.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageDir));
const target = join(repoRoot, 'credentials');

// Sources are listed later-wins, so the compiled js lands beside the ts source it came from.
const sources = [join(packageDir, 'credentials'), join(packageDir, 'dist', 'credentials')];

for (const source of sources) {
	if (!statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
		throw new Error(`missing ${source} - run the n8n build before syncing root credentials`);
	}
}

// Rebuild from scratch so a renamed or deleted credential does not linger at the root.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

for (const source of sources) {
	for (const file of readdirSync(source)) {
		cpSync(join(source, file), join(target, file));
		console.log('synced credentials/' + file);
	}
}
