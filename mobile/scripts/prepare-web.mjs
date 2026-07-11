import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.resolve(scriptDirectory, "../../project");
const webDirectory = path.resolve(scriptDirectory, "../www");
const targetDirectory = path.join(webDirectory, "project");
const homepage = path.join(sourceDirectory, "Prolinker Homepage.dc.html");

const excludedTopLevelEntries = new Set([
  ".thumbnail",
  "CLAUDE.md",
  "screenshots",
  "uploads"
]);

function shouldCopy(source) {
  const relativePath = path.relative(sourceDirectory, source);

  if (!relativePath) {
    return true;
  }

  const [topLevelEntry] = relativePath.split(path.sep);
  if (excludedTopLevelEntries.has(topLevelEntry)) {
    return false;
  }

  const filename = path.basename(relativePath);
  if (/-print-[^/\\]*\.dc\.html$/i.test(filename)) {
    return false;
  }

  return filename !== "Prolinker Results.html";
}

await access(homepage);
await mkdir(webDirectory, { recursive: true });
await rm(targetDirectory, { recursive: true, force: true });
await cp(sourceDirectory, targetDirectory, {
  recursive: true,
  filter: shouldCopy
});

console.log(`Prepared Capacitor web assets in ${targetDirectory}`);
