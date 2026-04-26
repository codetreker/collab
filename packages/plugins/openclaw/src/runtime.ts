import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "./runtime-api.js";

const { setRuntime: setBorgeeRuntime, getRuntime: getBorgeeRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Borgee runtime not initialized");

export { getBorgeeRuntime, setBorgeeRuntime };
