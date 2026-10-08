---
title: "min.gd documentation"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/README.md
---

# min.gd documentation

Start with the guide for your task. Commands assume the repository root unless
a guide names the production deployment directory or separate Supabase directory.

## Setup and operations

| Guide | Covers |
| --- | --- |
| [Local development setup](getting-started.md) | Local services, first Linux build, and optional workers |
| [Configuration](configuration.md) | Environment files, process-specific variables, queues, and URLs |
| [Deployment](deployment.md) | Image-only production setup, local publishing, migrations, updates, and rollback |
| [Self-hosted Supabase](self-hosted-supabase.md) | Separate Supabase server, Auth URLs, SMTP, and email templates |
| [Maintenance](maintenance.md) | Six cron schedules, two backend tasks, retention, retries, and references |
| [Troubleshooting](troubleshooting.md) | Auth errors, queued/stalled builds, maintenance failures, and cache issues |
| [Accounts and administration](accounts-and-admin.md) | First SuperAdmin, access controls, worker telemetry, site settings, and account emails |

## Building and using templates

| Guide | Covers |
| --- | --- |
| [Build profiles](build-profiles.md) | Release/platform matrix, presets, restrictions, packages, and acceptance records |
| [Recipes and comparisons](recipes-and-comparisons.md) | Private recipes, share links, compatibility guidance, and measured savings |
| [Recipe files and mobile templates](recipe-files-and-mobile-templates.md) | `.gdbuild`, Android builds, and optional macOS SDK provisioning |
| [Workbench](workbench.md) | Build history, output, heartbeat and stage semantics |
| [Performance](performance.md) | Timings, memory scope, compiler cache, and benchmarking |
| [Template smoke tests](smoke-tests.md) | Installation, export, native/browser/device launch, and pass criteria |

## Contributing

| Guide | Covers |
| --- | --- |
| [Architecture](architecture.md) | Component boundaries, lifecycle, cache identity, and authorization |
| [Distributed workers](distributed-workers.md) | HTTPS gateway, private production topology, enrollment, version targets, health/cache telemetry, resource limits and acceptance |
| [Development and validation](development.md) | Local checks, migrations, compiler audits, and contribution workflow |
| [Documentation site](documentation.md) | Starlight preview, guide editing, and GitHub Pages publishing |
| [CI](ci.md) | GitHub Actions jobs, branch checks, and coverage limits |
| [Naming](naming.md) | Brand, technical names, and infrastructure identities |
| [Worker release history](worker-release-history.md) | Earlier distributed-worker rollouts and recorded validation results |
| [Agent instructions](../AGENTS.md) | Repository-specific inspection, change, and validation rules |

Update the relevant guide when behavior changes, and link to it from the
[root README](../README.md). Record template export and launch results using
[smoke tests](smoke-tests.md).
