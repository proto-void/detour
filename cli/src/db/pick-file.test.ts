import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  darwinNSOpenPanelScript,
  flatExtensions,
  isAppleScriptCancel,
  isLinuxDialogCancel,
  isMissingDialogBinary,
  kdialogArgs,
  pickFile,
  resetLinuxDialogCache,
  windowsFilterString,
  zenityArgs,
  type ExecFileFn,
} from './pick-file.ts';

function execErr(message: string, opts?: { code?: number | string; stderr?: string }): Error {
  const err = new Error(message) as Error & { code?: number | string; stderr?: string };
  if (opts?.code !== undefined) err.code = opts.code;
  if (opts?.stderr !== undefined) err.stderr = opts.stderr;
  return err;
}

describe('pickFile filters helpers', () => {
  it('flattens and trims extensions', () => {
    assert.deepEqual(
      flatExtensions([
        { name: 'Certs', extensions: ['.pem', 'crt'] },
        { name: 'Keys', extensions: ['pem', 'key'] },
      ]),
      ['pem', 'crt', 'key'],
    );
  });

  it('builds Windows / zenity / kdialog filter strings', () => {
    const filters = [{ name: 'Certs', extensions: ['pem', 'crt'] }];
    assert.equal(
      windowsFilterString(filters),
      'Certs (*.pem;*.crt)|*.pem;*.crt|All files (*.*)|*.*',
    );
    assert.deepEqual(zenityArgs('Select file', filters), [
      '--file-selection',
      '--title=Select file',
      '--file-filter=Certs | *.pem *.crt',
      '--file-filter=All files | *',
    ]);
    assert.deepEqual(kdialogArgs('Select file', filters), [
      '--getopenfilename',
      '.',
      '--title',
      'Select file',
      'Certs (*.pem *.crt)',
    ]);
  });

  it('embeds allowed types in NSOpenPanel script', () => {
    const script = darwinNSOpenPanelScript('Pick', [{ name: 'PEM', extensions: ['pem'] }]);
    assert.match(script, /setAllowedFileTypes:\{\"pem\"\}/);
    assert.match(script, /activateIgnoringOtherApps/);
    assert.match(script, /NSApplicationActivationPolicyAccessory/);
    assert.match(script, /NSWindowCollectionBehaviorCanJoinAllSpaces/);
    assert.match(script, /NSWindowCollectionBehaviorMoveToActiveSpace/);
    assert.match(script, /makeKeyAndOrderFront/);
    assert.doesNotMatch(script, /NSApplicationActivationPolicyRegular/);
  });
});

describe('pickFile cancel classification', () => {
  it('detects AppleScript user cancel (-128)', () => {
    assert.equal(
      isAppleScriptCancel(
        execErr('Command failed: osascript', {
          stderr: 'execution error: User canceled. (-128)',
        }),
      ),
      true,
    );
    assert.equal(isAppleScriptCancel(execErr('something else failed')), false);
  });

  it('detects Linux dialog cancel vs missing binary', () => {
    assert.equal(isLinuxDialogCancel(execErr('zenity failed', { code: 1 })), true);
    assert.equal(isMissingDialogBinary(execErr('spawn zenity ENOENT', { code: 'ENOENT' })), true);
    assert.equal(isLinuxDialogCancel(execErr('spawn zenity ENOENT', { code: 'ENOENT' })), false);
  });
});

describe('pickFile platform branches', () => {
  beforeEach(() => {
    resetLinuxDialogCache();
  });

  it('darwin: prefers native detour-pickfile when provided', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const exec: ExecFileFn = async (file, args) => {
      calls.push({ file, args });
      return { stdout: '/Users/me/cert.pem\n', stderr: '' };
    };
    const path = await pickFile(
      { title: 'Pick "cert"', filters: [{ name: 'PEM', extensions: ['pem'] }] },
      {
        platform: 'darwin',
        execFile: exec,
        pickfileBinary: '/helper/detour-pickfile',
        compiledScriptPath: null,
      },
    );
    assert.equal(path, '/Users/me/cert.pem');
    assert.equal(calls[0]!.file, '/helper/detour-pickfile');
    assert.ok(calls[0]!.args.includes('-title'));
    assert.ok(calls[0]!.args.includes('-filter'));
  });

  it('darwin: prefers NSOpenPanel inline when binary skipped', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const exec: ExecFileFn = async (file, args) => {
      calls.push({ file, args });
      return { stdout: '/Users/me/cert.pem\n', stderr: '' };
    };
    const path = await pickFile(
      { title: 'Pick "cert"' },
      {
        platform: 'darwin',
        execFile: exec,
        pickfileBinary: null,
        compiledScriptPath: null,
      },
    );
    assert.equal(path, '/Users/me/cert.pem');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.file, 'osascript');
    const script = String(calls[0]!.args[1]);
    assert.match(script, /NSOpenPanel/);
    assert.match(script, /runModal/);
    assert.match(script, /Pick \\"cert\\"/);
    assert.match(script, /NSApplicationActivationPolicyAccessory/);
  });

  it('darwin: uses compiled script when provided', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const exec: ExecFileFn = async (file, args) => {
      calls.push({ file, args });
      return { stdout: '/Users/me/ca.pem\n', stderr: '' };
    };
    const path = await pickFile(
      { title: 'CA', filters: [{ name: 'PEM', extensions: ['pem'] }] },
      {
        platform: 'darwin',
        execFile: exec,
        pickfileBinary: null,
        compiledScriptPath: '/tmp/pickfile-nsopen.scpt',
      },
    );
    assert.equal(path, '/Users/me/ca.pem');
    assert.equal(calls[0]!.file, 'osascript');
    assert.deepEqual(calls[0]!.args, ['/tmp/pickfile-nsopen.scpt', 'CA', 'pem']);
  });

  it('darwin: falls back to Finder choose file', async () => {
    const calls: string[] = [];
    const exec: ExecFileFn = async (_file, args) => {
      const script = String(args[1]);
      calls.push(script);
      if (script.includes('NSOpenPanel')) {
        throw execErr('Command failed: osascript', {
          stderr: 'execution error: AppleScriptObjC unavailable. (-2700)',
        });
      }
      return { stdout: '/Users/me/key.pem\n', stderr: '' };
    };
    assert.equal(
      await pickFile(
        {},
        {
          platform: 'darwin',
          execFile: exec,
          pickfileBinary: null,
          compiledScriptPath: null,
        },
      ),
      '/Users/me/key.pem',
    );
    assert.equal(calls.length, 2);
    assert.match(calls[1]!, /Finder/);
    assert.match(calls[1]!, /choose file/);
    assert.doesNotMatch(calls[1]!, /System Events/);
    assert.doesNotMatch(calls[1]!, /delay 0\.2/);
  });

  it('darwin: cancel returns null', async () => {
    const exec: ExecFileFn = async () => {
      throw execErr('Command failed: osascript', {
        stderr: 'execution error: User canceled. (-128)',
      });
    };
    assert.equal(
      await pickFile(
        {},
        {
          platform: 'darwin',
          execFile: exec,
          pickfileBinary: null,
          compiledScriptPath: null,
        },
      ),
      null,
    );
  });

  it('darwin: non-cancel failure throws after both attempts', async () => {
    const exec: ExecFileFn = async () => {
      throw execErr('Command failed: osascript', {
        stderr: 'execution error: Application isn’t running. (-600)',
      });
    };
    await assert.rejects(
      () =>
        pickFile(
          {},
          {
            platform: 'darwin',
            execFile: exec,
            pickfileBinary: null,
            compiledScriptPath: null,
          },
        ),
      /File picker failed/,
    );
  });

  it('win32: prefers detour-pickfile sibling when provided', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const exec: ExecFileFn = async (file, args) => {
      calls.push({ file, args });
      return { stdout: 'C:\\certs\\ca.pem\n', stderr: '' };
    };
    const path = await pickFile(
      { title: 'Pick', filters: [{ name: 'PEM', extensions: ['pem'] }] },
      { platform: 'win32', execFile: exec, pickfileBinary: 'C:\\helper\\detour-pickfile.exe' },
    );
    assert.equal(path, 'C:\\certs\\ca.pem');
    assert.equal(calls[0]!.file, 'C:\\helper\\detour-pickfile.exe');
    assert.ok(calls[0]!.args.includes('-title'));
    assert.ok(calls[0]!.args.includes('-filter'));
  });

  it('win32: PowerShell fallback uses -STA + TopMost; empty stdout is cancel', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const cancel: ExecFileFn = async (file, args) => {
      calls.push({ file, args });
      return { stdout: '  \n', stderr: '' };
    };
    assert.equal(
      await pickFile({}, { platform: 'win32', execFile: cancel, pickfileBinary: null }),
      null,
    );
    assert.equal(calls[0]!.file, 'powershell.exe');
    assert.ok(calls[0]!.args.includes('-STA'));
    assert.ok(calls[0]!.args.includes('-NoProfile'));
    const script = String(calls[0]!.args[calls[0]!.args.indexOf('-Command') + 1] ?? '');
    assert.match(script, /TopMost/);
    assert.match(script, /ShowDialog\(\$form\)/);

    const boom: ExecFileFn = async () => {
      throw execErr('powershell exploded');
    };
    await assert.rejects(
      () => pickFile({}, { platform: 'win32', execFile: boom, pickfileBinary: null }),
      /File picker failed/,
    );
  });

  it('linux: zenity cancel returns null; both missing throws', async () => {
    const cancel: ExecFileFn = async () => {
      throw execErr('zenity: cancelled', { code: 1 });
    };
    assert.equal(
      await pickFile({}, { platform: 'linux', execFile: cancel, linuxDialog: 'zenity' }),
      null,
    );

    const missing: ExecFileFn = async (file) => {
      throw execErr(`spawn ${file} ENOENT`, { code: 'ENOENT' });
    };
    await assert.rejects(
      () => pickFile({}, { platform: 'linux', execFile: missing }),
      /zenity or kdialog/,
    );
  });

  it('linux: falls through to kdialog when zenity missing', async () => {
    const exec: ExecFileFn = async (file, args) => {
      if (file === 'zenity') throw execErr('spawn zenity ENOENT', { code: 'ENOENT' });
      if (file === 'kdialog' && args[0] === '--version') {
        return { stdout: 'kdialog 1.0\n', stderr: '' };
      }
      return { stdout: '/home/me/key.pem\n', stderr: '' };
    };
    assert.equal(await pickFile({}, { platform: 'linux', execFile: exec }), '/home/me/key.pem');
  });

  it('linux: caches dialog probe across calls', async () => {
    let versionCalls = 0;
    const exec: ExecFileFn = async (file, args) => {
      if (args[0] === '--version') {
        versionCalls += 1;
        return { stdout: 'zenity 3\n', stderr: '' };
      }
      return { stdout: `/tmp/${file}.pem\n`, stderr: '' };
    };
    assert.equal(await pickFile({}, { platform: 'linux', execFile: exec }), '/tmp/zenity.pem');
    assert.equal(await pickFile({}, { platform: 'linux', execFile: exec }), '/tmp/zenity.pem');
    assert.equal(versionCalls, 1);
  });
});
