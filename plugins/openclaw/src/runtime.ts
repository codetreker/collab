import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "./runtime-api.js";

const { setRuntime: setCollabRuntime, getRuntime: getCollabRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Collab runtime not initialized");

export { getCollabRuntime, setCollabRuntime };
