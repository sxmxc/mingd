# Build performance and compiler cache

New builds persist `builds.performance_metrics` (schema version 1) and expose it only through ownership-checked build detail. Apply the performance migration before deploying either consumer; see [rollout](workbench.md). Existing rows remain null. Cached artifacts report artifact reuse, not invented compilation timings or cache counters.

## Measurements and limits

- Stage durations are monotonic wall-clock milliseconds: source preparation/checksum verification, isolated workspace copy, compilation, observed linking, binary validation, packaging (including hashing), upload (including reading the TPZ), and artifact metadata recording. Heartbeat snapshots do not double-count elapsed time. Failure records retain observations gathered before the failure.
- Linking starts at SCons's main-template `Linking Program` message (not a static library or the small Windows console wrapper) and ends when the compile phase finishes. This is an observed interval, not exclusive linker CPU time: parallel compilation, the console-wrapper link and diagnostic probes may overlap it. If no marker is observed, linking is marked unavailable rather than guessed.
- `/usr/bin/time` records maximum child-process RSS around SCons. The reported peak is the maximum across template invocations, in KiB. It is **not total simultaneous compiler memory or whole-container peak memory**; it must not be used alone to set container limits. It becomes available when the process exits, including failures when GNU time produces a report.
- Compiler/cache version strings and per-build ccache result counters accompany hits and misses. Usage is verified only when a compilation hit or miss is observed. No statistics means unverified usage, not a 100% hit rate. Raw counters distinguish uncacheable calls and link invocations.

## Cache configuration

For a package containing both debug and release templates, compiler/link
intervals are accumulated per invocation. One template's linking interval does
not include the next template's compilation. The memory peak remains the maximum
across invocations, and cache counters aggregate the shared per-job statistics log.

The persistent cache is shared; workspaces and statistics logs are isolated by job. SCons explicitly uses `c_compiler_launcher=ccache` and `cpp_compiler_launcher=ccache` for GCC and Windows MinGW, and imports `CCACHE_DIR`, `CCACHE_BASEDIR` and `CCACHE_STATSLOG` into its command environment. Merely adding wrapper binaries to PATH did not establish that Godot used the intended persistent cache.

`CCACHE_BASEDIR` is the job's source root. This allows equivalent source paths under different job roots to be rewritten consistently. Debug symbols remain disabled. We do not enable unsafe sloppiness, disable directory hashing, zero global cache counters or share mutable source workspaces. `CCACHE_STATSLOG` supplies each job's own result lines, avoiding subtraction of global counters contaminated by concurrent builds. The collector stores counts, not absolute workspace paths.

Regression tests compile identical C++ source twice in different workspaces with GCC and MinGW, require a cold miss then a warm hit, and check identical object bytes. Run them inside the builder image to ensure both toolchains are exercised. These small compiler tests do not substitute for measuring a complete Godot build.

An optional source audit runs SCons dry-runs for all eight preset/target combinations in a disposable source copy, checking launcher commands and release output names. With the verified source already cached:

```bash
docker compose --profile builder run --rm --no-deps -v /absolute/path/to/mingd:/app:ro -e MINGD_GODOT_SOURCE=/cache/godot/4.7.2/source --entrypoint node builder --import tsx --test services/builder/test/godot-source.test.ts
```

This does not compile a full template or publish artifacts; without the opt-in source path, the ordinary test suite skips this audit.

## Benchmark procedure

1. Record platform, normalized recipe, recipe version, compiler versions, SCons job count and host CPU/RAM/storage. Do not compare unlike toolchains or recipes as though only cache changed.
2. Build a recipe not already present in the artifact cache. Record all stage durations, peak process RSS and ccache counters. A persisted cache may already be warm; describe it honestly.
3. Build a nearby custom recipe on the same platform to trigger compilation while reusing unchanged objects. Record hit ratio `hits / (hits + misses)`, uncacheable reasons and compile/link times. This is a practical reuse experiment, not an identical-recipe benchmark.
4. An identical request normally bypasses compilation via artifact reuse. For an exact-repeat compiler benchmark use a disposable, isolated test harness/workspace without publishing an artifact; do not delete production artifact rows or flush the shared compiler cache merely to benchmark.
5. Compare stages before deciding on changes: high misses suggest cache/path/recipe investigation; high linking time suggests linker settings; high workspace/source time suggests storage/copying; high packaging/upload time suggests compression/storage/network. Measure full container memory separately before increasing parallelism.

Recipe 8 separates versions, template kinds, targets and Web thread modes, and
pins the Web SDK image. Template binary size sums main executables/WASM across
requested kinds. No claim of full-build speedup is justified without measured
real builds.

References: [ccache 4.7.1 manual](https://ccache.dev/manual/4.7.1.html) (base directory, statistics logs and caveats), [Godot 4.7.2 SConstruct](https://github.com/godotengine/godot/blob/4.7.2-stable/SConstruct) (compiler launchers and environment imports).
