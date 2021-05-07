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
        AZURE_KEY_VAULT_CLIENT_ID,
        AZURE_KEY_VAULT_CLIENT_SECRET,
        AZURE_KEY_VAULT_URI,
        AZURE_KEY_VAULT_CERT_NAME,
      } = process.env;

      console.log('Signing', filePath);
      const command = `azuresigntool sign -kvu ${AZURE_KEY_VAULT_URI} -kvc ${AZURE_KEY_VAULT_CERT_NAME} -kvi ${AZURE_KEY_VAULT_CLIENT_ID} -kvs ${AZURE_KEY_VAULT_CLIENT_SECRET} -tr http://rfc3161timestamp.globalsign.com/advanced -td sha256 '${filePath}'`;
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

if ((['x64', 'arm64'].indexOf(arch) < 0)) {
  console.log(`${process.platform} ${arch} is not supported.`);
}

let targets;
switch (process.platform) {
  case 'darwin': {
    targets = Platform.MAC.createTarget(['zip', 'dmg'], Arch.universal);
    break;
  }
  case 'win32': {
    targets = Platform.WINDOWS.createTarget(['nsis'], Arch[arch]);
    break;
  }
  case 'linux': {
    targets = Platform.LINUX.createTarget(['AppImage', 'tar.gz'], Arch[arch]);
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

const opts = {
  targets,
  config: {
    asarUnpack: [
      'node_modules/node-mac-permissions/build',
      'node_modules/keytar/build',
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
        url: `https://storage2.webcatalog.app/${configJson.internalId}`,
        useMultipleRangeRequest: true,
      },
      {
        provider: 's3',
        bucket: 'storage2.webcatalog.app',
        region: 'us-east-2',
        path: `/${configJson.internalId}`,
      },
    ],
    mac: {
      extendInfo: {},
    },
    win: {
      // https://www.electron.build/configuration/win.html#how-do-delegate-code-signing
      sign: (configuration) => hsmCodeSignAsync(configuration.path),
    },
    afterSign: (context) => {
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
    },
  },
};

if (configJson.allowCamera) {
  opts.config.mac.extendInfo.NSCameraUsageDescription = `The websites you are running request to access your camera. ${configJson.productName} itself does not utilize your camera by any means.`;
}

if (configJson.allowMicrophone) {
  opts.config.mac.extendInfo.NSCameraUsageDescription = `The websites you are running request to access your microphone. ${configJson.productName} itself does not utilize your microphone by any means.`;
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
