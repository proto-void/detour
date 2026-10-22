import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { helperBinaryName, helperInstallDir } from './helper-paths.ts';
import {
  chromeAllowedOrigins,
  resolveChromiumExtensionIds,
} from './install.ts';
import { DETOUR_UNPACKED_CHROMIUM_ID, ROGERS_UNPACKED_CHROMIUM_ID } from './extension-ids.ts';

describe('helperInstallDir', () => {
  it('uses Application Support on macOS', () => {
    assert.equal(
      helperInstallDir('darwin'),
      join(homedir(), 'Library', 'Application Support', 'Detour', 'db-host'),
    );
    assert.equal(helperBinaryName('darwin'), 'detour-db-host');
  });

  it('uses LOCALAPPDATA on Windows', () => {
    const dir = helperInstallDir('win32');
    assert.match(dir, /Detour[/\\]db-host$/);
    assert.equal(helperBinaryName('win32'), 'detour-db-host.exe');
  });

  it('uses XDG data home on Linux', () => {
    const prev = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = '/tmp/xdg-data-detour-test';
    try {
      assert.equal(helperInstallDir('linux'), join('/tmp/xdg-data-detour-test', 'detour', 'db-host'));
    } finally {
      if (prev === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prev;
    }
  });
});

describe('allowed_origins / extension ids', () => {
  it('defaults to Detour unpacked id', () => {
    assert.deepEqual(resolveChromiumExtensionIds({}), [DETOUR_UNPACKED_CHROMIUM_ID]);
    assert.deepEqual(resolveChromiumExtensionIds({ brand: 'rogers' }), [ROGERS_UNPACKED_CHROMIUM_ID]);
  });

  it('merges --extension-id with brand defaults', () => {
    // Chrome ids are 32 chars from a–p only.
    const extra = 'abcdefghijklmnopabcdefghijklmnop';
    assert.deepEqual(resolveChromiumExtensionIds({ extensionId: extra }), [
      DETOUR_UNPACKED_CHROMIUM_ID,
      extra,
    ]);
  });

  it('builds chrome-extension origins', () => {
    assert.deepEqual(chromeAllowedOrigins([DETOUR_UNPACKED_CHROMIUM_ID]), [
      `chrome-extension://${DETOUR_UNPACKED_CHROMIUM_ID}/`,
    ]);
  });
});
