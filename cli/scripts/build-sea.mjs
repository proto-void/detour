#!/usr/bin/env node
/**
 * Build a self-contained Node SEA for the Detour DB host (ADR-029).
 *
 *   corepack pnpm --filter @detour/cli sea:build
 *
 * 1. esbuild-bundles cli/src/cli.ts → one CJS file
 * 2. Ensure an official (non-Homebrew) Node binary for injection
 * 3. node --experimental-sea-config → blob
 * 4. Copy node binary + postject inject (strip signature on macOS first)
 * 5. Copy @napi-rs/keyring platform package beside the binary
 * 6. Ad-hoc codesign on macOS (required after postject on arm64)
 *
 * Outputs: cli/.sea/detour-db-host[.exe] + node_modules/ + package.json
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  createWriteStream,
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.sea');
const isWin = process.platform === 'win32';
const outBin = join(outDir, isWin ? 'detour-db-host.exe' : 'detour-db-host');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entryBundle = join(outDir, 'sea-entry.cjs');
const blob = join(outDir, 'sea-prep.blob');
const config = join(outDir, 'sea-config.json');

console.log('esbuild: bundling cli/src/cli.ts →', entryBundle);

buildSync({
  entryPoints: [join(root, 'src', 'cli.ts')],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: entryBundle,
  // Avoid import.meta.url paths for packageRoot in SEA — define a sentinel.
  define: {
    'import.meta.url': JSON.stringify('file:///detour-sea/cli.js'),
  },
  external: [
    '@napi-rs/keyring',
    '@napi-rs/keyring-*',
    'kerberos',
    'cpu-features',
  ],
  logLevel: 'info',
});

writeFileSync(
  config,
  JSON.stringify(
    {
      main: entryBundle,
      output: blob,
      disableExperimentalSEAWarning: true,
      // Code cache often rejects after postject; skip to avoid runtime warnings.
      useCodeCache: false,
    },
    null,
    2,
  ),
);

try {
  execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });
} catch (e) {
  console.error('SEA config generation failed (Node SEA support required).', e instanceof Error ? e.message : e);
  process.exit(1);
}

const nodeBin = await resolveOfficialNodeBinary(outDir);
console.log('SEA base Node binary:', nodeBin, `(${statSync(nodeBin).size} bytes)`);
copyFileSync(nodeBin, outBin);

if (process.platform === 'darwin') {
  spawnSync('codesign', ['--remove-signature', outBin], { stdio: 'pipe' });
}

let postject;
try {
  postject = require('postject');
} catch {
  console.error('postject is required. Ensure cli devDependency postject is installed.');
  process.exit(1);
}

const sentinelFuse = detectSeaFuse(outBin);
console.log('SEA sentinel fuse:', sentinelFuse);
const injectOpts = { sentinelFuse };
if (process.platform === 'darwin') {
  injectOpts.machoSegmentName = 'NODE_SEA';
}

const injectResult = postject.inject(outBin, 'NODE_SEA_BLOB', readFileSync(blob), injectOpts);
if (injectResult && typeof injectResult.then === 'function') {
  await injectResult;
}

if (!isWin) {
  try {
    chmodSync(outBin, 0o755);
  } catch {
    /* ignore */
  }
}

writeFileSync(
  join(outDir, 'package.json'),
  `${JSON.stringify({ name: 'detour-db-host', private: true, type: 'commonjs' }, null, 2)}\n`,
);

const nmOut = join(outDir, 'node_modules');
mkdirSync(nmOut, { recursive: true });
copyKeyringBeside(root, nmOut);

if (process.platform === 'darwin') {
  const sign = spawnSync('codesign', ['--sign', '-', '--force', '--deep', outBin], {
    encoding: 'utf8',
  });
  if (sign.status !== 0) {
    console.warn('codesign ad-hoc failed (continuing):', sign.stderr || sign.stdout);
  } else {
    console.log('Ad-hoc codesign applied:', outBin);
  }
}

