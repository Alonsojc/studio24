# Next ESLint Matcher

This private development-only adapter removes `braces` (GHSA-vfj7-8cjw-p6xm)
from the Next ESLint dependency tree without disabling or replacing lint rules.
The override is restricted to `@next/eslint-plugin-next@16.4.2` and its
`fast-glob@3.3.1` dependency. It is not a general-purpose micromatch replacement.
It is a private npm workspace named `micromatch@4.0.8-studio24.1`, not an
upstream release or a package published to the registry.

`fast-glob` uses only `braces(pattern, { expand: true, nodupes: true })`, `scan`,
and `makeRe`. The last two remain the same `picomatch@2.3.2` implementation used
by micromatch 4.0.8. Expansion uses maintained `brace-expansion@5.0.12`, with
explicit errors for nesting over 64 levels or more than 1000 results, instead
of overflowing the stack or silently truncating. The existing 10000-character
input limit is retained. All filesystem discovery stays in fast-glob, preserving
its directory-only filtering, symlinks, exclusions, and absolute paths.

Keep the regression tests when updating the Next ESLint plugin. Remove this
adapter and its override when upstream no longer depends on vulnerable braces.
CI audits the complete dependency tree, including development packages.
