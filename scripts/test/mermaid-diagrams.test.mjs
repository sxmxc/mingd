import assert from 'node:assert/strict';
import test from 'node:test';
import { mermaidDiagrams } from '../../apps/docs/src/mermaid-diagrams.mjs';

test('Mermaid fences become escaped diagram source while ordinary code stays code', () => {
  const code = { type: 'code', lang: 'bash', value: 'npm test' };
  const tree = { children: [code, { children: [{ type: 'code', lang: 'mermaid', value: 'flowchart LR\n A["<script>&</script>"] --> B', meta: 'ignored' }] }] };
  mermaidDiagrams()(tree);
  assert.deepEqual(tree.children[0], { type: 'code', lang: 'bash', value: 'npm test' });
  assert.deepEqual(tree.children[1].children[0], {
    type: 'html', value: '<pre class="mermaid-diagram">flowchart LR\n A[&quot;&lt;script&gt;&amp;&lt;/script&gt;&quot;] --&gt; B</pre>',
  });
});
