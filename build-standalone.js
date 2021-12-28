/* eslint-disable max-len */
/* eslint-disable header/header */
/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
const builder = require('electron-builder');
const path = require('path');
const fs = require('fs-extra');
const { notarize } = require('electron-notarize');
const { exec } = require('child_process');

const packageJson = require('./package.json');
const configJson = require('./config.json');

const execAsync = (cmd, opts = {}) => new Promise((resolve, reject) => {
  exec(cmd, opts, (e, stdout, stderr) => {
    if (e instanceof Error) {
      reject(e);
      return;
    }

    if (stderr) {
      reject(new Error(stderr));
      return;
    }

    resolve(stdout);
  });
});

const signEvsAsync = (appOutDir) => Promise.resolve()
  .then(() => {
    const cmd = `python3 -m castlabs_evs.vmp sign-pkg "${appOutDir}"`;
    console.log('Running:', cmd);
    return execAsync(cmd)
      .then((result) => console.log(result));
  })
  .then(() => {
    // verify
    const cmd = `python3 -m castlabs_evs.vmp verify-pkg "${appOutDir}"`;
    console.log('Running:', cmd);
    return execAsync(cmd)
      .then((result) => console.log(result));
  });

// sometimes, notarization works but *.app does not have a ticket stapled to it
// this ensure the *.app has the notarization ticket
const verifyNotarizationAsync = (filePath) => new Promise((resolve, reject) => {
  // eslint-disable-next-line no-console
  console.log(`xcrun stapler validate ${filePath.replace(/ /g, '\\ ')}`);

  exec(`xcrun stapler validate ${filePath.replace(/ /g, '\\ ')}`, (e, stdout, stderr) => {
    if (e instanceof Error) {
      reject(e);
      return;
    }

    if (stderr) {
      reject(new Error(stderr));
      return;
    }

    if (stdout.indexOf('The validate action worked!') > -1) {
      resolve(stdout);
    } else {
      reject(new Error(stdout));
    }
  });
});

// run each signing task at once
let codeSigningPromise = Promise.resolve();
const hsmCodeSignAsync = (filePath) => {
  codeSigningPromise = codeSigningPromise
    .then(() => new Promise((resolve, reject) => {
      const {
        AZURE_KEY_VAULT_TENANT_ID,
        AZURE_KEY_VAULT_CLIENT_ID,
        AZURE_KEY_VAULT_CLIENT_SECRET,
        AZURE_KEY_VAULT_URI,
        AZURE_KEY_VAULT_CERT_NAME,
      } = process.env;

      console.log('Signing', filePath);
      const command = `azuresigntool sign -kvu ${AZURE_KEY_VAULT_URI} -kvc ${AZURE_KEY_VAULT_CERT_NAME} -kvt ${AZURE_KEY_VAULT_TENANT_ID} -kvi ${AZURE_KEY_VAULT_CLIENT_ID} -kvs ${AZURE_KEY_VAULT_CLIENT_SECRET} -tr http://rfc3161timestamp.globalsign.com/advanced -td sha256 '${filePath}'`;
      exec(command, { shell: 'powershell.exe' }, (e, stdout, stderr) => {
        if (e instanceof Error) {
          console.log(stdout);
          reject(e);
          return;
        }

        if (stderr) {
          reject(new Error(stderr));
          return;
        }

        if (stdout.indexOf('Signing completed successfully') > -1) {
          resolve(stdout);
        } else {
          reject(new Error(stdout));
        }
      });
    }));
  return codeSigningPromise;
};

const { Arch, Platform } = builder;

console.log(`Machine: ${process.platform}`);

const appVersion = packageJson.version;

const arch = process.env.TEMPLATE_ARCH || 'x64';

let targets;
switch (process.platform) {
  case 'darwin': {
    // use Arch.universal because
    // electron-updater 4.3.10 -> 4.5.1 has a bug preventing
    // Intel-based Macs from updating if there exists Arch.arm64 builds
    // https://github.com/electron-userland/electron-builder/pull/6212
    targets = Platform.MAC.createTarget(['zip', 'dmg'], Arch.universal);
    break;
  }
  case 'win32': {
    targets = Platform.WINDOWS.createTarget(['nsis'], Arch.x64, Arch.arm64);
    break;
  }
  case 'linux': {
    const targetNames = ['AppImage', 'tar.gz'];
    if (arch !== 'arm64') targetNames.push('snap');
    targets = Platform.LINUX.createTarget(targetNames, Arch[arch]);
    break;
  }
  default: {
    console.log('Platform is not supported');
    process.exit(1);
  }
}

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJsonContent = fs.readJSONSync(packageJsonPath);
packageJsonContent.name = configJson.productName;
packageJsonContent.description = configJson.productDescription;
fs.writeJSONSync(packageJsonPath, packageJsonContent, { spaces: '  ' });

const protocols = [];
if (configJson.setAsDefaultBrowser) {
  protocols.push({
    name: 'HTTPS Protocol',
    schemes: ['https'],
  });
  protocols.push({
    name: 'HTTP Protocol',
    schemes: ['http'],
  });
}
if (configJson.setAsDefaultEmailClient) {
  protocols.push({
    name: 'Mailto Protocol',
    schemes: ['mailto'],
  });
}
if (configJson.setAsDefaultCalendarApp) {
  protocols.push({
    name: 'Webcal Protocol',
    schemes: ['webcal'],
  });
}

// Linux arm64 is not supported by Widevine DRM
const widevineSupported = !(process.platform === 'linux' && arch === 'arm64');

