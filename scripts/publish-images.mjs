import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const includeAll = args.includes("--all");
const dryRun = args.includes("--dry-run");
const identifiers = args.filter(value => value !== "--all" && value !== "--dry-run");
const release = identifiers[0];

function docker(args, capture = false) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    timeout: 30 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Docker command failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`docker ${args[0]} failed (exit ${result.status}).`);
  return result.stdout?.trim();
}

try {
  if (identifiers.length !== 1 || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(release ?? "") || release === "latest") {
    throw new Error("Usage: npm run images:publish[:all] -- <release-identifier> [--dry-run] (use a fresh identifier, not latest).");
  }
  const config = JSON.parse(docker([
    "compose", "--profile", "*",
    "config", "--format", "json", "--no-env-resolution",
  ], true));
  // All application images are defined by Compose build entries, including
  // profiled services. Avoid a second list that can omit a newly added service.
  const services = Object.entries(config.services)
    .filter(([name, service]) => service.build && (includeAll || name !== "macos-builder"))
    .map(([name]) => name);
  if (services.length === 0) throw new Error("No application images selected.");
  console.log(`${dryRun ? "Preflight" : "Publishing"} ${services.length} application images: ${services.join(", ")}`);
  // Inspect every source before modifying tags or publishing. Pin image IDs so
  // a concurrent local build cannot change what a release contains mid-push.
  const images = services.map(service => {
    const source = config.services[service]?.image;
    if (!source?.startsWith("ghcr.io/")) throw new Error("Set IMAGE_PREFIX=ghcr.io/sxmxc/mingd in root .env before publishing.");
    const repository = source.replace(/:[^/:]+$/, "");
    const id = docker(["image", "inspect", source, "--format", "{{.Id}}"], true);
    return { id, source, repository };
  });
  for (const { id, source, repository } of images) {
    console.log(`${source} -> ${repository}:${release} and ${repository}:latest`);
    if (!dryRun) {
      docker(["image", "tag", id, `${repository}:${release}`]);
      docker(["image", "tag", id, `${repository}:latest`]);
    }
  }
  // Publish the complete release before promoting latest. Registries cannot
  // update multiple repositories atomically; a latest-phase failure may leave
  // mixed aliases. The complete release tag remains available for deployment.
  if (dryRun) {
    console.log(`Preflight passed for ${images.length} images; nothing tagged or pushed.`);
  } else {
    for (const { repository } of images) docker(["push", `${repository}:${release}`]);
    for (const { repository } of images) docker(["push", `${repository}:latest`]);
    console.log(`Published ${images.length} images as ${release} and latest.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Image publication failed.");
  process.exitCode = 1;
}
