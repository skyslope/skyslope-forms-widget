import { Config } from '@stencil/core';
import {AppEnvironment, environment} from './environment';

const environmentsMap = {
  '--dev': AppEnvironment.DEVELOPMENT,
  '--integ': AppEnvironment.INTEG,
  '--staging': AppEnvironment.STAGING,
  '--prod': AppEnvironment.PRODUCTION,
};
let appEnv = AppEnvironment.DEVELOPMENT;
if (process.argv) {
  for (let i = 0; i < process.argv.length; i++) {
    if (environmentsMap[process.argv[i]]) {
      appEnv = environmentsMap[process.argv[i]];
    }
  }
}

export const config: Config = {
  namespace: 'skyslope-forms-widget',
  globalScript: 'src/globalScript.ts',
  devServer: {
    port: 5173,
    reloadStrategy: 'pageReload'
  },
  env: {
    appEnv,
    ...environment[appEnv]
  },
  extras: {
    enableImportInjection: true // support for vite
  },
  outputTargets: [
    {
      type: 'dist',
      esmLoaderPath: '../loader',
    },
    {
      type: 'dist-custom-elements',
    },
    {
      type: 'docs-readme',
      footer: '',
      strict: true
    },
    {
      type: 'www',
      serviceWorker: null, // disable service workers
    },
  ],
};
