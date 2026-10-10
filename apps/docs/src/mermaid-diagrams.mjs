const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Convert only Mermaid fences, before the normal code highlighter handles them.
export function mermaidDiagrams() {
  return tree => {
    function visit(node) {
      if (node.type === 'code' && node.lang === 'mermaid') {
        node.type = 'html';
        node.value = `<pre class="mermaid-diagram">${escapeHtml(node.value)}</pre>`;
        delete node.lang;
        delete node.meta;
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
