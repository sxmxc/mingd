import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, normalizeBuildConfig } from "@mingd/build-config";
import { verifyPlatformToolchain } from "../src/toolchain.js";

test("macOS preflight accepts cctools lipo without a version flag and requires an executable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mingd-toolchain-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "target/bin");
  const sdk = join(root, "target/SDK/MacOSX27.0.sdk");
  await mkdir(bin, { recursive: true });
  await mkdir(sdk, { recursive: true });
  await writeFile(join(root, "toolchain.sha256"), "a".repeat(64));
  await writeFile(join(sdk, "SDKSettings.json"), JSON.stringify({ Version: "27.0" }));
  for (const architecture of ["arm64", "x86_64"]) {
    await writeFile(join(bin, `${architecture}-apple-darwin27-clang++`), '#!/bin/sh\n[ "$1" = "--version" ]\n', { mode: 0o755 });
  }
  const saved = { PATH: process.env.PATH, OSXCROSS_ROOT: process.env.OSXCROSS_ROOT, MACOS_TOOLCHAIN_SHA256: process.env.MACOS_TOOLCHAIN_SHA256 };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.PATH = bin;
  process.env.OSXCROSS_ROOT = root;
  process.env.MACOS_TOOLCHAIN_SHA256 = "a".repeat(64);
  const config = normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, platform: "macos", architecture: "universal" });
  await assert.rejects(verifyPlatformToolchain(config, root), /executable lipo on PATH/);
  const lipo = join(bin, "lipo");
  await writeFile(lipo, '#!/bin/sh\necho "fatal error: lipo: unknown flag: $1" >&2\nexit 1\n', { mode: 0o644 });
  await assert.rejects(verifyPlatformToolchain(config, root), /executable lipo on PATH/);
  await rm(lipo);
  await mkdir(lipo);
  await assert.rejects(verifyPlatformToolchain(config, root), /executable lipo on PATH/);
  await rm(lipo, { recursive: true });
  await writeFile(lipo, '#!/bin/sh\necho "fatal error: lipo: unknown flag: $1" >&2\nexit 1\n', { mode: 0o755 });
  await verifyPlatformToolchain(config, root);
  process.env.MACOS_TOOLCHAIN_SHA256 = "b".repeat(64);
  await assert.rejects(verifyPlatformToolchain(config, root), /identity does not match/);
});
