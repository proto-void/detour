import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  chromeManifestDirs,
  cmdSetQuote,
  firefoxManifestDir,
  hostLauncherFileName,
  isBusyFsError,
  linuxConfigHome,
  nodeSymlinkProbes,
  resolveNodePath,
  shellQuote,
  windowsChromiumNativeMessagingRegKeys,
  windowsFirefoxNativeMessagingRegKey,
  windowsLocalAppData,
  windowsNativeMessagingRegKeys,
  windowsRoamingAppData,
  writeHostLauncher,
} from './install.ts';

describe('isBusyFsError', () => {
  it('detects Windows Access denied / sharing violation', () => {
    assert.equal(isBusyFsError(new Error('Access is denied.')), true);
    assert.equal(
      isBusyFsError(new Error('The process cannot access the file because it is being used by another process.')),
      true,
    );
    assert.equal(isBusyFsError(Object.assign(new Error('EPERM'), { code: 'EPERM' })), true);
    assert.equal(isBusyFsError(new Error('ENOENT: no such file')), false);
  });

  it('locked replace message mentions stop helper', () => {
    // Document the user-facing contract used by copyReplaceBinary.
    const msg =
      'Cannot replace C:\\Detour\\db-host\\detour-db-host.exe: file is locked (Access is denied.). ' +
      'Stop the helper in Detour → Databases (or close Chrome so the native host exits), then retry.';
    assert.match(msg, /stop the helper/i);
    assert.match(msg, /retry/i);
  });
});

describe('resolveNodePath / probes', () => {
  it('returns execPath when no probe matches (portable default)', () => {
    const fake = '/tmp/does-not-exist-detour-node-xyz/bin/node';
    assert.equal(resolveNodePath(fake, 'linux'), fake);
    assert.equal(resolveNodePath(fake, 'darwin'), fake);
    assert.equal(resolveNodePath(fake, 'win32'), fake);
  });

  it('lists multi-OS probes (not Homebrew-only)', () => {
    const darwin = nodeSymlinkProbes('darwin');
    const linux = nodeSymlinkProbes('linux');
    const win = nodeSymlinkProbes('win32');
    assert.ok(darwin.some((p) => p.includes('homebrew')));
    assert.ok(darwin.some((p) => p === '/usr/local/bin/node'));
    assert.deepEqual(linux, ['/usr/bin/node', '/usr/local/bin/node']);
    assert.ok(win.some((p) => p.toLowerCase().endsWith(join('nodejs', 'node.exe').toLowerCase())));
  });

  it('resolveNodePath prefers a probe that realpath-equals process.execPath when present', () => {
    const stable = resolveNodePath(process.execPath);
    assert.ok(
      stable.includes('node') || stable.toLowerCase().endsWith('node.exe'),
      `unexpected node path: ${stable}`,
    );
  });
});

describe('hostLauncherFileName', () => {
  it('uses .cmd on Windows and bare name elsewhere', () => {
    assert.equal(hostLauncherFileName('win32'), 'detour-db-host.cmd');
    assert.equal(hostLauncherFileName('darwin'), 'detour-db-host');
    assert.equal(hostLauncherFileName('linux'), 'detour-db-host');
  });
});

describe('quoting', () => {
  it('shellQuote wraps and escapes for spaces', () => {
    assert.equal(shellQuote('/Users/me/Resource Override/cli'), '"/Users/me/Resource Override/cli"');
    assert.equal(shellQuote('say "hi"'), '"say \\"hi\\""');
  });

  it('cmdSetQuote doubles % and embedded quotes', () => {
    assert.equal(cmdSetQuote('C:\\Program Files\\nodejs\\node.exe'), 'C:\\Program Files\\nodejs\\node.exe');
    assert.equal(cmdSetQuote('C:\\a%b\\node.exe'), 'C:\\a%%b\\node.exe');
    assert.equal(cmdSetQuote('C:\\weird"path\\node.exe'), 'C:\\weird""path\\node.exe');
  });
});

