import { posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsDirectory = fileURLToPath(new URL('../../../docs/', import.meta.url));
const repository = 'https://github.com/sxmxc/mingd/blob/main/';

// Keep source links readable on GitHub while publishing directory-style URLs.
export function documentationLinks() {
  return (tree, file) => {
    if (!file.path || !resolve(file.path).startsWith(docsDirectory)) return;

    // Starlight already displays the frontmatter title as the page heading.
    if (tree.children[0]?.type === 'heading' && tree.children[0].depth === 1) {
      tree.children.shift();
    }

    const source = relative(docsDirectory, file.path).split('\\').join('/');
    function visit(node) {
      if ((node.type === 'link' || node.type === 'definition') && node.url &&
          !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(node.url)) {
        const [, path, suffix = ''] = node.url.match(/^([^?#]*)(.*)$/);
        const target = posix.normalize(posix.join(posix.dirname(source), path));
        if (target.startsWith('../')) {
          node.url = repository + target.slice(3) + suffix;
        } else if (target.endsWith('.md')) {
          const slug = target === 'README.md' ? '' : target.slice(0, -3);
          node.url = `/mingd/${slug ? `${slug}/` : ''}${suffix}`;
        }
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
