import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const [mode, directory] = process.argv.slice(2);
assert(['prepared', 'public'].includes(mode) && directory, 'Expected prepared|public and a directory');

async function filesIn(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(file));
    else files.push(file);
  }
  return files;
}

const files = await filesIn(directory);
const maps = files.filter((file) => file.endsWith('.map'));
if (mode === 'public') {
  assert.equal(maps.length, 0, 'Source maps must never be published in the Pages artifact');
} else {
  let verified = 0;
  for (const file of files.filter((file) => file.endsWith('.js'))) {
    const js = await readFile(file, 'utf8');
    // Turbopack hashes maps separately; their names need not match the JS file.
    const reference = js.match(/\/\/# sourceMappingURL=([^\s]+)/)?.[1];
    if (!reference) continue; // Vendor polyfills may not advertise a source map.
    const map = JSON.parse(await readFile(path.resolve(path.dirname(file), reference), 'utf8'));
    if (map.sources?.length === 0 && map.mappings === '') continue; // Shared empty runtime stubs.
    const debugId = map.debugId ?? map.debug_id;
    assert.match(debugId ?? '', /^[0-9a-f-]{36}$/i, `Missing debug ID: ${file}`);
    assert(js.includes(debugId), `Debug ID mismatch: ${file}`);
    assert(map.sources?.length > 0 && map.sourcesContent?.some((source) => source?.length), `Missing source context: ${file}`);
    verified++;
  }
  assert(verified > 0, 'No JavaScript source maps verified');
  console.log(`Verified ${verified} source maps with matching debug IDs`);
}
console.log(`Source map check passed: ${mode}`);
