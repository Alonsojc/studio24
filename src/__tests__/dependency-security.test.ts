import { describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';

describe('PDF sanitizer dependency', () => {
  it('removes template expressions reassembled inside attached shadow roots', () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.append(document.createTextNode('$'), document.createElement('object'), document.createTextNode('{1+1}'));

    // GHSA-cg2g-xh64-v4q7: sanitizing in place must also scrub attached shadows.
    DOMPurify.sanitize(host, { SAFE_FOR_TEMPLATES: true, IN_PLACE: true });

    expect(root.textContent).not.toContain('${1+1}');
    expect(root.querySelector('object')).toBeNull();
  });

  it('preserves ordinary text while removing executable HTML and SVG markup', () => {
    expect(DOMPurify.sanitize('<p>Texto seguro</p>')).toBe('<p>Texto seguro</p>');
    const cleaned = DOMPurify.sanitize(
      '<img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><script>alert(1)</script>',
    );
    expect(cleaned).not.toMatch(/onerror|onload|<script/i);
  });
});
