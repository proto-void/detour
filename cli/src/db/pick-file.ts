import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import { helperInstallDir } from './helper-paths.ts';

const defaultExecFile = promisify(execFile);

export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options?: { timeout?: number },
) => Promise<{ stdout: string; stderr: string }>;

type PickFileDeps = {
  platform?: NodeJS.Platform;
  execFile?: ExecFileFn;
  /** Override sibling/native picker binary (null = skip). */
  pickfileBinary?: string | null;
  /** Override compiled macOS .scpt path (null = skip). */
  compiledScriptPath?: string | null;
  /** Override cached Linux dialog tool. */
  linuxDialog?: 'zenity' | 'kdialog' | null;
  /** Executable path used to resolve sibling detour-pickfile (tests). */
  execPath?: string;
};

/** Optional file-type group — same shape as Go pickfile.Filter / RPC params.filters. */
export type PickFileFilter = {
  name: string;
  extensions: string[];
};

export type PickFileOptions = {
  title?: string;
  filters?: PickFileFilter[];
};

/** Compiled NSOpenPanel script name (Install Helper / SEA install). */
export const COMPILED_NSOPEN_SCRIPT = 'pickfile-nsopen.scpt';

/** Sibling binary for Windows native dialog (SEA packs). */
export function pickfileBinaryName(os: NodeJS.Platform = platform()): string {
  return os === 'win32' ? 'detour-pickfile.exe' : 'detour-pickfile';
}

function execErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const withStderr = err as Error & { stderr?: string | Buffer };
  const stderr =
    typeof withStderr.stderr === 'string'
      ? withStderr.stderr
      : Buffer.isBuffer(withStderr.stderr)
        ? withStderr.stderr.toString('utf8')
        : '';
  return `${err.message}\n${stderr}`.trim();
}

function execExitCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'number' ? code : undefined;
}

/** AppleScript user cancel is error -128 ("User canceled"). */
export function isAppleScriptCancel(err: unknown): boolean {
  const msg = execErrorMessage(err);
  return /\(-128\)/.test(msg) || /user canceled/i.test(msg);
}

/** zenity/kdialog exit 1 = cancel; missing binary is ENOENT / not found. */
export function isLinuxDialogCancel(err: unknown): boolean {
  const code = execExitCode(err);
  if (code === 1) return true;
  const msg = execErrorMessage(err);
  return /\bexit(ed)? code[,:]?\s*1\b/i.test(msg);
}

export function isMissingDialogBinary(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === 'ENOENT') return true;
  const msg = execErrorMessage(err);
  return /ENOENT|not found|command not found/i.test(msg);
}

function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function trimExt(e: string): string {
  return e.replace(/^\.+/, '');
}

