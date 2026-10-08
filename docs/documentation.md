---
title: "Documentation site"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/documentation.md
---

# Documentation site

The documentation uses Astro Starlight in the `apps/docs` npm workspace.
The site reads the Markdown guides directly from `docs/`; there are no generated
guides or duplicate content trees. `docs/README.md` is the site home page and
remains the documentation index when browsing the repository on GitHub.

## Local preview

From the repository root, using the Node version in `.nvmrc`:

```bash
npm ci
npm run docs:dev
```

Open `http://localhost:4321/mingd/`. To test the production site, including search:

```bash
npm run typecheck --workspace @mingd/docs
npm run docs:build
npm run docs:preview
```

Search indexes are built during the production build. The docs need no Supabase,
Redis, Docker, or application environment variables.

## Editing guides

Edit the existing files in `docs/`. Each page has YAML frontmatter with a `title`
and an `editUrl` pointing to its source on GitHub. Keep the first Markdown heading
for GitHub readers; the site omits it because Starlight displays the page title.

Use relative Markdown links such as `configuration.md#urls-and-networking`.
The site converts these to published page URLs while preserving fragments.
Links outside `docs/`, such as `../AGENTS.md`, point to repository files on GitHub.

When adding a guide, add it to both [the index](README.md) and the appropriate
sidebar group in `apps/docs/astro.config.mjs`. Keep detailed instructions in the
relevant guide and the root README concise.

## GitHub Pages

The intended site address is `https://sxmxc.github.io/mingd/`.
The configuration uses that origin and the `/mingd` base path.

For the initial repository setup, open **Settings → Pages**, and select
**GitHub Actions** as the build and deployment source. Ensure GitHub Pages is
available for the repository's visibility and account plan. Then merge the site
setup into `main` or manually run the **Documentation** workflow on `main`.

[`.github/workflows/docs.yml`](../.github/workflows/docs.yml) checks documentation
pull requests, builds relevant pushes to `main`, and publishes successful main
builds to the `github-pages` environment. Pull requests do not deploy. Deployment
uses GitHub's workflow token and OIDC; no personal access token is required.
This workflow runs independently of application, database, and container checks.

To use a custom domain later, configure it in GitHub Pages and update `site`,
`base`, and the published-link prefix in `apps/docs/src/documentation-links.mjs`
together. Domain setup is separate from this initial repository-hosted site.
