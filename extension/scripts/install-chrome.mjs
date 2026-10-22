// Download Chrome for Testing (stable) and print the executable path on stdout.
// CI: CHROME_CACHE=$RUNNER_TEMP/chrome node scripts/install-chrome.mjs
// Linux libraries (root only): node scripts/install-chrome.mjs --deps
import os from 'node:os';
import path from 'node:path';
import { Browser, BrowserTag, detectBrowserPlatform, install, resolveBuildId } from '@puppeteer/browsers';

const platform = detectBrowserPlatform();
if (!platform) {
  console.error('This platform has no Chrome for Testing build.');
  process.exit(1);
}

const wantDeps = process.argv.includes('--deps');
if (wantDeps && process.platform === 'linux' && process.getuid?.() !== 0) {
  console.error('On Linux, --deps needs root so apt-get can install Chrome libraries. Re-run with sudo.');
  process.exit(1);
}

const cacheDir = process.env.CHROME_CACHE ?? path.join(os.homedir(), '.cache', 'puppeteer');
const buildId = await resolveBuildId(Browser.CHROME, platform, BrowserTag.STABLE);
const installed = await install({
  browser: Browser.CHROME,
  buildId,
  cacheDir,
  installDeps: wantDeps,
});
console.log(installed.executablePath);
