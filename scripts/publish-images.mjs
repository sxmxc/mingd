import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [operation, ...args] = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const operands = args.filter(value => value !== "--dry-run" && value !== "--");
const [selection, tag] = operands;
const all = selection === "all";
const tagVariable = service => `${service.toUpperCase().replaceAll("-", "_")}_IMAGE_TAG`;

function docker(args, { capture = false, env = process.env, allowMissing = false } = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    env,
    stdio: ["ignore", capture ? "pipe" : "inherit", allowMissing ? "pipe" : "inherit"],
    timeout: 30 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Docker command failed: ${result.error.message}`);
  if (result.status !== 0) {
    if (allowMissing) return null;
    throw new Error(`docker ${args[0]} failed (exit ${result.status}).`);
  }
  return result.stdout?.trim();
}

function rememberTag(service, tag) {
  const key = tagVariable(service);
  const original = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, "gm");
  const next = pattern.test(original)
    ? original.replace(pattern, `${key}=${tag}`)
    : `${original}${original && !original.endsWith("\n") ? "\n" : ""}${key}=${tag}\n`;
  writeFileSync(".env", next, { mode: 0o600 });
  console.log(`Recorded ${key}=${tag} in the build checkout's .env.`);
}

try {
  // Preserve the existing application build command used by CI and contributors.
  if (operation === "build" && args.length === 0) {
    const result = spawnSync("npm", ["run", "build", "--workspaces", "--if-present"], { stdio: "inherit" });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }
  if (!["build", "push", "publish"].includes(operation)) throw new Error("Unknown image operation.");
  if ((all && operands.length !== 1) || (!all && (operands.length !== 2 ||
      !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag ?? "") || tag === "latest"))) {
    throw new Error("Usage: npm run build|push|publish -- all [--dry-run], or npm run build|push|publish -- <service> -- <versiontag> [--dry-run]. 'all' does not accept a version tag.");
  }
  const env = all ? process.env : { ...process.env, [tagVariable(selection)]: tag };
  const config = JSON.parse(docker([
    "compose", "--profile", "*", "config", "--format", "json", "--no-env-resolution",
  ], { capture: true, env }));
  const services = Object.entries(config.services).filter(([, service]) => service.build);
  if (!all && !services.some(([name]) => name === selection)) {
    throw new Error(`Unknown build service: ${selection}. Choose ${services.map(([name]) => name).join(", ")}.`);
  }
  const selected = all ? services : services.filter(([name]) => name === selection);
  if (!selected.length) throw new Error("No application images selected.");
  for (const [, service] of selected) {
    if (operation !== "build" && !service.image?.startsWith("ghcr.io/")) {
      throw new Error("Set IMAGE_PREFIX=ghcr.io/sxmxc/mingd in root .env before publishing.");
    }
  }

  const images = selected.filter(([name, service]) => {
    if (!all) return true;
    if (operation === "build" && name !== "macos-builder") return true;
    const id = docker(["image", "inspect", service.image, "--format", "{{.Id}}"], {
      capture: true, allowMissing: name === "macos-builder",
    });
    if (id === null) {
      console.log("Skipping optional macos-builder: its configured local image is not built.");
      return false;
    }
    return true;
  });
  if ((operation === "build" || (operation === "publish" && !all)) && !dryRun) {
    docker(["compose", "build", ...images.map(([name]) => name)], { env });
  }
  for (const [name, service] of images) {
    console.log(`${dryRun ? "Would " : ""}${operation} ${name}: ${service.image}`);
    if (!all && operation !== "build") {
      console.log(`${dryRun ? "Would update" : "Updating"} ${service.image.replace(/:[^/:]+$/, ":latest")}`);
    }
  }
  if (dryRun) {
    console.log("Preflight passed; nothing built, tagged, pushed, or recorded.");
  } else {
    if (operation !== "build") {
      for (const [, service] of images) {
        if (all) {
          docker(["push", service.image]);
        } else {
          const id = docker(["image", "inspect", service.image, "--format", "{{.Id}}"], { capture: true });
          const latest = service.image.replace(/:[^/:]+$/, ":latest");
          docker(["image", "tag", id, latest]);
          docker(["push", service.image]);
          docker(["push", latest]);
        }
      }
    }
    if (!all) rememberTag(selection, tag);
    console.log(`Completed ${operation} for ${images.length} images with their individual tags.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Image publication failed.");
  process.exitCode = 1;
}
