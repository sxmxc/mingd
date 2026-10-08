import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import { documentationLinks } from './src/documentation-links.mjs';

export default defineConfig({
  site: 'https://sxmxc.github.io',
  base: '/mingd',
  trailingSlash: 'always',
  markdown: {
    processor: unified({ remarkPlugins: [documentationLinks] }),
  },
  integrations: [
    starlight({
      title: 'min.gd',
      logo: { src: '../web/public/web-app-manifest-512x512.png', alt: '' },
      favicon: '/favicon.ico',
      description: 'Build only the Godot your game needs. Setup, build guides, and operations documentation.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/sxmxc/mingd' }],
      markdown: { processedDirs: ['../../docs'] },
      sidebar: [
        { label: 'Documentation', slug: 'index' },
        {
          label: 'Setup and operations',
          items: ['getting-started', 'configuration', 'deployment', 'self-hosted-supabase', 'maintenance', 'troubleshooting', 'accounts-and-admin'],
        },
        {
          label: 'Building and using templates',
          items: ['build-profiles', 'recipes-and-comparisons', 'recipe-files-and-mobile-templates', 'workbench', 'performance', 'smoke-tests'],
        },
        {
          label: 'Contributing',
          items: ['architecture', 'distributed-workers', 'development', 'documentation', 'ci', 'naming', 'worker-release-history'],
        },
      ],
    }),
  ],
});
