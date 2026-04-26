import { defineBundledChannelEntry } from "openclaw/plugin-sdk/channel-entry-contract";

export default defineBundledChannelEntry({
  id: "borgee",
  name: "Borgee",
  description: "Borgee team chat channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel.js",
    exportName: "borgeePlugin",
  },
  runtime: {
    specifier: "./runtime.js",
    exportName: "setBorgeeRuntime",
  },
});
