// electron-builder afterPack hook: turn off Electron features this app never uses, so a copy of
// the app cannot be repurposed (run as plain Node, load code from outside the asar, and so on).
const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const name = context.packager.appInfo.productFilename;
  const target =
    platform === 'darwin'
      ? path.join(context.appOutDir, `${name}.app`)
      : platform === 'win32'
        ? path.join(context.appOutDir, `${name}.exe`)
        : path.join(context.appOutDir, context.packager.executableName);

  await flipFuses(target, {
    version: FuseVersion.V1,
    // Flipping invalidates the macOS signature; re-sign ad hoc so an unsigned local build still runs.
    // Release builds are signed properly by electron-builder after this hook.
    resetAdHocDarwinSignature: platform === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};
