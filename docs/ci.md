# Continuous integration

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual
runs from GitHub's Actions tab. All jobs use GitHub-hosted Ubuntu runners.
No repository secrets, production services, or private-network access are needed.

The application job uses Node **24.21.0**, pinned in `.nvmrc`, matching the
production host. It installs the lockfile with `npm ci`, generates Next.js route
types, typechecks all workspaces, runs their tests, and builds the web application
and builder workspace. For local development with nvm, run `nvm install` and
`nvm use` in the repository root.

The database job starts a disposable local Supabase Postgres instance, resets it
with every migration, and runs the pgTAP tests in `supabase/tests/`. The CLI
comes from the npm lockfile. SQL tests cover account and artifact access, recipes,
platform constraints, template references, and scheduled maintenance. Cleanup
runs even after a failed step. This job never connects to the deployed database.

Two Docker jobs build the existing web and maintenance images with BuildKit
caching. Those Dockerfiles still use Node 22; the host's Node version does not
change a container's runtime. These jobs validate the Dockerfiles as deployed.
Changing the container runtime is a separate rollout.

The app and Docker builds use a dummy publishable key and loopback URLs. CI
images are validation artifacts and are not published or deployed. A future
release-image workflow must build the web image with the actual production
`NEXT_PUBLIC_*` settings. Privileged credentials belong only in runtime settings.

Real Godot compilation, device export acceptance, compiler-cache integration
tests that require native toolchains, and authenticated browser/email flows are
outside this initial workflow. Existing tests explicitly skip unavailable
toolchains. Keep those acceptance checks in the smoke-test procedure until a
dedicated workflow and runner are configured.

After the first successful GitHub run, configure a branch ruleset for `main`
requiring these four checks:

- `Application checks (Node 24)`
- `Database migrations and SQL tests`
- `Docker build (web)`
- `Docker build (maintenance)`

The workflow does not configure branch rules, publish images, apply production
migrations, or deploy. Deployment remains the existing pull-and-rebuild process
after checks pass. Actions are pinned to immutable commits; update their commit
pins and version comments together when upgrading them.
