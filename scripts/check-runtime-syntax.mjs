import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const projectDirectory = path.join(rootDirectory, 'project');

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(fullPath));
    else if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

function compile(source, label) {
  try {
    Function(source);
  } catch (error) {
    throw new Error(`Browser script syntax failed in ${label}: ${error.message}`);
  }
}

for (const filePath of await filesBelow(projectDirectory)) {
  const relative = path.relative(rootDirectory, filePath).split(path.sep).join('/');
  if (filePath.endsWith('.js')) {
    compile(await readFile(filePath, 'utf8'), relative);
    continue;
  }
  if (!filePath.endsWith('.html')) continue;
  const html = await readFile(filePath, 'utf8');
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = pattern.exec(html)) !== null) {
    index += 1;
    const attributes = match[1] || '';
    if (/\bsrc\s*=/i.test(attributes)) continue;
    const typeMatch = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text/javascript';
    if (!['text/javascript', 'application/javascript', 'module', 'text/x-dc'].includes(type)) continue;
    compile(match[2], `${relative} inline script ${index}`);
  }
}

console.log('Browser runtime scripts are syntactically valid.');
