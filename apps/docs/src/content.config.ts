import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { documentationSlug } from './documentation-links.mjs';

export const collections = {
  docs: defineCollection({
    loader: glob({
      pattern: '**/*.md',
      base: '../../docs',
      generateId: ({ entry }) => documentationSlug(entry),
    }),
    schema: docsSchema(),
  }),
};