/** Unique extensions across filters (no leading dots). */
export function flatExtensions(filters?: PickFileFilter[]): string[] {
  if (!filters?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of filters) {
    for (const raw of f.extensions ?? []) {
      const e = trimExt(raw);
      if (!e || seen.has(e)) continue;
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}

export function windowsFilterString(filters?: PickFileFilter[]): string {
  if (!filters?.length) return 'All files (*.*)|*.*';
  const parts: string[] = [];
  for (const f of filters) {
    const name = f.name || 'Files';
    const patterns = (f.extensions ?? [])
      .map(trimExt)
      .filter(Boolean)
      .map((e) => `*.${e}`);
    const joined = patterns.length ? patterns.join(';') : '*.*';
    parts.push(`${name} (${joined})|${joined}`);
  }
  parts.push('All files (*.*)|*.*');
  return parts.join('|');
}

/** Objective-C NSOpenPanel sibling — clang-compiled at install / SEA build (macOS). */
export const DARWIN_NSOPEN_OBJC_SOURCE = `/*
 * detour-pickfile — native macOS NSOpenPanel for Databases Browse.
 * Compiled at Install Helper time (clang -framework AppKit).
 *
 * Usage: detour-pickfile [-title string] [-filter name:ext1,ext2]...
 * Cancel → empty stdout, exit 0. Path → stdout. Failures → stderr + exit 1.
 *
 * Accessory activation + active-Space collection behavior so the panel overlays
 * the current Mission Control Space (maximized Chrome) without switching desktops.
 * Light activateIgnoringOtherApps keeps the panel key without ActivateAllWindows.
 */
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

static NSArray<NSString *> *ParseExtensions(NSArray<NSString *> *filters) {
  NSMutableArray<NSString *> *exts = [NSMutableArray array];
  NSMutableSet<NSString *> *seen = [NSMutableSet set];
  for (NSString *raw in filters) {
    NSRange colon = [raw rangeOfString:@":"];
    if (colon.location == NSNotFound) {
      continue;
    }
    NSString *extCSV = [raw substringFromIndex:colon.location + 1];
    for (NSString *piece in [extCSV componentsSeparatedByString:@","]) {
      NSString *e = [piece stringByTrimmingCharactersInSet:
                         [NSCharacterSet whitespaceAndNewlineCharacterSet]];
      while ([e hasPrefix:@"."]) {
        e = [e substringFromIndex:1];
      }
      if (e.length == 0 || [seen containsObject:e]) {
        continue;
      }
      [seen addObject:e];
      [exts addObject:e];
    }
  }
  return exts;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSString *title = @"Select file";
    NSMutableArray<NSString *> *filterArgs = [NSMutableArray array];

    for (int i = 1; i < argc; i++) {
      NSString *a = [NSString stringWithUTF8String:argv[i]];
      if ([a isEqualToString:@"-title"] && i + 1 < argc) {
        title = [NSString stringWithUTF8String:argv[++i]];
      } else if ([a hasPrefix:@"-title="]) {
        title = [a substringFromIndex:7];
      } else if ([a isEqualToString:@"-filter"] && i + 1 < argc) {
        [filterArgs addObject:[NSString stringWithUTF8String:argv[++i]]];
      } else if ([a hasPrefix:@"-filter="]) {
        [filterArgs addObject:[a substringFromIndex:8]];
      } else if ([a isEqualToString:@"-h"] || [a isEqualToString:@"--help"]) {
        fputs("usage: detour-pickfile [-title string] [-filter name:ext1,ext2]...\\n",
              stderr);
        return 0;
      }
    }

    /* Accessory: not a Space-owning app. Still finishLaunching + light activate. */
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    [NSApp finishLaunching];
    [NSApp activateIgnoringOtherApps:YES];

    NSOpenPanel *panel = [NSOpenPanel openPanel];
    [panel setCanChooseFiles:YES];
    [panel setCanChooseDirectories:NO];
    [panel setAllowsMultipleSelection:NO];
    [panel setCanCreateDirectories:NO];
    [panel setMessage:title];
    [panel setTitle:@"Select file"];
    [panel setLevel:NSModalPanelWindowLevel];
    [panel setFloatingPanel:YES];
    /* Overlay the Space where Chrome is (incl. maximized / fullscreen). */
    [panel setCollectionBehavior:(NSWindowCollectionBehaviorCanJoinAllSpaces |
                                  NSWindowCollectionBehaviorMoveToActiveSpace |
                                  NSWindowCollectionBehaviorFullScreenAuxiliary)];

    NSArray<NSString *> *exts = ParseExtensions(filterArgs);
    if (exts.count > 0) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
      /* allowedContentTypes needs UniformTypeIdentifiers; keep extensions for broad macOS. */
      [panel setAllowedFileTypes:exts];
#pragma clang diagnostic pop
    }

    [panel center];
    [panel makeKeyAndOrderFront:nil];
    /* No ActivateAllWindows option — that switches Mission Control Spaces. */
    [NSApp activateIgnoringOtherApps:YES];

    NSModalResponse result = [panel runModal];
    if (result == NSModalResponseOK) {
      NSURL *url = panel.URLs.firstObject;
      if (url != nil) {
        fputs(url.path.UTF8String, stdout);
      }
    }
    return 0;
  }
}
`;

/** Source for osacompile at install (argv: title, comma-separated exts). */
export const DARWIN_NSOPEN_SCRIPT_SOURCE = `use AppleScript version "2.4"
use framework "AppKit"
use scripting additions

-- Fallback when clang-built detour-pickfile is missing.
-- Accessory + active-Space collection behavior; light activateIgnoringOtherApps.
-- Avoid Regular + ActivateAllWindows (switches Mission Control Spaces).
on run argv
	set theTitle to "Select file"
	set extList to {}
	if (count of argv) ≥ 1 then
		if item 1 of argv is not "" then set theTitle to item 1 of argv
	end if
	if (count of argv) ≥ 2 then
		set extCSV to item 2 of argv
		if extCSV is not "" then
			set AppleScript's text item delimiters to ","
			set extList to text items of extCSV
			set AppleScript's text item delimiters to ""
		end if
	end if

	set nsApp to current application's NSApplication's sharedApplication()
	nsApp's setActivationPolicy:(current application's NSApplicationActivationPolicyAccessory)
	nsApp's activateIgnoringOtherApps:true

	set thePanel to current application's NSOpenPanel's openPanel()
	thePanel's setCanChooseFiles:true
	thePanel's setCanChooseDirectories:false
	thePanel's setAllowsMultipleSelection:false
	thePanel's setCanCreateDirectories:false
	thePanel's setMessage:theTitle
	thePanel's setTitle:"Select file"
	thePanel's setLevel:(current application's NSModalPanelWindowLevel)
	thePanel's setFloatingPanel:true
	thePanel's setCollectionBehavior:((current application's NSWindowCollectionBehaviorCanJoinAllSpaces as integer) + (current application's NSWindowCollectionBehaviorMoveToActiveSpace as integer) + (current application's NSWindowCollectionBehaviorFullScreenAuxiliary as integer))
	if (count of extList) > 0 then
		thePanel's setAllowedFileTypes:extList
	end if
	-- Skip center() — empty () trips osacompile; panel fronts via makeKeyAndOrderFront.
	thePanel's makeKeyAndOrderFront:(missing value)
	nsApp's activateIgnoringOtherApps:true
	set theResult to thePanel's runModal()
	if (theResult as integer) is (current application's NSModalResponseOK as integer) then
		set theURLs to thePanel's URLs() as list
		if (count of theURLs) > 0 then
			set theURL to item 1 of theURLs
			return (theURL's |path|() as text)
		end if
	end if
	return ""
end run
`;

/** Cocoa NSOpenPanel — inline -e fallback when compiled .scpt / native binary missing. */
export function darwinNSOpenPanelScript(title: string, filters?: PickFileFilter[]): string {
  const escaped = escapeAppleScriptString(title);
  const lines = [
    'use AppleScript version "2.4"',
    'use framework "AppKit"',
    'use scripting additions',
    '',
    'set nsApp to current application\'s NSApplication\'s sharedApplication()',
    'nsApp\'s setActivationPolicy:(current application\'s NSApplicationActivationPolicyAccessory)',
    'nsApp\'s activateIgnoringOtherApps:true',
    'set thePanel to current application\'s NSOpenPanel\'s openPanel()',
    'thePanel\'s setCanChooseFiles:true',
    'thePanel\'s setCanChooseDirectories:false',
    'thePanel\'s setAllowsMultipleSelection:false',
    'thePanel\'s setCanCreateDirectories:false',
    `thePanel's setMessage:"${escaped}"`,
    'thePanel\'s setTitle:"Select file"',
    'thePanel\'s setLevel:(current application\'s NSModalPanelWindowLevel)',
    'thePanel\'s setFloatingPanel:true',
    'thePanel\'s setCollectionBehavior:((current application\'s NSWindowCollectionBehaviorCanJoinAllSpaces as integer) + (current application\'s NSWindowCollectionBehaviorMoveToActiveSpace as integer) + (current application\'s NSWindowCollectionBehaviorFullScreenAuxiliary as integer))',
    'thePanel\'s makeKeyAndOrderFront:(missing value)',
    'nsApp\'s activateIgnoringOtherApps:true',
  ];
  const exts = flatExtensions(filters);
  if (exts.length) {
    const quoted = exts.map((e) => `"${escapeAppleScriptString(e)}"`).join(', ');
    lines.push(`thePanel's setAllowedFileTypes:{${quoted}}`);
  }
  lines.push(
    'set theResult to thePanel\'s runModal()',
    'if (theResult as integer) is (current application\'s NSModalResponseOK as integer) then',
    '  set theURLs to thePanel\'s URLs() as list',
    '  if (count of theURLs) > 0 then',
    '    set theURL to item 1 of theURLs',
    '    return (theURL\'s |path|() as text)',
    '  end if',
    'end if',
    'return ""',
  );
  return lines.join('\n');
}

/** Fallback when AppleScriptObjC is unavailable. */
export function darwinChooseFileScript(title: string, filters?: PickFileFilter[]): string {
  const escaped = escapeAppleScriptString(title);
  const exts = flatExtensions(filters);
  let choose = `POSIX path of (choose file with prompt "${escaped}"`;
  if (exts.length) {
    const quoted = exts.map((e) => `"${escapeAppleScriptString(e)}"`).join(', ');
    choose += ` of type {${quoted}}`;
  }
  choose += ')';
  return [
    'tell application "Finder" to activate',
    choose,
  ].join('\n');
}

export function zenityArgs(title: string, filters?: PickFileFilter[]): string[] {
  const args = ['--file-selection', `--title=${title}`];
  if (!filters?.length) return args;
  for (const f of filters) {
    const patterns = (f.extensions ?? [])
      .map(trimExt)
      .filter(Boolean)
      .map((e) => `*.${e}`);
    if (!patterns.length) continue;
    args.push(`--file-filter=${f.name || 'Files'} | ${patterns.join(' ')}`);
  }
  args.push('--file-filter=All files | *');
  return args;
}

export function kdialogArgs(title: string, filters?: PickFileFilter[]): string[] {
  const args = ['--getopenfilename', '.', '--title', title];
  const exts = flatExtensions(filters);
  if (exts.length) {
    const name = filters?.[0]?.name || 'Files';
    args.push(`${name} (${exts.map((e) => `*.${e}`).join(' ')})`);
  }
  return args;
}

export function resolvePickfileBinary(
  os: NodeJS.Platform,
  execPath: string = process.execPath,
): string | null {
  const name = pickfileBinaryName(os);
  const candidates = [
    join(dirname(execPath), name),
    join(helperInstallDir(os), name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function resolveCompiledNSOpenScript(
  os: NodeJS.Platform,
  execPath: string = process.execPath,
): string | null {
  if (os !== 'darwin') return null;
  if (process.env.DETOUR_PICKFILE_SCPT?.trim()) {
    const p = process.env.DETOUR_PICKFILE_SCPT.trim();
    return existsSync(p) ? p : null;
  }
  const candidates = [
    join(dirname(execPath), COMPILED_NSOPEN_SCRIPT),
    join(helperInstallDir(os), COMPILED_NSOPEN_SCRIPT),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

let cachedLinuxDialog: 'zenity' | 'kdialog' | null | undefined;

/** Reset Linux dialog probe cache (tests). */
export function resetLinuxDialogCache(): void {
  cachedLinuxDialog = undefined;
}

async function probeLinuxDialog(run: ExecFileFn): Promise<'zenity' | 'kdialog' | null> {
  if (cachedLinuxDialog !== undefined) return cachedLinuxDialog;
  for (const tool of ['zenity', 'kdialog'] as const) {
    try {
      await run(tool, ['--version'], { timeout: 5_000 });
      cachedLinuxDialog = tool;
      return tool;
    } catch (err) {
      // Binary present but --version failed oddly — still prefer it over missing.
      if (!isMissingDialogBinary(err)) {
        cachedLinuxDialog = tool;
        return tool;
      }
    }
  }
  cachedLinuxDialog = null;
  return null;
}

function pickfileCliArgs(title: string, filters?: PickFileFilter[]): string[] {
  const args = ['-title', title];
  for (const f of filters ?? []) {
    const exts = (f.extensions ?? []).map(trimExt).filter(Boolean).join(',');
    args.push('-filter', `${f.name || 'Files'}:${exts}`);
  }
  return args;
}

/**
 * Open a native file picker and return the selected absolute path, or null if cancelled.
 * Real failures (missing tools, AppleScript errors other than cancel) throw.
 *
 * Contract (mirrors Go helper-go/internal/pickfile):
 *   RPC: pickFile { title?, filters? } → { path: string | null }
 */
export async function pickFile(
  options?: PickFileOptions,
  deps?: PickFileDeps,
): Promise<string | null> {
  const title = options?.title ?? 'Select file';
  const filters = options?.filters;
  const os = deps?.platform ?? platform();
  const run = deps?.execFile ?? defaultExecFile;
  const execPath = deps?.execPath ?? process.execPath;

  if (os === 'darwin') {
    // Prefer clang-built Cocoa sibling (Accessory + active-Space collection).
    const bin =
      deps?.pickfileBinary === null
        ? null
        : (deps?.pickfileBinary ?? resolvePickfileBinary(os, execPath));
    if (bin) {
      try {
        const { stdout } = await run(bin, pickfileCliArgs(title, filters), { timeout: 120_000 });
        const path = stdout.trim();
        return path || null;
      } catch (err) {
        // fall through to compiled / inline AppleScript
        if (!isAppleScriptCancel(err)) {
          /* keep going */
        } else {
          return null;
        }
      }
    }
    const compiled =
      deps?.compiledScriptPath === null
        ? null
        : (deps?.compiledScriptPath ?? resolveCompiledNSOpenScript(os, execPath));
    if (compiled) {
      try {
        const { stdout } = await run(
          'osascript',
          [compiled, title, flatExtensions(filters).join(',')],
          { timeout: 120_000 },
        );
        const path = stdout.trim();
        return path || null;
      } catch (err) {
        if (isAppleScriptCancel(err)) return null;
        // fall through to inline / Finder
      }
    }
    try {
      const { stdout } = await run('osascript', ['-e', darwinNSOpenPanelScript(title, filters)], {
        timeout: 120_000,
      });
      const path = stdout.trim();
      return path || null;
    } catch (nsErr) {
      if (isAppleScriptCancel(nsErr)) return null;
      try {
        const { stdout } = await run('osascript', ['-e', darwinChooseFileScript(title, filters)], {
          timeout: 120_000,
        });
        const path = stdout.trim();
        return path || null;
      } catch (chooseErr) {
        if (isAppleScriptCancel(chooseErr)) return null;
        throw new Error(
          `File picker failed: ${execErrorMessage(nsErr)}; fallback: ${execErrorMessage(chooseErr)}`,
        );
      }
    }
  }

  if (os === 'win32') {
    const bin =
      deps?.pickfileBinary === null
        ? null
        : (deps?.pickfileBinary ?? resolvePickfileBinary(os, execPath));
    if (bin) {
      try {
        const { stdout } = await run(bin, pickfileCliArgs(title, filters), { timeout: 120_000 });
        const path = stdout.trim();
        return path || null;
      } catch (err) {
        throw new Error(`File picker failed: ${execErrorMessage(err)}`);
      }
    }

    // Dev trees / missing sibling: PowerShell WinForms (slow cold start).
    const filter = windowsFilterString(filters).replace(/'/g, "''");
    const ps = `
Add-Type -AssemblyName System.Windows.Forms;
$f = New-Object System.Windows.Forms.OpenFileDialog;
$f.Title = '${title.replace(/'/g, "''")}';
$f.Filter = '${filter}';
$form = New-Object System.Windows.Forms.Form;
$form.TopMost = $true;
$form.ShowInTaskbar = $false;
$form.WindowState = 'Minimized';
try {
  if ($f.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) { $f.FileName }
} finally {
  $form.Dispose()
}
`;
    try {
      const { stdout } = await run(
        'powershell.exe',
        ['-NoProfile', '-STA', '-Command', ps],
        { timeout: 120_000 },
      );
      const path = stdout.trim();
      return path || null;
    } catch (err) {
      throw new Error(`File picker failed: ${execErrorMessage(err)}`);
    }
  }

  // Linux: probe zenity/kdialog once, then reuse.
  const dialog =
    deps?.linuxDialog !== undefined ? deps.linuxDialog : await probeLinuxDialog(run);
  if (dialog === 'zenity') {
    try {
      const { stdout } = await run('zenity', zenityArgs(title, filters), { timeout: 120_000 });
      return stdout.trim() || null;
    } catch (zenityErr) {
      if (isLinuxDialogCancel(zenityErr)) return null;
      throw new Error(`File picker failed (zenity): ${execErrorMessage(zenityErr)}`);
    }
  }
  if (dialog === 'kdialog') {
    try {
      const { stdout } = await run('kdialog', kdialogArgs(title, filters), { timeout: 120_000 });
      return stdout.trim() || null;
    } catch (kdialogErr) {
      if (isLinuxDialogCancel(kdialogErr)) return null;
      throw new Error(`File picker failed (kdialog): ${execErrorMessage(kdialogErr)}`);
    }
  }
  throw new Error(
    'File picker unavailable: install zenity or kdialog, or paste the path into the text field.',
  );
}
