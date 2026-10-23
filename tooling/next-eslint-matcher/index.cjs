/* eslint-disable @typescript-eslint/no-require-imports -- fast-glob loads this adapter synchronously through CommonJS. */
const { expand } = require('brace-expansion');
const picomatch = require('picomatch');

const MAX_DEPTH = 64;
const MAX_EXPANSIONS = 1000;

function braces(pattern, options) {
  if (typeof pattern !== 'string' || options?.expand !== true || options?.nodupes !== true) {
    throw new TypeError('Next ESLint matcher only supports fast-glob brace expansion');
  }
  if (pattern.length > 10000) {
    throw new SyntaxError('Next ESLint rootDir pattern exceeds 10000 characters');
  }

  // Reject unsafe nesting before any recursive expansion, including malformed patterns.
  let depth = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') {
      i++;
    } else if (pattern[i] === '{') {
      if (++depth > MAX_DEPTH) {
        throw new SyntaxError('Next ESLint rootDir brace nesting exceeds 64 levels');
      }
    } else if (pattern[i] === '}') {
      depth = Math.max(0, depth - 1);
    }
  }

  const expanded = expand(pattern, {
    max: MAX_EXPANSIONS + 1,
    // Input length and result count bound memory; never accept truncated expansion.
    maxLength: Infinity,
    maxDepth: MAX_DEPTH + 1,
    maxRewrites: pattern.length,
  });
  if (expanded.length > MAX_EXPANSIONS) {
    throw new SyntaxError('Next ESLint rootDir exceeds 1000 brace expansions');
  }
  return [...new Set(expanded)];
}

// These are the only three micromatch APIs consumed by fast-glob 3.3.1.
module.exports = { braces, makeRe: picomatch.makeRe, scan: picomatch.scan };
