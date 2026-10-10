import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import { documentationLinks } from './src/documentation-links.mjs';
import { mermaidDiagrams } from './src/mermaid-diagrams.mjs';

export default defineConfig({
  site: 'https://sxmxc.github.io',
  base: '/mingd',
  trailingSlash: 'always',
  markdown: {
    processor: unified({ remarkPlugins: [documentationLinks, mermaidDiagrams] }),
  },
  integrations: [
    starlight({
      title: 'min.gd',
      components: { Footer: './src/components/DocsFooter.astro' },
      logo: { src: '../web/public/web-app-manifest-512x512.png', alt: '' },
      favicon: '/favicon.ico',
      description: 'Build only the Godot your game needs. User guides, instance operations, and developer documentation.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/sxmxc/mingd' }],
      markdown: { processedDirs: ['../../docs'] },
      sidebar: [
        { label: 'Documentation', slug: 'index' },
        {
          label: 'Using min.gd',
          items: ['first-template', 'build-profiles', 'install-templates', 'workbench', 'recipes-and-comparisons', 'recipe-files-and-mobile-templates', 'template-sizes', 'account', 'user-help'],
        },
        {
          label: 'Operating an instance',
          items: ['deployment', 'release-matrix', 'configuration', 'self-hosted-supabase', 'distributed-workers', 'worker-toolchains', 'accounts-and-admin', 'maintenance', 'troubleshooting'],
        },
        {
          label: 'Developing min.gd',
          items: ['getting-started', 'architecture', 'build-reference', 'development', 'ci', 'smoke-tests', 'performance', 'documentation', 'naming', 'v1-readiness'],
        },
        {
          label: 'Historical records',
          collapsed: true,
          items: ['worker-release-history', 'template-test-reports'],
        },
      ],
    }),
  ],
});
