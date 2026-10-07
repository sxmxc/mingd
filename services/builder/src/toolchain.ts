import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import type { BuildConfig } from "@mingd/build-config";
const exec = promisify(execFile);

export async function verifyPlatformToolchain(config: BuildConfig, sourceDir: string) {
  if (config.platform === "macos") {
    const root = process.env.OSXCROSS_ROOT;
    if (!root) throw new Error("macOS cross-compilation requires an operator-supplied Apple SDK / OSXCross toolchain.");
    const digest = (await readFile(join(root, "toolchain.sha256"), "utf8")).trim();
    if (!/^[a-f0-9]{64}$/.test(digest) || digest !== process.env.MACOS_TOOLCHAIN_SHA256) throw new Error("macOS toolchain identity does not match the configured SHA-256.");
    const settings = JSON.parse(await readFile(join(root, "target/SDK/MacOSX27.0.sdk/SDKSettings.json"), "utf8"));
    if (settings.Version !== "27.0") throw new Error("macOS worker requires the verified macOS 27.0 SDK.");
    for (const architecture of ["arm64", "x86_64"]) {
      await exec(join(root, `target/bin/${architecture}-apple-darwin27-clang++`), ["--version"], { timeout: 10000 });
      // The compiler's version check never launches ld. Verify that the linker
      // itself can load its host dependencies before spending time compiling.
      await exec(join(root, `target/bin/${architecture}-apple-darwin27-ld`), ["-v"], { timeout: 10000 });
    }
    // cctools lipo has no version flag. Check the same PATH used by packaging;
    // the actual create/verify_arch operations validate it there.
    let lipoAvailable = false;
    for (const directory of (process.env.PATH ?? "").split(delimiter)) {
      const path = join(directory, "lipo");
      try {
        await access(path, constants.X_OK);
        if ((await stat(path)).isFile()) { lipoAvailable = true; break; }
      } catch (error) {
        if (!["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      }
    }
    if (!lipoAvailable) throw new Error("macOS cross-compilation requires an executable lipo on PATH.");
  }
  if (config.platform === "android") {
    const sdk = process.env.ANDROID_HOME;
    if (!sdk) throw new Error("Android builds require the Android SDK worker.");
    const source = await readFile(join(sourceDir, "platform/android/java/app/config.gradle"), "utf8");
    if (!/ndkVersion\s*:\s*'29\.0\.14206865'/.test(source) || !/compileSdk\s*:\s*36\s*,/.test(source) || !/buildTools\s*:\s*'36\.1\.0'/.test(source)) throw new Error("Godot's Android toolchain requirements do not match the pinned worker.");
    await access(join(sdk, "ndk/29.0.14206865/toolchains/llvm/prebuilt/linux-x86_64/bin/clang++"));
    await access(join(sdk, "platforms/android-36/android.jar"));
    await access(join(sdk, "build-tools/36.1.0/aapt2"));
  }
}
