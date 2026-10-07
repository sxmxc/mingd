import { FEATURE_GROUPS, type BooleanFeature } from "./features.ts";
import { normalizeBuildConfig } from "./normalize.ts";

/** Representative APIs/assets; this is guidance, not a project dependency scan. */
export const FEATURE_EXAMPLES: Record<BooleanFeature, string[]> = {
  engine3d: ["Node3D", "Camera3D", "MeshInstance3D", "3D physics and navigation"],
  physics2d: ["CharacterBody2D", "RigidBody2D", "Area2D", "CollisionShape2D", "RayCast2D"],
  physics3d: ["CharacterBody3D", "RigidBody3D", "Area3D", "CollisionShape3D"],
  jolt: ["Projects using the Jolt 3D physics backend"],
  navigation2d: ["NavigationAgent2D", "NavigationRegion2D", "NavigationServer2D"],
  navigation3d: ["NavigationAgent3D", "NavigationRegion3D", "NavigationServer3D"],
  multiplayer: ["MultiplayerSpawner", "MultiplayerSynchronizer", "ENet, WebSocket and WebRTC transports"],
  enet: ["ENetMultiplayerPeer", "ENetConnection"],
  websocket: ["WebSocketPeer", "WebSocketMultiplayerPeer"],
  webrtc: ["WebRTCPeerConnection", "WebRTCDataChannel", "WebRTCMultiplayerPeer"],
  openxr: ["OpenXR headsets", "XRController3D", "XROrigin3D"],
  gltf: ["GLTFDocument", "Runtime .gltf / .glb loading"],
  csg: ["CSGBox3D", "CSGCombiner3D", "CSGPolygon3D"],
  gridmap: ["GridMap", "MeshLibrary-based 3D levels"],
  tilemap: ["TileMapLayer", "TileSet"],
  advancedGui: ["RichTextLabel", "TextEdit", "Tree", "FileDialog", "GraphEdit"],
  svg: ["Image.load_svg_from_buffer", "Runtime SVG images"],
  oggVorbis: ["AudioStreamOggVorbis", ".ogg audio", "Theora video"],
  mp3: ["AudioStreamMP3", ".mp3 audio"],
  theora: ["VideoStreamTheora", ".ogv video"],
  zip: ["ZIPReader", "ZIPPacker"],
};
export function compatibilityGuidance(input: unknown) {
  const config = normalizeBuildConfig(input);
  const removed = FEATURE_GROUPS.flatMap(group => group.options).filter(option => !config.features[option.key] &&
    (!option.requires || config.features[option.requires]) &&
    !(config.platform === "web" && (option.key === "enet" || option.key === "openxr")));
  const items = removed.map(option => ({ key: option.key as string, label: option.label, consequence: option.consequence, examples: FEATURE_EXAMPLES[option.key] }));
  if (config.features.textServer === "fallback") items.push({ key: "textServer", label: "Advanced text shaping", consequence: "Fallback text does not provide advanced shaping. Check Arabic, Indic scripts, bidirectional text and every supported language.", examples: ["Complex-script shaping", "Bidirectional text layout"] });
  return items;
}