const opts = {
  targets,
  config: {
    // build from source to build keytar as universal binary
    // https://github.com/webcatalog/neutron/pull/620
    buildDependenciesFromSource: process.platform === 'darwin',
    asarUnpack: [
      'node_modules/node-mac-permissions/build',
      'node_modules/keytar/build',
      'node_modules/sqlite3/lib/binding',
    ],
    appId: configJson.productId,
    // https://github.com/electron-userland/electron-builder/issues/3730
    buildVersion: process.platform === 'darwin' ? appVersion : undefined,
    productName: configJson.productName,
    files: [
      '!docs/**/*',
      '!popclip/**/*',
      '!test/**/*',
    ],
    directories: {
      buildResources: 'build-resources',
    },
    protocols,
    publish: [
      {
        provider: 'generic',
        channel: 'latest',
        url: `https://cdn-2.webcatalog.io/${configJson.internalId}`,
        useMultipleRangeRequest: true,
      },
      {
        provider: 's3',
        channel: 'latest',
        bucket: 'cdn-2.webcatalog.io',
        region: 'us-east-2',
        path: `/${configJson.internalId}`,
      },
    ],
    mac: {
      // https://github.com/electron/electron/issues/19307#issuecomment-524314643
      extendInfo: {
        NSCameraUsageDescription: `The websites you are running request to access your camera. ${configJson.productName} itself does not utilize your camera by any means.`,
        NSMicrophoneUsageDescription: `The websites you are running request to access your microphone. ${configJson.productName} itself does not utilize your microphone by any means.`,
      },
    },
    win: {
      // https://www.electron.build/configuration/win.html#how-do-delegate-code-signing
      sign: (configuration) => hsmCodeSignAsync(configuration.path),
    },
    afterPack: (context) => {
      // pre-generated .sig files that exist in the app bundle prevents @electron/universal from working correctly with castlab-electron
      // so we remove it, EVS will re-generate the file
      // https://github.com/castlabs/electron-releases/issues/105#issuecomment-905087389
      if (context.electronPlatformName === 'darwin' && widevineSupported && context.arch !== Arch.universal) {
        const { appOutDir } = context;
        const appName = context.packager.appInfo.productFilename;
        fs.unlinkSync(`${appOutDir}/${appName}.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Electron Framework.sig`);
      }

      if (context.electronPlatformName === 'darwin' && context.arch === Arch.arm64) {
        // fix https://github.com/castlabs/electron-releases/issues/111
        const { appOutDir } = context;
        const appName = context.packager.appInfo.productFilename;
        const arm64MainMenuLibPath = `${appOutDir}/${appName}.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/MainMenu.nib`;
        const x64MainMenuLibPath = arm64MainMenuLibPath.replace('mac-universal--arm64', 'mac-universal--x64');
        fs.copySync(x64MainMenuLibPath, arm64MainMenuLibPath);
      }

      // sign with Castlabs EVS
      // https://github.com/castlabs/electron-releases/wiki/EVS
      // for macOS, run this before signing
      // eslint-disable-next-line react/destructuring-assignment
      if (context.electronPlatformName === 'darwin' && context.arch === Arch.universal) {
        return signEvsAsync(context.appOutDir);
      }
      return null;
    },
    afterSign: (context) => Promise.resolve()
      .then(() => {
        // sign with Castlabs EVS
        // https://github.com/castlabs/electron-releases/wiki/EVS
        // for Windows (x64 only), run this after signing
        if (context.electronPlatformName === 'win32' && context.arch !== Arch.arm64) {
          return signEvsAsync(context.appOutDir);
        }
        return null;
      })
      .then(() => {
        // Only notarize app when forced in pull requests or when releasing using tag
        const shouldNotarize = process.platform === 'darwin' && context.electronPlatformName === 'darwin' && process.env.CI_BUILD_TAG;
        if (!shouldNotarize) return null;

        console.log('Notarizing app...');
        // https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/
        const { appOutDir } = context;

        const appName = context.packager.appInfo.productFilename;
        const appPath = `${appOutDir}/${appName}.app`;

        return notarize({
          appBundleId: configJson.productId,
          appPath,
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_ID_PASSWORD,
        })
          .then(() => verifyNotarizationAsync(appPath))
          .then((notarizedInfo) => {
            // eslint-disable-next-line no-console
            console.log(notarizedInfo);
          });
      }),
  },
};

if (!widevineSupported) {
  console.log('Packaging using Electron@electron/electron');
} else {
  console.log('Packaging using Electron@castlabs/electron-releases');
  // use https://github.com/castlabs/electron-releases/releases
  // to support widevinedrm
  // https://github.com/castlabs/electron-releases/issues/70#issuecomment-731360649
  opts.config.electronDownload = {
    version: `${packageJson.devDependencies.electron}+wvcus`,
    mirror: 'https://github.com/castlabs/electron-releases/releases/download/v',
  };
}

Promise.resolve()
  .then(() => {
    const buildResourcesPath = path.join(__dirname, 'build-resources');
    const filesToBeReplaced = fs.readdirSync(path.join(buildResourcesPath, 'build'));

    const p = filesToBeReplaced.map((fileName) => fs.copyFile(
      path.join(buildResourcesPath, 'build', fileName),
      path.join(__dirname, 'build', fileName),
    ));
    return Promise.all(p);
  })
  .then(() => builder.build(opts))
  .then(() => {
    console.log('build successful');
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
