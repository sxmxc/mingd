import type { BuildFeatures } from "./schema.ts";

export type BooleanFeature = Exclude<keyof BuildFeatures, "textServer">;
type FeatureOption = { key: BooleanFeature; label: string; consequence: string; requires?: BooleanFeature; locked?: boolean };
export const FEATURE_GROUPS: { label: string; options: FeatureOption[] }[] = [
  { label: "Rendering & 3D", options: [
    { key: "engine3d", label: "3D engine", consequence: "3D scenes cannot run without this; disables dependent 3D systems." },
    { key: "openxr", label: "XR / OpenXR", requires: "engine3d", consequence: "Required for XR nodes and OpenXR headsets." },
    { key: "gltf", label: "Runtime glTF", requires: "engine3d", consequence: "Required for runtime glTF loading; editor-imported scenes are a separate workflow." },
    { key: "csg", label: "CSG", requires: "engine3d", consequence: "Required for CSG nodes in exported scenes." },
    { key: "gridmap", label: "GridMap", requires: "engine3d", consequence: "Required for GridMap-based levels." },
    { key: "tilemap", label: "TileMap (always included)", locked: true, consequence: "Part of the core scene build; supported releases have no TileMap-only switch." },
  ] },
  { label: "Physics & navigation", options: [
    { key: "physics2d", label: "2D physics", consequence: "Required for 2D physics bodies, areas and collision queries." },
    { key: "physics3d", label: "3D physics", requires: "engine3d", consequence: "Required for 3D bodies, collisions and physics queries." },
    { key: "jolt", label: "Jolt physics", requires: "physics3d", consequence: "Required if your project selects the Jolt 3D physics backend." },
    { key: "navigation2d", label: "2D navigation", consequence: "Required for 2D navigation agents and pathfinding." },
    { key: "navigation3d", label: "3D navigation", requires: "engine3d", consequence: "Required for 3D navigation agents and pathfinding." },
  ] },
  { label: "Networking", options: [
    { key: "multiplayer", label: "Scene multiplayer", consequence: "Disables scene replication and the transport options below. Core HTTP/TCP remains available." },
    { key: "enet", label: "ENet", requires: "multiplayer", consequence: "Required for ENet multiplayer and ENet connection APIs." },
    { key: "websocket", label: "WebSocket", requires: "multiplayer", consequence: "Required for WebSocket peers, including non-multiplayer uses." },
    { key: "webrtc", label: "WebRTC", requires: "multiplayer", consequence: "Required for WebRTC APIs; desktop WebRTC also requires its runtime extension." },
  ] },
  { label: "UI & asset formats", options: [
    { key: "advancedGui", label: "Advanced GUI", consequence: "Disabling removes advanced controls and behaviors; projects using them may fail." },
    { key: "svg", label: "Runtime SVG", consequence: "Required for runtime SVG decoding; editor-imported textures may use other formats." },
    { key: "oggVorbis", label: "Ogg / Vorbis audio", consequence: "Required for Ogg/Vorbis audio. Disabling also removes Theora video." },
    { key: "mp3", label: "MP3 audio", consequence: "Required for MP3 audio streams." },
    { key: "theora", label: "Theora video", requires: "oggVorbis", consequence: "Required for Theora video streams; depends on Ogg/Vorbis." },
    { key: "zip", label: "ZIPReader / ZIPPacker", consequence: "Required for runtime ZIP APIs. This does not change the template archive format." },
  ] },
];
