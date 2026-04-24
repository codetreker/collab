import { defineBundledChannelEntry } from "openclaw/plugin-sdk/channel-entry-contract";

export default defineBundledChannelEntry({
  id: "collab",
  name: "Collab",
  description: "Collab team chat channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel.js",
    exportName: "collabPlugin",
  },
  runtime: {
    specifier: "./runtime.js",
    exportName: "setCollabRuntime",
  },
});
