// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';

const projectRoot = process.cwd();
const load = createRequire(path.join(projectRoot, 'package.json'));
const pluginRequire = createRequire(load.resolve('@next/eslint-plugin-next'));
const globRequire = createRequire(pluginRequire.resolve('fast-glob'));
type RootDir = string | (string | null | number)[];
const { getRootDirs } = pluginRequire('@next/eslint-plugin-next/dist/utils/get-root-dirs.js') as {
  getRootDirs: (context: { cwd: string; settings: { next?: { rootDir?: RootDir } } }) => string[];
};
const matcher = globRequire('micromatch') as {
  braces: (pattern: string, options: { expand: boolean; nodupes: boolean }) => string[];
};
const expandOptions = { expand: true, nodupes: true };

let fixture: string;
const layouts = ['web', 'admin', 'app', 'src-app'];
const roots = (rootDir?: RootDir) => getRootDirs({ cwd: fixture, settings: { next: { rootDir } } });
const absolute = (entries: string[]) => entries.map((entry) => path.resolve(entry)).sort();
const app = (name: string) => path.join(fixture, 'apps', name);
const lint = async (
  rootDir?: RootDir,
  source = 'export default function Page() { return <a href="/home/">Home</a>; }',
) => {
  const eslint = new ESLint({
    cwd: projectRoot,
    overrideConfigFile: path.join(projectRoot, 'eslint.config.mjs'),
    overrideConfig: rootDir === undefined ? undefined : { settings: { next: { rootDir } } },
  });
  const [result] = await eslint.lintText(source, { filePath: 'src/__eslint_contract__.tsx' });
  return result.messages;
};

beforeAll(() => {
  fixture = realpathSync(mkdtempSync(path.join(tmpdir(), 'studio24-eslint-')));
  const pages: Record<string, string> = {
    web: 'pages/home.tsx',
    admin: 'src/pages/home.tsx',
    app: 'app/home/page.tsx',
    'src-app': 'src/app/home/page.tsx',
  };
  for (const name of [
    'with space',
    '.hidden',
    'app-a',
    'app-b',
    ...Array.from({ length: 12 }, (_, i) => `v${i + 1}`),
  ]) {
    pages[name] = 'pages/home.tsx';
  }
  for (const [name, page] of Object.entries(pages)) {
    const filename = path.join(app(name), page);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, 'export default function Page() { return null; }');
  }
  writeFileSync(path.join(app('app'), 'app/page.tsx'), 'export default function Page() { return null; }');
  writeFileSync(path.join(app('src-app'), 'src/app/page.tsx'), 'export default function Page() { return null; }');
  writeFileSync(app('not-a-directory'), 'fixture');
  symlinkSync(app('web'), app('alias'), process.platform === 'win32' ? 'junction' : 'dir');
});

afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe('Next ESLint dependency boundary', () => {
  it('loads the private adapter through the real Next plugin, without installed braces', () => {
    expect(realpathSync(globRequire.resolve('micromatch'))).toBe(
      realpathSync(path.join(projectRoot, 'tooling/next-eslint-matcher/index.cjs')),
    );
    expect(pluginRequire('fast-glob/package.json').version).toBe('3.3.1');
    expect(pluginRequire('@next/eslint-plugin-next/package.json').version).toBe('16.4.2');
    const lock = JSON.parse(readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { version?: string }>;
    };
    expect(Object.keys(lock.packages).filter((name) => /(?:^|\/)node_modules\/braces$/.test(name))).toEqual([]);
    expect(lock.packages['tooling/next-eslint-matcher'].version).toBe('4.0.8-studio24.1');
  });

  it('retains the distinct default context cwd and explicit process cwd behavior', () => {
    expect(roots()).toEqual([fixture]);
    expect(absolute(roots('.'))).toEqual([projectRoot]);
    expect(absolute(roots('./'))).toEqual([projectRoot]);
  });

  it('matches literal roots without expanding their descendants', () => {
    expect(roots(app('web'))).toEqual([app('web')]);
    expect(absolute(roots(`${app('web')}/`))).toEqual([app('web')]);
  });

  it('retains relative roots and Windows separator normalization', () => {
    const relative = path.relative(projectRoot, app('admin'));
    expect(roots(relative).every((entry) => !path.isAbsolute(entry))).toBe(true);
    expect(absolute(roots(relative))).toEqual([app('admin')]);
    expect(absolute(roots(relative.replace(/[/\\]/g, '\\')))).toEqual([app('admin')]);
  });

  it('preserves glob directory filtering, hidden defaults, spaces and symlinks', () => {
    const found = roots(`${fixture}/apps/*/`);
    expect(found.every((entry) => path.isAbsolute(entry))).toBe(true);
    expect(absolute(found)).toContain(app('with space'));
    expect(absolute(found)).toContain(app('alias'));
    expect(absolute(found)).not.toContain(app('not-a-directory'));
    expect(absolute(found)).not.toContain(app('.hidden'));
    expect(absolute(roots(app('.hidden')))).toEqual([app('.hidden')]);
    expect(absolute(roots(app('alias')))).toEqual([app('alias')]);
  });

  it('retains braces, multi-digit ranges, globstars, extglobs and character classes', () => {
    expect(absolute(roots(`${fixture}/apps/{web,admin}/`))).toEqual([app('admin'), app('web')]);
    expect(absolute(roots(`${fixture}/apps/v{1..12}/`))).toEqual(
      Array.from({ length: 12 }, (_, i) => app(`v${i + 1}`)).sort(),
    );
    expect(absolute(roots(`${fixture}/**/src/pages/`))).toEqual([path.join(app('admin'), 'src/pages')]);
    expect(absolute(roots(`${fixture}/apps/@(web|admin)/`))).toEqual([app('admin'), app('web')]);
    expect(absolute(roots(`${fixture}/apps/app-[ab]/`))).toEqual([app('app-a'), app('app-b')]);
  });

  it('expands array entries independently, retaining overlaps and negative-only semantics', () => {
    expect(absolute(roots([app('web'), `${fixture}/apps/{web,admin}/`, `!${app('admin')}`, null, 7]))).toEqual([
      app('admin'),
      app('web'),
      app('web'),
    ]);
    expect(roots(app('missing'))).toEqual([]);
    expect(roots(app('not-a-directory'))).toEqual([]);
  });

  it.each(['a,b', '1..2', ''])('rejects deeply nested %s braces before expansion', (center) => {
    // GHSA-vfj7-8cjw-p6xm: both compile/expand variants used to exhaust the stack.
    const pattern = '{'.repeat(4500) + center + '}'.repeat(4500);
    expect(() => roots(pattern)).toThrow(new SyntaxError('Next ESLint rootDir brace nesting exceeds 64 levels'));
  });

  it('rejects malformed nesting and bounds expansion without silently omitting roots', () => {
    expect(() => roots('{'.repeat(65))).toThrow(/brace nesting/);
    expect(() => roots('x'.repeat(10001))).toThrow(/10000 characters/);
    expect(() => roots('{a,b}'.repeat(13))).toThrow(/1000 brace expansions/);
    expect(() => matcher.braces('web', { expand: false, nodupes: true })).toThrow(TypeError);
  });

  it('preserves ordinary expansion, duplicates, literal escapes and supported boundaries', () => {
    expect(matcher.braces('apps/{web,{admin,web}}', expandOptions)).toEqual(['apps/web', 'apps/admin']);
    expect(matcher.braces('v{01..03}', expandOptions)).toEqual(['v01', 'v02', 'v03']);
    expect(matcher.braces(String.raw`apps/\{literal\}`, expandOptions)).toEqual(['apps/{literal}']);
    expect(matcher.braces('{1..1000}', expandOptions)).toHaveLength(1000);
    expect(() => matcher.braces('{'.repeat(64) + 'web,admin' + '}'.repeat(64), expandOptions)).not.toThrow();
  });
});

describe('ESLint rule compatibility', () => {
  it.each(layouts)('still rejects internal anchors in the %s layout', async (name) => {
    // Exercise the root URL for app layouts; Next's upstream matcher treats nested app URLs differently.
    const href = name === 'app' || name === 'src-app' ? '/' : '/home/';
    const messages = await lint(app(name), `export default function Page() { return <a href="${href}">Home</a>; }`);
    expect(messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: '@next/next/no-html-link-for-pages', severity: 2 })]),
    );
  });

  it('keeps the rule active for relative, glob and array root settings', async () => {
    for (const rootDir of [
      path.relative(projectRoot, app('web')),
      `${fixture}/apps/{web,admin}/`,
      [app('web'), app('admin')],
    ]) {
      expect(await lint(rootDir)).toEqual(
        expect.arrayContaining([expect.objectContaining({ ruleId: '@next/next/no-html-link-for-pages', severity: 2 })]),
      );
    }
  });

  it('fails lint explicitly for unsafe root settings instead of silently losing the rule', async () => {
    await expect(lint('{'.repeat(4500) + 'a,b' + '}'.repeat(4500))).rejects.toThrow(/brace nesting/);
  });

  it('preserves Next Link, external, new-tab and download exemptions', async () => {
    const messages = await lint(
      app('web'),
      `
      import Link from 'next/link';
      export default function Page() {
        return <><Link href="/home/">Home</Link><a href="https://example.com">External</a>
          <a href="/home/" target="_blank" rel="noreferrer">Tab</a><a href="/home/" download>Download</a></>;
      }
    `,
    );
    expect(messages.filter((message) => message.ruleId === '@next/next/no-html-link-for-pages')).toEqual([]);
  });

  it('keeps the real project Next, TypeScript, React Hooks and accessibility checks enabled', async () => {
    const messages = await lint(
      undefined,
      `
      import { useState } from 'react';
      export default function Page({ show }: { show: any }) {
        if (show) useState(0);
        return <><a href="/">Inicio</a><img src="/image.png" /></>;
      }
    `,
    );
    for (const rule of [
      '@next/next/no-html-link-for-pages',
      '@typescript-eslint/no-explicit-any',
      'react-hooks/rules-of-hooks',
      'jsx-a11y/alt-text',
    ]) {
      expect(messages.map((message) => message.ruleId)).toContain(rule);
    }
  });
});
