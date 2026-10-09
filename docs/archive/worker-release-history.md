---
title: "Worker release history"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/archive/worker-release-history.md
---

# Worker release history

These notes preserve earlier rollout details and reported results. For current
setup and updates, use [deployment](../operators/deployment.md); for the worker contract and
operator commands, use [distributed workers](../operators/distributed-workers.md).

## Implementation milestones

| Version | Capability delivered |
| --- | --- |
| 0.1.1 | Compiler boundary, protocol schemas, durable assignment ownership, Fastify listener |
| 0.1.2 | Enrollment, authentication, rotation/revocation, idle heartbeats, operator listing |
| 0.1.3 | Queue dispatch, remote compilation, build heartbeats, cancellation, worker deployment |
| 0.1.4 | Streaming uploads, validated completion, retries and durable recovery |
| **0.2.0** | Combined distributed implementation, local acceptance tests and production runbook |
| **0.2.1** | Worker failure reasons and final diagnostics, source/copy output, extraction capability troubleshooting, contract-based upgrade compatibility, and admin worker health/cache/container telemetry |
| **0.2.2** | Landing page and worker dashboard refinements, brand icons, and development origin configuration |
| **0.2.3** | Dependency compatibility fixes, Node 24 runtime/type alignment, Astro editor configuration, process-test reliability, Dependabot major-upgrade holds, and recipe 10 for Emscripten 6.0.11 |

The entries describe implementation milestones; not every intermediate image
was published. Previously published `v0.1.2` images predate the completed
transport. These version numbers describe the recorded milestones, not the current
per-service deployment tags. Use the deployment guide for current releases.

## Upgrading to 0.2.3

Release 0.2.3 keeps protocol v1 and introduces no database migrations. Recipe
10 accounts for the Emscripten 6.0.11 compiler update and prevents reuse of
recipe 9 artifacts that may have used different compilers. Drain active work,
deploy matching web/gateway/worker images, and upgrade worker enrollment for
recipe 10 using the [compiler rollout checklist](../operators/deployment.md#compiler-recipe-and-toolchain-upgrade-checklist). Recipe 9 enrollments
are incompatible; rotating their tokens alone does not update the recipe.

Node images and types align with the Node 24 development/CI baseline. TypeScript
remains on 5.9.3 because Astro check does not support TypeScript 7. Major upgrades
of TypeScript, Node images/types, and Emscripten require coordinated review;
other Dependabot updates remain enabled.

The compatibility checks passed workspace typechecks/tests, the docs build, and
the webpack web build. Four toolchain tests were skipped; the Turbopack build
hit a local-port restriction in the agent environment. These checks do not
establish production deployment or native acceptance of Emscripten 6.

## Upgrading from before 0.2.1

Release 0.2.1 introduced release-independent worker compatibility through
`20261008070551_worker_release_compatibility.sql` and
`20261008071856_worker_telemetry.sql`. Apply the full migration history and drain
active work before updating the gateway and workers. Older images still enforce
exact application releases until updated. The migrations preserve worker IDs
and token hashes; keep the mounted token files.

Once updated, compatibility depends on protocol, recipe, target, and toolchain.
Follow the current [deployment procedure](../operators/deployment.md) to select images,
pull them, and recreate services. Release 0.2.2 adds UI, branding, and development
origin changes without further migrations or protocol/recipe changes.

## Recorded validation

The original notes did not provide a run date or source commit. The counts and
results below belong to those earlier runs and are not a current validation report.

A previous local run used CLI 2.119.0 after CLI 2.120.0 failed during base-schema
initialization. This describes that environment; current installations use the
repository lockfile.

The previous validation record reports passing workspace typechecks/tests,
291 SQL checks, database function lint, web/maintenance/gateway/desktop image builds, the gateway tests on
Node 22, and the HTTPS integration flow with host processes and two isolated
Node 22 worker containers. Those integration builds use diagnostic source fixtures
and dry-run archives, not compiled templates.

The recorded 0.2.1 compatibility run used 0.2.0 enrollments, 0.2.1 workers, and a
different gateway release declaration. It checked that credentials survived
upgrades and that queue, lease, upload, and recovery behavior continued working.
It also checked idle cache/container snapshots and credential-free admin statistics.
The record includes Workers-page checks in local development for SuperAdmin rendering,
ordinary-user denial, signed-out redirects, and desktop/mobile layouts.

The owner reported verifying production HTTPS `/healthz` through NPM. The record
contains no production remote-build or fault-recovery results.
Use the [cutover procedure](../operators/deployment.md#distributed-cutover-and-rollback) to
record those checks for a deployment.
