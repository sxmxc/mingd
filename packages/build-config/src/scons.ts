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
    `platform=${config.platform === "linux" ? "linuxbsd" : "windows"}`,
    `target=template_${kind}`,
    `arch=${config.architecture}`,
    `optimize=${config.optimization}`,
    `lto=${config.lto && kind === "release" ? "full" : "none"}`,
    "debug_symbols=no",
    "use_static_cpp=yes",
    `disable_3d=${yn(!f.engine3d)}`,
    `disable_advanced_gui=${yn(!f.advancedGui)}`,
    `disable_physics_2d=${yn(!f.physics2d)}`,
    `disable_physics_3d=${yn(!f.physics3d)}`,
    `module_jolt_enabled=${yn(f.jolt)}`,
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
    `module_tilemap_enabled=${yn(f.tilemap)}`,
    `module_svg_enabled=${yn(f.svg)}`,
    `module_ogg_enabled=${yn(f.oggVorbis)}`,
    `module_vorbis_enabled=${yn(f.oggVorbis)}`,
    `module_mp3_enabled=${yn(f.mp3)}`,
    `module_theora_enabled=${yn(f.theora)}`,
    `module_zip_enabled=${yn(f.zip)}`,
    `module_text_server_adv_enabled=${yn(f.textServer === "advanced")}`,
    `module_text_server_fb_enabled=${yn(f.textServer === "fallback")}`,
  ];

  if (config.platform === "windows") {
    // Bootstrap policy: keep the Linux cross-compiler image self-contained.
    // Vulkan/OpenGL remain available; SDK-backed Windows extras can be added later.
    args.push("d3d12=no", "accesskit=no", "winrt=no", "angle=no");
  }

  if (kind === "release") {
    args.push("production=yes");
  }

  return args;
}

export function expectedTemplateFilename(
  config: BuildConfig,
  kind: TemplateKind,
): string {
  if (config.platform === "linux") {
    return `linux_${kind}.${config.architecture}`;
  }
  return `windows_${kind}_${config.architecture}.exe`;
}
