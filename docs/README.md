---
title: "min.gd documentation"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/README.md
---

# min.gd documentation

min.gd builds custom Godot export templates from the features you choose.
Start with **Using min.gd** to build and export your game. Running the service
and changing its code have separate guides below.

## Using min.gd

You can use an existing instance without setting up servers or compilers.

| I want to… | Guide |
| --- | --- |
| Make my first custom template | [Build your first template](users/first-template.md) |
| Choose a platform, preset and engine features | [Platforms and features](users/build-profiles.md) |
| Install templates and export my game | [Install and use templates](users/install-templates.md) |
| Find downloads or understand build progress | [Build history and results](users/workbench.md) |
| Save or share a configuration | [Saved recipes](users/recipes-and-comparisons.md) |
| Keep a recipe file with my project | [Portable .gdbuild recipes](users/recipe-files-and-mobile-templates.md) |
| Understand size reductions | [Template sizes](users/template-sizes.md) |
| Manage my profile or reset my password | [Your account](users/account.md) |
| Resolve a build, export or sign-in problem | [User help](users/user-help.md) |

## Operating an instance

These guides are for people hosting or administering min.gd. Commands assume
the repository root unless a guide names a production or Supabase directory.

| Task | Guide |
| --- | --- |
| Deploy or update the service | [Deployment](operators/deployment.md) |
| Configure processes and environments | [Configuration reference](operators/configuration.md) |
| Configure the separate Supabase server and email | [Self-hosted Supabase](operators/self-hosted-supabase.md) |
| Enroll and manage HTTPS workers | [Distributed workers](operators/distributed-workers.md) |
| Provision Android/macOS worker toolchains | [Worker toolchains](operators/worker-toolchains.md) |
| Manage users, administrators and announcements | [Administration](operators/accounts-and-admin.md) |
| Understand cleanup and reference refresh | [Maintenance](operators/maintenance.md) |
| Diagnose server or worker failures | [Operator troubleshooting](operators/troubleshooting.md) |

## Developing min.gd

| Task | Guide |
| --- | --- |
| Run the repository locally | [Local development setup](developers/getting-started.md) |
| Understand components and build semantics | [Architecture](developers/architecture.md), [compiler/package reference](developers/build-reference.md) |
| Make changes and run checks | [Development and validation](developers/development.md), [CI](developers/ci.md) |
| Check exported templates with the fixture | [Template smoke tests](developers/smoke-tests.md) |
| Interpret or benchmark compiler measurements | [Performance](developers/performance.md) |
| Edit and preview this documentation | [Documentation site](developers/documentation.md) |
| Understand repository names or v1 scope | [Naming](developers/naming.md), [v1 product scope](developers/v1-readiness.md) |
| Work as a coding agent | [Agent instructions](../AGENTS.md) |

Historical reports are kept separately: [worker release history](archive/worker-release-history.md)
and [template test reports](archive/template-test-reports.md). Use the current
operator guides for deployment rather than commands from old rollout notes.
