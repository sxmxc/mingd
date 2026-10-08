# Worker release history

These notes preserve earlier rollout details and reported results. For current
setup and updates, use [deployment](deployment.md); for the worker contract and
operator commands, use [distributed workers](distributed-workers.md).

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

The entries describe implementation milestones; not every intermediate image
was published. Previously published `v0.1.2` images predate the completed
transport. Current workspace manifests use 0.2.2.

## Upgrading from before 0.2.1

Release 0.2.1 introduced release-independent worker compatibility through
`20261008070551_worker_release_compatibility.sql` and
`20261008071856_worker_telemetry.sql`. Apply the full migration history and drain
active work before updating the gateway and workers. Older images still enforce
exact application releases until updated. The migrations preserve worker IDs
and token hashes; keep the mounted token files.

Once updated, compatibility depends on protocol, recipe, target, and toolchain.
Follow the current [deployment procedure](deployment.md) to select images,
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
Use the [cutover procedure](deployment.md#distributed-cutover-and-rollback) to
record those checks for a deployment.
