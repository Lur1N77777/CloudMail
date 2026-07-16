const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Keep the iOS development workaround, but let GitHub's Linux runner use
  // NativeWind's virtual module patch so Metro can hash generated web CSS.
  forceWriteFileSystem: process.env.GITHUB_ACTIONS !== "true",
});
