import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
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
  if ((all && operands.length !== 1) || (!all && (operands.length !== 2 ||
      !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag ?? "") || tag === "latest"))) {
    throw new Error("Usage: npm run publish -- all [--dry-run], or npm run publish -- <service> -- <versiontag> [--dry-run]. 'all' does not accept a version tag.");
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
    if (!service.image?.startsWith("ghcr.io/")) {
      throw new Error("Set IMAGE_PREFIX=ghcr.io/sxmxc/mingd in root .env before publishing.");
    }
  }
  if (!all && !dryRun) docker(["compose", "build", selection], { env });
  const images = selected.filter(([name, service]) => {
    if (!all) return true;
    const id = docker(["image", "inspect", service.image, "--format", "{{.Id}}"], {
      capture: true, allowMissing: name === "macos-builder",
    });
    if (id === null) {
      console.log("Skipping optional macos-builder: its configured local image is not built.");
      return false;
    }
    return true;
  });
  for (const [name, service] of images) {
    console.log(`${dryRun ? "Would publish" : "Publishing"} ${name}: ${service.image}`);
  }
  if (dryRun) {
    console.log("Preflight passed; nothing built, tagged, pushed, or recorded.");
  } else {
    for (const [, service] of images) docker(["push", service.image]);
    if (!all) rememberTag(selection, tag);
    console.log(`Published ${images.length} images with their individual tags.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Image publication failed.");
  process.exitCode = 1;
}
