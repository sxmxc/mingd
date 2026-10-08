const mode = process.env.BUILDER_MODE ?? "direct";
if (mode === "direct") await import("./index.js");
else if (mode === "remote") await import("./remote.js");
else { process.stderr.write("BUILDER_MODE must be direct or remote.\n"); process.exitCode = 1; }
