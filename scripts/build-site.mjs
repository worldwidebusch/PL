import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const projectDirectory = path.join(rootDirectory, 'project');
const outputDirectory = path.join(rootDirectory, 'dist');
const checkOnly = process.argv.includes('--check');

const requiredRuntimeFiles = [
  'index.html',
  'project/Prolinker Homepage.dc.html',
  'project/Prolinker Login.dc.html',
  'project/prolinker-app.js',
  'project/support.js',
  'project/prolinker-theme.css',
  'project/manifest.webmanifest',
  'project/sw.js',
  'project/offline.html'
];

const excludedProjectEntries = new Set([
  '.thumbnail',
  'CLAUDE.md',
  'Canvas.dc.html',
  'content',
  'screenshots',
  'uploads',
  'Prolinker Results.html'
]);

const optionalRootRuntimeEntries = [
  'manifest.webmanifest',
  'robots.txt',
  'favicon.ico',
  'favicon.png',
  'icons'
];

function relativeFromRoot(filePath) {
  return path.relative(rootDirectory, filePath).split(path.sep).join('/');
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function includeProjectPath(sourcePath) {
  const relative = path.relative(projectDirectory, sourcePath);
  if (!relative) return true;
  const segments = relative.split(path.sep);
  if (segments.some((segment) => segment.startsWith('.') && segment !== '.well-known')) return false;
  if (excludedProjectEntries.has(segments[0])) return false;
  const filename = path.basename(relative);
  if (/-print-[^/\\]*\.dc\.html$/i.test(filename)) return false;
  if (/\.(?:md|log|tmp|bak)$/i.test(filename)) return false;
  return true;
}

async function listFiles(directory) {
  const result = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(fullPath));
    else if (entry.isFile()) result.push(fullPath);
  }
  return result;
}

async function validateInputs() {
  const missing = [];
  for (const relativePath of requiredRuntimeFiles) {
    if (!await exists(path.join(rootDirectory, relativePath))) missing.push(relativePath);
  }
  if (missing.length) throw new Error('Missing required runtime files: ' + missing.join(', '));

  const functionFiles = (await listFiles(path.join(rootDirectory, 'netlify', 'functions')))
    .filter((filePath) => filePath.endsWith('.mjs'));
  for (const filePath of functionFiles) {
    const checked = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
    if (checked.status !== 0) {
      throw new Error('Syntax check failed for ' + relativeFromRoot(filePath) + ':\n' + (checked.stderr || checked.stdout));
    }
  }
}

async function validateOutput() {
  const outputFiles = await listFiles(outputDirectory);
  const forbidden = outputFiles
    .map((filePath) => relativeFromRoot(filePath).replace(/^dist\//, ''))
    .filter((relativePath) => (
      relativePath === '.env'
      || relativePath.startsWith('.env.')
      || relativePath.startsWith('.git/')
      || relativePath.startsWith('netlify/')
      || relativePath.startsWith('scripts/')
      || relativePath.startsWith('tests/')
      || relativePath.endsWith('.md')
      || /-print-[^/]*\.dc\.html$/i.test(relativePath)
    ));
  if (forbidden.length) throw new Error('Forbidden deployment files found: ' + forbidden.join(', '));

  for (const relativePath of requiredRuntimeFiles) {
    if (!await exists(path.join(outputDirectory, relativePath))) {
      throw new Error('Build did not emit required file: ' + relativePath);
    }
  }

  let totalBytes = 0;
  for (const filePath of outputFiles) totalBytes += (await stat(filePath)).size;
  return { files: outputFiles.length, bytes: totalBytes };
}

await validateInputs();

if (checkOnly) {
  console.log('Deployment inputs and Netlify function syntax are valid.');
  process.exit(0);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(path.join(rootDirectory, 'index.html'), path.join(outputDirectory, 'index.html'));
await cp(projectDirectory, path.join(outputDirectory, 'project'), {
  recursive: true,
  filter: includeProjectPath
});

for (const entry of optionalRootRuntimeEntries) {
  const source = path.join(rootDirectory, entry);
  if (await exists(source)) await cp(source, path.join(outputDirectory, entry), { recursive: true });
}

const summary = await validateOutput();
console.log(`Built ${summary.files} runtime files in dist (${summary.bytes} bytes).`);
