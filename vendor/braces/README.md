# Private Braces Security Backport

This private npm workspace is **not** an upstream release. Runtime sources and
the MIT license come from the official `braces@3.0.3` npm tarball:

- Source: https://registry.npmjs.org/braces/-/braces-3.0.3.tgz
- Published tarball shasum: `490332f40919452272d55a8480adc0c441358789`.
- Advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

The security backport adds only `lib/limits.js` and calls to its guards in
`parse.js`, `compile.js`, `expand.js`, and `stringify.js`. Parsing rejects more
than 64 actual nested brace/parenthesis blocks using the original parser stack,
which already understands quotes, escapes and character classes. Before any
recursive AST walker, an iterative check also rejects excessive AST depth,
cycles and more than 20000 AST nodes. Unsafe input fails with `SyntaxError`.

All existing expansion, duplicate/empty alternative, quoting, range-limit and
matching semantics remain in the original implementation. There is no global
expansion truncation and no substitute glob/parser. Next ESLint, fast-glob and
micromatch remain their published versions; only this exact dependency edge
uses the patched workspace. No npm advisory is suppressed or allowlisted.

The upstream sources are excluded from first-party style linting, not from
auditing or execution tests. Tests verify the actual dependency loaded by the
Next plugin, the dangerous inputs and legitimate matching/lint workflows.

Retire this backport, its workspace/devDependency, override, and lint exclusion
when the upstream dependency chain ships a verified fix. Keep the regression
tests when doing so.