writeFileSync(
  join(outDir, 'README.txt'),
  [
    'Detour DB SEA host',
    `platform=${process.platform} arch=${process.arch} node=${process.version}`,
    'Run: ./detour-db-host --version | install | uninstall | doctor',
    'Browsers spawn this binary with no args (native messaging stdio).',
    'Optional sibling: detour-pickfile[.exe] — native Browse (Win32 / Cocoa).',
    '',
  ].join('\n'),
);

buildDetourPickfile(outDir);

console.log('Wrote', outBin, `(${statSync(outBin).size} bytes)`);

/** Native file-dialog sibling: Win32 Go binary, or macOS clang Cocoa NSOpenPanel. Soft-fail. */
function buildDetourPickfile(seaDir) {
  const toolDir = join(root, 'tools', 'detour-pickfile');
  const outName = isWin ? 'detour-pickfile.exe' : 'detour-pickfile';
  const outPath = join(seaDir, outName);

  if (process.platform === 'darwin' && !isWin) {
    const src = join(toolDir, 'nsopen.m');
    if (!existsSync(src)) {
      console.warn('detour-pickfile nsopen.m missing; SEA macOS Browse uses AppleScript fallback');
      return;
    }
    const build = spawnSync(
      'clang',
      ['-O2', '-framework', 'AppKit', '-framework', 'Foundation', '-o', outPath, src],
      { encoding: 'utf8' },
    );
    if (build.status !== 0) {
      console.warn('detour-pickfile clang failed (continuing):', build.stderr || build.stdout);
      return;
    }
    try {
      chmodSync(outPath, 0o755);
    } catch {
      /* ignore */
    }
    console.log('Wrote', outPath, `(${statSync(outPath).size} bytes)`);
    return;
  }

  if (!existsSync(join(toolDir, 'go.mod'))) {
    console.warn('detour-pickfile tool missing; SEA will fall back to PowerShell Browse on Windows');
    return;
  }
  const go = spawnSync('go', ['env', 'GOROOT'], { encoding: 'utf8' });
  if (go.status !== 0) {
    console.warn('go not found — skipping detour-pickfile build (Windows Browse uses PowerShell fallback)');
    return;
  }
  const build = spawnSync(
    'go',
    ['build', '-ldflags=-s -w', '-o', outPath, '.'],
    {
      cwd: toolDir,
      encoding: 'utf8',
      env: { ...process.env, CGO_ENABLED: '0' },
    },
  );
  if (build.status !== 0) {
    console.warn('detour-pickfile build failed (continuing):', build.stderr || build.stdout);
    return;
  }
  if (!isWin) {
    try {
      chmodSync(outPath, 0o755);
    } catch {
      /* ignore */
    }
  }
  console.log('Wrote', outPath, `(${statSync(outPath).size} bytes)`);
}

/**
 * Official Node distros are full executables. Homebrew node is a thin stub + libnode.dylib
 * and cannot be used as a SEA base (postject / SEA docs).
 */
async function resolveOfficialNodeBinary(seaDir) {
  if (process.env.DETOUR_SEA_NODE && existsSync(process.env.DETOUR_SEA_NODE)) {
    return process.env.DETOUR_SEA_NODE;
  }
  if (isLikelyOfficialNode(process.execPath)) {
    return process.execPath;
  }
  console.warn(
    'process.execPath looks like a Homebrew / shared-lib Node stub. Downloading the official Node binary for SEA…',
  );
  return downloadOfficialNode(seaDir);
}