describe('writeHostLauncher', () => {
  it('darwin/linux: bash launcher with absolute quoted NODE and ENTRY', () => {
    const dir = mkdtempSync(join(tmpdir(), 'detour-db-install-'));
    try {
      const out = join(dir, 'detour-db-host');
      const node = '/usr/local/bin/node';
      const entry = '/Users/hamzakhan/Resource Override/cli/src/cli.ts';
      writeHostLauncher(out, entry, { nodePath: node, platform: 'darwin' });
      const body = readFileSync(out, 'utf8');
      assert.match(body, /^#!\/usr\/bin\/env bash/m);
      assert.match(body, /NODE="\/usr\/local\/bin\/node"/);
      assert.match(body, /ENTRY="\/Users\/hamzakhan\/Resource Override\/cli\/src\/cli\.ts"/);
      assert.doesNotMatch(body, /\bexec node /);
      assert.match(body, /exec "\$NODE" --experimental-strip-types "\$ENTRY" db-host-stdio/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('linux: same bash shape (paths with spaces)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'detour-db-install-'));
    try {
      const out = join(dir, 'detour-db-host');
      writeHostLauncher(out, '/opt/detour cli/src/cli.ts', {
        nodePath: '/usr/bin/node',
        platform: 'linux',
      });
      const body = readFileSync(out, 'utf8');
      assert.match(body, /^#!\/usr\/bin\/env bash/m);
      assert.match(body, /NODE="\/usr\/bin\/node"/);
      assert.match(body, /ENTRY="\/opt\/detour cli\/src\/cli\.ts"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('win32: .cmd launcher with set "NODE=…" and no bash shebang', () => {
    const dir = mkdtempSync(join(tmpdir(), 'detour-db-install-'));
    try {
      const out = join(dir, 'detour-db-host.cmd');
      const node = 'C:\\Program Files\\nodejs\\node.exe';
      const entry = 'C:\\Users\\Hamza\\Resource Override\\cli\\src\\cli.ts';
      writeHostLauncher(out, entry, { nodePath: node, platform: 'win32' });
      const body = readFileSync(out, 'utf8');
      assert.match(body, /^@echo off/m);
      assert.doesNotMatch(body, /#!\/usr\/bin\/env/);
      assert.match(body, /set "NODE=C:\\Program Files\\nodejs\\node\.exe"/);
      assert.match(
        body,
        /set "ENTRY=C:\\Users\\Hamza\\Resource Override\\cli\\src\\cli\.ts"/,
      );
      assert.match(body, /"%NODE%" --experimental-strip-types "%ENTRY%" db-host-stdio/);
      assert.match(body, /if not exist "%NODE%"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts legacy string third-arg as nodePath (defaults to host platform)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'detour-db-install-'));
    try {
      const out = join(dir, 'detour-db-host');
      writeHostLauncher(out, '/tmp/entry.ts', '/opt/custom/bin/node');
      const body = readFileSync(out, 'utf8');
      assert.match(body, /NODE="\/opt\/custom\/bin\/node"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('windowsNativeMessagingRegKeys', () => {
  it('covers Chrome, Edge, Brave, Chromium, Firefox under HKCU', () => {
    const keys = windowsNativeMessagingRegKeys();
    assert.ok(keys.some((k) => k.includes('Google\\Chrome')));
    assert.ok(keys.some((k) => k.includes('Microsoft\\Edge')));
    assert.ok(keys.some((k) => k.includes('BraveSoftware')));
    assert.ok(keys.some((k) => k.includes('Chromium')));
    assert.ok(keys.some((k) => k.includes('Mozilla')));
    assert.ok(keys.every((k) => k.startsWith('HKCU\\') && k.endsWith('com.detour.db')));
  });

  it('splits Chromium keys from Firefox (different JSON shapes)', () => {
    const chromium = windowsChromiumNativeMessagingRegKeys();
    const firefox = windowsFirefoxNativeMessagingRegKey();
    assert.ok(chromium.every((k) => !k.includes('Mozilla')));
    assert.match(firefox, /Mozilla/);
    assert.deepEqual([...chromium, firefox], windowsNativeMessagingRegKeys());
  });
});

describe('native messaging manifest dirs (all platforms)', () => {
  it('darwin: Application Support paths for Chrome family + Firefox', () => {
    const chrome = chromeManifestDirs('darwin');
    const ff = firefoxManifestDir('darwin');
    assert.ok(chrome.some((p) => p.includes(join('Google', 'Chrome', 'NativeMessagingHosts'))));
    assert.ok(chrome.some((p) => p.includes(join('Microsoft Edge', 'NativeMessagingHosts'))));
    assert.ok(chrome.some((p) => p.includes(join('BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'))));
    assert.ok(ff.endsWith(join('Mozilla', 'NativeMessagingHosts')));
    assert.ok(ff.startsWith(homedir()));
  });

  it('linux: XDG config Chrome dirs + ~/.mozilla', () => {
    const chrome = chromeManifestDirs('linux');
    const cfg = linuxConfigHome();
    assert.ok(chrome.every((p) => p.startsWith(cfg)));
    assert.ok(chrome.some((p) => p.endsWith(join('google-chrome', 'NativeMessagingHosts'))));
    assert.ok(chrome.some((p) => p.endsWith(join('chromium', 'NativeMessagingHosts'))));
    const ff = firefoxManifestDir('linux');
    assert.ok(ff.endsWith(join('.mozilla', 'native-messaging-hosts')));
  });

  it('win32: LOCALAPPDATA Detour + APPDATA Mozilla (not hardcoded C:\\\\Users)', () => {
    const chrome = chromeManifestDirs('win32');
    const ff = firefoxManifestDir('win32');
    assert.equal(chrome.length, 1);
    assert.ok(chrome[0]!.startsWith(windowsLocalAppData()));
    assert.ok(chrome[0]!.endsWith(join('Detour', 'NativeMessagingHosts')));
    assert.ok(ff.startsWith(windowsRoamingAppData()));
    assert.ok(ff.endsWith(join('Mozilla', 'NativeMessagingHosts')));
    assert.doesNotMatch(chrome[0]!, /^C:\\Users\\/i);
  });

  it('linux respects XDG_CONFIG_HOME when set', () => {
    const prev = process.env.XDG_CONFIG_HOME;
    try {
      process.env.XDG_CONFIG_HOME = join(tmpdir(), 'detour-xdg-config');
      const dirs = chromeManifestDirs('linux');
      assert.ok(dirs.every((p) => p.startsWith(process.env.XDG_CONFIG_HOME!)));
    } finally {
      if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prev;
    }
  });

  it('win32 respects LOCALAPPDATA and APPDATA when set', () => {
    const prevLocal = process.env.LOCALAPPDATA;
    const prevRoam = process.env.APPDATA;
    try {
      process.env.LOCALAPPDATA = join(tmpdir(), 'detour-local');
      process.env.APPDATA = join(tmpdir(), 'detour-roaming');
      assert.equal(windowsLocalAppData(), process.env.LOCALAPPDATA);
      assert.equal(windowsRoamingAppData(), process.env.APPDATA);
      assert.ok(chromeManifestDirs('win32')[0]!.startsWith(process.env.LOCALAPPDATA));
      assert.ok(firefoxManifestDir('win32').startsWith(process.env.APPDATA));
    } finally {
      if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = prevLocal;
      if (prevRoam === undefined) delete process.env.APPDATA;
      else process.env.APPDATA = prevRoam;
    }
  });
});
