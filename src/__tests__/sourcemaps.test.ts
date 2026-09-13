import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
const debugId = '12345678-1234-1234-1234-123456789abc';
function fixture(map: Record<string, unknown>) {
  const directory = mkdtempSync(path.join(tmpdir(), 'studio24-maps-'));
  directories.push(directory);
  writeFileSync(
    path.join(directory, 'bundle.js'),
    `console.log('test');\n//# debugId=${debugId}\n//# sourceMappingURL=other-hash.js.map`,
  );
  writeFileSync(
    path.join(directory, 'other-hash.js.map'),
    JSON.stringify({
      version: 3,
      sources: ['test.ts'],
      sourcesContent: ['console.log("test");'],
      mappings: 'AAAA',
      ...map,
    }),
  );
  return directory;
}
function verify(directory: string, mode = 'prepared') {
  return spawnSync(process.execPath, ['scripts/verify-sourcemaps.mjs', mode, directory], { encoding: 'utf8' });
}
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('source map delivery checks', () => {
  it.each(['debug_id', 'debugId'])('accepts hashed map names and %s', (key) => {
    expect(verify(fixture({ [key]: debugId })).status).toBe(0);
  });
  it('rejects mismatched IDs', () => {
    expect(verify(fixture({ debugId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })).status).not.toBe(0);
  });
  it('rejects maps without embedded source context', () => {
    expect(verify(fixture({ debugId, sourcesContent: [] })).status).not.toBe(0);
  });
  it('rejects public artifacts containing maps', () => {
    expect(verify(fixture({ debugId }), 'public').status).not.toBe(0);
  });
  it('accepts the artifact after source map removal', () => {
    const directory = fixture({ debugId });
    rmSync(path.join(directory, 'other-hash.js.map'));
    expect(verify(directory, 'public').status).toBe(0);
  });
});
