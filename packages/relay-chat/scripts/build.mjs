// Assembles the npm package from the workspace: the server bundled into dist/server.js (with
// @relay/shared inlined), its SQL migrations, the built web client, and the desktop shell.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.resolve(pkgDir, '../..');
const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

rmSync(path.join(pkgDir, 'dist'), { recursive: true, force: true });
rmSync(path.join(pkgDir, 'desktop'), { recursive: true, force: true });

run('npm run build -w @relay/web');
run('npm run build -w @relay/desktop');

await build({
  entryPoints: [path.join(root, 'apps/server/src/index.ts')],
  outfile: path.join(pkgDir, 'dist/server.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Real npm dependencies stay external; workspace packages are bundled in.
  external: [...Object.keys(pkg.dependencies), ...Object.keys(pkg.optionalDependencies ?? {})],
  logLevel: 'warning',
});

// db.ts reads migrations from ./migrations next to the bundle.
cpSync(path.join(root, 'apps/server/src/migrations'), path.join(pkgDir, 'dist/migrations'), { recursive: true });
cpSync(path.join(root, 'apps/web/dist'), path.join(pkgDir, 'dist/web'), { recursive: true });

// The desktop shell runs unpackaged: `electron desktop/`. Its main.js reads ../package.json.
// relay.webUrl carries over from apps/desktop: it's the server `relay-chat desktop` opens by default.
// When apps/desktop was built with scripts/prepare-build.mjs, dist/relay.json holds the values
// that build was made with, and those are the ones to carry over.
mkdirSync(path.join(pkgDir, 'desktop'), { recursive: true });
cpSync(path.join(root, 'apps/desktop/dist'), path.join(pkgDir, 'desktop/dist'), { recursive: true });
const desktop = JSON.parse(readFileSync(path.join(root, 'apps/desktop/package.json'), 'utf8'));
let built = null;
try {
  built = JSON.parse(readFileSync(path.join(root, 'apps/desktop/dist/relay.json'), 'utf8'));
} catch {
  // Not built with a generated config: the committed defaults are used.
}
const relay = {
  webUrl: built?.webUrl ?? desktop.relay?.webUrl ?? '',
  updateUrl: built?.updateUrl ?? desktop.relay?.updateUrl ?? '',
  pinnedCert: built?.pinnedCert ?? desktop.relay?.pinnedCert ?? '',
};
writeFileSync(
  path.join(pkgDir, 'desktop/package.json'),
  JSON.stringify({ name: 'relay-chat-desktop', productName: desktop.productName, version: pkg.version, main: desktop.main, relay }, null, 2) + '\n',
);

console.log(`built ${pkg.name}@${pkg.version}`);
