# min.gd documentation

This documentation reflects the current repository state: many platform, recipe and admin features are implemented and documented, but runtime acceptance and deployment hardening remain explicitly pending where the repository itself says they are not yet confirmed.

- [Naming](naming.md): brand versus technical names, package scope and safe rollout for existing installations.

- [Build profiles](build-profiles.md): available targets, toolchain policy, cache identity and acceptance status.
- [Template smoke tests](smoke-tests.md): build, download, install, export and launch on Linux or Windows.
- [Workbench and activity](workbench.md): monitoring semantics, migration rollout and UI validation.
- [Performance and compiler cache](performance.md): stage timings, memory scope, per-build cache counters and cold/warm benchmarking.
- [Recipes and size comparisons](recipes-and-comparisons.md): saving/sharing configurations, compatibility guidance and measured official-template comparisons.

- [Recipe files and mobile templates](recipe-files-and-mobile-templates.md): `.gdbuild`, Android worker setup and macOS cross-toolchain provisioning.

Update these documents whenever supported profiles, packaging, or validation procedures change. Keep setup and entry points in the root README.