function isLikelyOfficialNode(binPath) {
  try {
    const size = statSync(binPath).size;
    // Official macOS/Linux node is typically 50–120 MB; Homebrew stub is ~50 KB.
    if (size < 5_000_000) return false;
    if (process.platform === 'darwin') {
      const otool = spawnSync('otool', ['-L', binPath], { encoding: 'utf8' });
      if (otool.status === 0 && /libnode\.\d+\.dylib/.test(otool.stdout)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadOfficialNode(seaDir) {
  const ver = process.versions.node;
  const plat =
    process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win' : 'linux';
  const arch =
    process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : process.arch;
  const ext = plat === 'win' ? 'zip' : 'tar.gz';
  const name = `node-v${ver}-${plat}-${arch}`;
  const url = `https://nodejs.org/dist/v${ver}/${name}.${ext}`;
  // Persist outside .sea (which is wiped each build).
  const cacheDir = join(root, '.cache', 'node-official');
  mkdirSync(cacheDir, { recursive: true });
  const extractedBin =
    plat === 'win' ? join(cacheDir, name, 'node.exe') : join(cacheDir, name, 'bin', 'node');
  if (existsSync(extractedBin) && isLikelyOfficialNode(extractedBin)) {
    console.log('Using cached official Node:', extractedBin);
    return extractedBin;
  }

  const archive = join(cacheDir, `${name}.${ext}`);
  if (!existsSync(archive)) {
    console.log('Downloading', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download Node: ${res.status} ${url}`);
    await pipeline(res.body, createWriteStream(archive));
  }

  if (plat === 'win') {
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${archive}' -DestinationPath '${cacheDir}' -Force`], {
      stdio: 'inherit',
    });
  } else {
    execFileSync('tar', ['-xzf', archive, '-C', cacheDir], { stdio: 'inherit' });
  }
  if (!existsSync(extractedBin)) throw new Error(`node missing after extract: ${extractedBin}`);
  if (!isWin) chmodSync(extractedBin, 0o755);
  return extractedBin;
}

/** Node 20–22 used …df481702; Node 24+ ships …df1996b2. Read it from the binary. */
function detectSeaFuse(binPath) {
  const buf = readFileSync(binPath);
  const marker = Buffer.from('NODE_SEA_FUSE_');
  let idx = buf.indexOf(marker);
  if (idx < 0) {
    throw new Error(`No NODE_SEA_FUSE_ sentinel in ${binPath} — use an official Node build with SEA support`);
  }
  let end = idx + marker.length;
  while (end < buf.length && /[0-9a-fA-F]/.test(String.fromCharCode(buf[end]))) end += 1;
  return buf.subarray(idx, end).toString('utf8');
}

function copyDirReal(src, dest) {
  const real = existsSync(src) ? realpathSync(src) : src;
  rmSync(dest, { recursive: true, force: true });
  cpSync(real, dest, { recursive: true });
}

function findPnpmNapiPackages(cliRoot) {
  const found = new Map();
  const pnpmRoot = join(cliRoot, '..', 'node_modules', '.pnpm');
  if (!existsSync(pnpmRoot)) return found;
  for (const name of readdirSync(pnpmRoot)) {
    if (!name.startsWith('@napi-rs+keyring')) continue;
    const nested = join(pnpmRoot, name, 'node_modules', '@napi-rs');
    if (!existsSync(nested)) continue;
    for (const pkg of readdirSync(nested)) {
      if (pkg === 'keyring' || pkg.startsWith('keyring-')) {
        found.set(pkg, join(nested, pkg));
      }
    }
  }
  return found;
}

function copyKeyringBeside(cliRoot, destNm) {
  const destNapi = join(destNm, '@napi-rs');
  mkdirSync(destNapi, { recursive: true });

  const fromPnpm = findPnpmNapiPackages(cliRoot);
  if (fromPnpm.has('keyring')) {
    for (const [pkg, src] of fromPnpm) {
      copyDirReal(src, join(destNapi, pkg));
    }
    console.log('Copied @napi-rs/keyring (+ platform) beside SEA binary:', [...fromPnpm.keys()].join(', '));
    return;
  }

  const candidates = [
    join(cliRoot, 'node_modules', '@napi-rs'),
    join(cliRoot, '..', 'node_modules', '@napi-rs'),
  ];
  let srcNapi;
  for (const c of candidates) {
    if (existsSync(join(c, 'keyring'))) {
      srcNapi = c;
      break;
    }
  }
  if (!srcNapi) {
    console.warn(
      '@napi-rs/keyring not found — SEA will fall back to in-memory secrets until the package is installed.',
    );
    return;
  }
  copyDirReal(join(srcNapi, 'keyring'), join(destNapi, 'keyring'));
  for (const name of readdirSync(srcNapi)) {
    if (name.startsWith('keyring-')) {
      copyDirReal(join(srcNapi, name), join(destNapi, name));
    }
  }
  console.log('Copied @napi-rs/keyring (+ platform) beside SEA binary');
}
