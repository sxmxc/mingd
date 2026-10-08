# Scheduled maintenance

The [scheduled-maintenance migration](../supabase/migrations/20261007051155_scheduled_maintenance.sql)
creates five schedules; the distributed-execution migration adds upload cleanup
for **six pg_cron schedules** total. Four execute SQL directly. Two request durable
backend tasks processed by the Compose `maintenance` service. Seeing two rows in
`public.maintenance_tasks` or two backend status entries in admin metrics is normal;
those are not the complete cron inventory.

## Schedules and retention

| Cron job | Schedule | Effect |
| --- | --- | --- |
| `mingd-detect-stalled-builds` | Every 5 minutes (`*/5 * * * *`) | Flag nonterminal builds whose heartbeat/creation is over 5 minutes old |
| `mingd-prune-build-logs` | Daily 02:15 (`15 2 * * *`) | Clear terminal log tails older than 30 days, up to 5,000 per run; remove cron run history older than 30 days |
| `mingd-build-statistics` | Daily 02:00 (`0 2 * * *`) | Recompute the previous seven completed-day cohorts; record artifact-storage snapshots |
| `mingd-artifact-cleanup` | Sunday 03:00 (`0 3 * * 0`) | Request eligible artifact retirement and Storage deletion |
| `mingd-worker-upload-cleanup` | Every 5 minutes (`*/5 * * * *`) | Queue expired pending remote uploads for Storage deletion |
| `mingd-release-refresh` | Daily 04:00 (`0 4 * * *`) | Request verified release discovery and official-template measurements |

Clock times use the server's `cron.timezone` (pg_cron defaults to GMT/UTC), not
the viewer's browser timezone. Confirm that setting on self-hosted Postgres.
Daily statistics group completion dates in UTC independently of the scheduler
clock. See [pg_cron configuration](https://github.com/citusdata/pg_cron#setting-up-pg_cron).

Stalled flags are diagnostic: the SQL job does not fail, cancel, or requeue builds.
A fresh heartbeat or terminal state clears the flag. Quiet linking is not itself
proof of a stall. Log pruning retains results, error messages, and metrics.
Daily successful-duration averages exclude artifact-cache hits; storage totals
are inventory snapshots, not bytes produced on that day.

## Backend task lifecycle

The worker polls every 30 seconds, claims one task with a 20-minute lease, and
coalesces repeated requests. Release refresh has a 15-minute attempt deadline.
Failed tasks retain a safe reason and retry after 15 minutes; expired leases
allow recovery after interruption. Successful runs record `completed_at` and
result counts. Release refresh is requested when the migration is applied;
artifact cleanup first waits for its weekly schedule unless requested manually.

Required settings are `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and the matching
`ARTIFACT_BUCKET`; no Redis connection is needed. The maintenance image includes
Python 3 for reference measurements and has a 1 GiB memory limit, one CPU, and
64-process limit in Compose.

```bash
npm run compose:maintenance:build
npm run compose:maintenance:logs
```

A rebuild/redeploy means rebuilding this image and recreating its container on
the application server. It does not mean reinstalling pg_cron or Supabase.
The process logs `Maintenance worker started.` and safe failure events. An idle
worker does not emit a message on every poll. Unknown upstream errors and raw
child output are not forwarded because they may contain credentials.

For a host-run worker with Python 3 and exported server settings:

```bash
npx dotenv -- npm run maintenance --workspace @mingd/builder
npx dotenv -- npm run maintenance --workspace @mingd/builder -- --once
```

`--once` polls for an eligible task; it does not request work or bypass retry timing.
Do not run multiple ad-hoc processes merely to force retries.

## Artifact eligibility and ownership

Artifacts are shared internal cache records, not individually user-owned rows.
Builds carry `user_id` and reference artifacts. Backend uploads may have no
Storage owner; a missing Storage owner is not a deletion criterion.

Cleanup retires artifacts only when all of these hold:

- The artifact is older than 90 days.
- No build references it, across every user and build state.
- No active build uses its cache identity, including the dry-run counterpart.

An old artifact with a retained build reference remains available. Removing a
user/build can leave an unreferenced artifact; the same grace period still
applies. Cleanup is not automatic account deletion or a blanket age-based purge.

Metadata retirement and durable deletion records commit together. The backend
then removes files with the Storage API and acknowledges successful deletion.
Path tombstones remain to protect against concurrent path reuse. Batches are
bounded to 100 artifacts/files and request continuation when full.

This job does not scan arbitrary objects in the bucket, delete solely by
`storage.objects.owner`, or prune local source/ccache/workspace volumes.

## Official release and reference refresh

Refresh first persists a verified release catalog, then measures at most one
missing official TPZ per lease. It requests continuation while more versions need
measurements. A current catalog timestamp can coexist with a failed measurement
and Retry pending: the discovery step succeeded, the later archive step did not.

Archives must match official release identity, size, and SHA-256. Measurement
checks version metadata and binary headers without executing templates. Downloads
are bounded to 4 GiB; nested measurement entries are bounded to 512 MiB and may
use temporary disk files.

Coverage is eight Linux/Windows/Web reference rows per supported release, and
22 rows for 4.6.3/4.7.2, which also support Android/macOS. Android uses engine
`.so` bytes inside each APK. macOS records the universal executable and matching
ARM64/x86_64 slices. These exclude wrappers/runtime support files. Older
partial inventories are backfilled. See [comparisons](recipes-and-comparisons.md).

## Inspect or request work

Use `/admin/metrics` for daily statistics, backend status, safe failure reason,
and persisted catalog freshness. `Idle` / `Last completed: Never` is normal for
artifact cleanup before its first scheduled/manual run.

In privileged SQL on the intended database, inspect `cron.job` for all six
schedules, `cron.job_run_details` for SQL outcomes, and `public.maintenance_tasks`
for backend results. SQL schedule success only means the task was requested;
the Storage/network work can still fail later.

To request a task immediately, use the existing backend-only function:

```sql
select public.request_maintenance('release_refresh');
-- Or request eligible artifact cleanup:
select public.request_maintenance('artifact_cleanup');
```

A request respects active leases and `retry_after`; it does not immediately retry
an ineligible task. Change schedules/retention through reviewed source-controlled
migrations, not unrecorded dashboard edits. Application verification is covered
by [`scheduled_maintenance.sql`](../supabase/tests/scheduled_maintenance.sql)
and builder maintenance/reference tests; see [development](development.md).
