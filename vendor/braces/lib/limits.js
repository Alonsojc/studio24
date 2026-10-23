'use strict';

const MAX_DEPTH = 64;
const MAX_NODES = 20000;

exports.assertParseDepth = stack => {
  if (stack.length > MAX_DEPTH) {
    throw new SyntaxError('Unsafe brace nesting exceeds 64 levels');
  }
};

exports.assertAst = ast => {
  const pending = [{ node: ast, depth: 0 }];
  let count = 1;

  // Inspect children only: valid ASTs have intentional parent/prev backreferences.
  while (pending.length > 0) {
    const { node, depth } = pending.pop();
    if (depth > MAX_DEPTH + 1) {
      throw new SyntaxError('Unsafe brace nesting exceeds 64 levels');
    }
    if (node && node.nodes) {
      for (const child of node.nodes) {
        if (++count > MAX_NODES) {
          throw new SyntaxError('Brace AST exceeds 20000 nodes');
        }
        pending.push({ node: child, depth: depth + 1 });
      }
    }
  }
};
