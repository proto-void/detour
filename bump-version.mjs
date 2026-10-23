import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('❌ Please specify a version. Example: node bump-version.mjs 0.1.2');
  process.exit(1);
}

// Target paths
const filesToUpdate = [
  path.resolve('package.json'),
  path.resolve('extension/package.json')
];

// Update version in JSON files
filesToUpdate.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    fileData.version = newVersion;
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated version to ${newVersion} in: ${filePath}`);
  } else {
    console.warn(`⚠️ File not found: ${filePath}`);
  }
});

// Run the WXT build and zip pipeline
console.log('📦 Building and packaging Detour extension zip...');
try {
  execSync('corepack pnpm --filter @detour/extension zip', { stdio: 'inherit' });
  console.log(`\n🎉 Success! Your Chrome Web Store zip is ready at:\n👉 extension/.output/detour/detour-${newVersion}-chrome.zip`);
} catch (error) {
  console.error('❌ Build pipeline failed:', error.message);
}