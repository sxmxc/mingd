import type { BuildConfig, TemplateKind } from "./schema.ts";
import { normalizeBuildConfig } from "./normalize.ts";

function yn(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

/**
 * Generates only allowlisted SCons key/value arguments.
 * No user-provided string is ever appended as an arbitrary compiler argument.
 */
export function toSconsArgs(input: unknown, kind: TemplateKind): string[] {
  const config = normalizeBuildConfig(input);
  if (!config.templateKinds.includes(kind)) {
    throw new Error(`Template kind ${kind} is not requested by this build.`);
  }

  const f = config.features;
  const args = [
    `platform=${config.platform === "linux" ? "linuxbsd" : config.platform}`,
    `target=template_${kind}`,
    `arch=${config.architecture}`,
    `optimize=${config.optimization}`,
    `lto=${config.lto && kind === "release" ? "full" : "none"}`,
    "debug_symbols=no",
    "c_compiler_launcher=ccache",
    "cpp_compiler_launcher=ccache",
    "import_env_vars=CCACHE_DIR,CCACHE_BASEDIR,CCACHE_STATSLOG",
    `disable_3d=${yn(!f.engine3d)}`,
    `disable_advanced_gui=${yn(!f.advancedGui)}`,
    `disable_physics_2d=${yn(!f.physics2d)}`,
    `disable_physics_3d=${yn(!f.physics3d)}`,
    `module_godot_physics_2d_enabled=${yn(f.physics2d)}`,
    `module_godot_physics_3d_enabled=${yn(f.physics3d)}`,
    `module_jolt_physics_enabled=${yn(f.jolt)}`,
    `disable_navigation_2d=${yn(!f.navigation2d)}`,
    `disable_navigation_3d=${yn(!f.navigation3d)}`,
    `disable_xr=${yn(!f.openxr)}`,
    `module_navigation_2d_enabled=${yn(f.navigation2d)}`,
    `module_navigation_3d_enabled=${yn(f.navigation3d)}`,
    `module_multiplayer_enabled=${yn(f.multiplayer)}`,
    `module_enet_enabled=${yn(f.enet)}`,
    `module_websocket_enabled=${yn(f.websocket)}`,
    `module_webrtc_enabled=${yn(f.webrtc)}`,
    `module_openxr_enabled=${yn(f.openxr)}`,
    `module_gltf_enabled=${yn(f.gltf)}`,
    `module_csg_enabled=${yn(f.csg)}`,
    `module_gridmap_enabled=${yn(f.gridmap)}`,
    `module_svg_enabled=${yn(f.svg)}`,
    `module_ogg_enabled=${yn(f.oggVorbis)}`,
    `module_vorbis_enabled=${yn(f.oggVorbis)}`,
    `module_mp3_enabled=${yn(f.mp3)}`,
    `module_theora_enabled=${yn(f.theora)}`,
    `module_zip_enabled=${yn(f.zip)}`,
    `module_text_server_adv_enabled=${yn(f.textServer === "advanced")}`,
    `module_text_server_fb_enabled=${yn(f.textServer === "fallback")}`,
  ];

  if (config.platform === "web") {
    args.push(`threads=${yn(config.webThreads)}`, "dlink_enabled=no", "proxy_to_pthread=no", "use_closure_compiler=no", "vulkan=no", "opengl3=yes");
  } else {
    args.push("use_static_cpp=yes");
  }

  if (config.platform === "windows") {
    // Bootstrap policy: keep the Linux cross-compiler image self-contained.
    // Vulkan/OpenGL remain available; SDK-backed Windows extras can be added later.
    args.push("d3d12=no", "accesskit=no", "winrt=no", "angle=no", "windows_subsystem=gui");
  }

  if (kind === "release") {
    args.push("production=yes");
  }

  return args;
}

/** Allow validated feature recipes, keeping the supported target policy fixed. */
export function assertRealBuildSupported(input: unknown): BuildConfig {
  const config = normalizeBuildConfig(input);

  if (
    config.optimization !== "size" || config.lto
  ) {
    throw new Error("Real builds require optimize=size and LTO disabled.");
  }
  if (!config.features.tilemap) throw new Error("TileMap must remain enabled: supported Godot releases have no TileMap-only build flag.");
  return config;
}

export function expectedConsoleTemplateFilename(config: BuildConfig, kind: TemplateKind): string {
  if (config.platform !== "windows") throw new Error("Console wrappers are Windows-only.");
  return `windows_${kind}_${config.architecture}_console.exe`;
}

export function compiledTemplateFilename(config: BuildConfig, kind: TemplateKind, console = false): string {
  if (console && config.platform !== "windows") throw new Error("Console wrappers are Windows-only.");
  if (config.platform === "web") return `godot.web.template_${kind}.wasm32${config.webThreads ? "" : ".nothreads"}.zip`;
  return `godot.${config.platform === "linux" ? "linuxbsd" : "windows"}.template_${kind}.${config.architecture}${config.platform === "windows" ? (console ? ".console.exe" : ".exe") : ""}`;
}

export function expectedTemplateFilename(
  config: BuildConfig,
  kind: TemplateKind,
): string {
  if (config.platform === "web") return `web${config.webThreads ? "" : "_nothreads"}_${kind}.zip`;
  if (config.platform === "linux") {
    return `linux_${kind}.${config.architecture}`;
  }
  return `windows_${kind}_${config.architecture}.exe`;
}
