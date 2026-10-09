import { posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsDirectory = fileURLToPath(new URL('../../../docs/', import.meta.url));
const repository = 'https://github.com/sxmxc/mingd/blob/main/';

// Audience folders organize source files while existing page URLs stay stable.
export function documentationSlug(source) {
  const page = source.replace(/^(?:users|operators|developers|archive)\//, '').replace(/\.md$/, '');
  return page === 'README' ? 'index' : page;
}

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
          const repositoryPath = relative(resolve(docsDirectory, '..'), resolve(docsDirectory, target)).split('\\').join('/');
          node.url = repository + repositoryPath + suffix;
        } else if (target.endsWith('.md')) {
          const page = documentationSlug(target);
          const slug = page === 'index' ? '' : page;
          node.url = `/mingd/${slug ? `${slug}/` : ''}${suffix}`;
        }
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
