---
title: "Documentation site"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/developers/documentation.md
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

The editor uses the workspace TypeScript version from `.vscode/settings.json`.
If `astro/tsconfigs/strict` appears missing after an install, run **TypeScript:
Select TypeScript Version → Use Workspace Version**, then **Developer: Reload
Window**. The preset comes from the installed `astro` package; `npm ci` restores
it. If the TypeScript 7 language server is enabled, run **Disable TypeScript 7
Language Server** before selecting the workspace version. `@astrojs/check`
0.9.10 accepts TypeScript 5 or 6, not 7. Keep the current
TypeScript 5.9 version until a coordinated tooling migration passes all checks.

The root `package.json` overrides `postcss-nested` 6.x's selector parser to
`postcss-selector-parser` 7.1.6 or a newer 7.x release, fixing
[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
Starlight's Expressive Code dependency still requests the parser's 6.x line.
Keep the override until the upstream chain accepts a patched parser; verify the
documentation build when removing it. npm reads overrides from the workspace
root, so this workaround belongs there rather than in `apps/docs/package.json`.

## Editing guides

The header logo uses the same image as the application:
`apps/web/public/web-app-manifest-512x512.png`. Starlight imports that asset
directly. The favicon is `apps/docs/public/favicon.ico`, copied from
`apps/web/app/favicon.ico`; update both copies when changing it. These are
configured in `apps/docs/astro.config.mjs`.

Choose the audience before writing a guide:

- `docs/users/`: actions people take in the app or Godot, using actual UI labels.
- `docs/operators/`: deployment, configuration, worker provisioning and administration.
- `docs/developers/`: implementation, local setup and validation.
- `docs/archive/`: dated reports and historical rollout notes.

Keep each procedure in one owning guide and link to it from related guides.
State application requirements separately from recommendations and examples.
Host placement, Supabase hosting, proxy software, and local domains are operator
choices; document the required connectivity and credentials rather than assuming
one installation layout.

Mermaid fences render as diagrams in the site and remain readable in repository
Markdown. The docs workspace bundles Mermaid locally; no CDN or renderer service
is required. Diagrams follow the site's light/dark theme and scroll horizontally
when necessary. Without JavaScript, their source remains visible. Use a
`mermaid` code fence for diagrams and check rendering in the production preview.
Check product claims against the form, routes and shared build contract. Do not
turn untested cases into invented limitations or release requirements.

Each page has YAML frontmatter with a `title`
and an `editUrl` pointing to its source on GitHub. Keep the first Markdown heading
for GitHub readers; the site omits it because Starlight displays the page title.

Use relative Markdown links such as `../operators/configuration.md#urls-and-networking`.
The site converts these to published page URLs while preserving fragments.
Links outside `docs/`, such as `../../AGENTS.md`, point to repository files on GitHub.

Audience folders organize source files; page URLs retain their existing filenames.
For example, `docs/users/build-profiles.md` still publishes at `/mingd/build-profiles/`.
The content loader and Markdown link transformer share `documentationSlug` in
`apps/docs/src/documentation-links.mjs`. Use unique filenames across audience
folders to avoid duplicate page IDs. Moving a guide between these folders does
not change its public URL; update its relative links and `editUrl` when moving it.

When adding a guide, add it to both [the index](../README.md) and the appropriate
sidebar group in `apps/docs/astro.config.mjs`. Keep detailed instructions in the
relevant guide and the root README concise.

## GitHub Pages

The intended site address is `https://sxmxc.github.io/mingd/`.
The configuration uses that origin and the `/mingd` base path.

For the initial repository setup, open **Settings → Pages**, and select
**GitHub Actions** as the build and deployment source. Ensure GitHub Pages is
available for the repository's visibility and account plan. Then merge the site
setup into `main` or manually run the **Documentation** workflow on `main`.

[`.github/workflows/docs.yml`](../../.github/workflows/docs.yml) checks documentation
pull requests, builds relevant pushes to `main`, and publishes successful main
builds to the `github-pages` environment. Pull requests do not deploy. Deployment
uses GitHub's workflow token and OIDC; no personal access token is required.
This workflow runs independently of application, database, and container checks.

To use a custom domain later, configure it in GitHub Pages and update `site`,
`base`, and the published-link prefix in `apps/docs/src/documentation-links.mjs`
together. Domain setup is separate from this initial repository-hosted site.
