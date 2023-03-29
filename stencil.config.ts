import { Config } from '@stencil/core';
import { AppEnv, environment } from './environment';

const appEnv: AppEnv = process.argv && process.argv.indexOf('--dev') > -1 ? 'dev' : 'prod';

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
  outputTargets: [
    // {
    //   type: 'dist',
    //   esmLoaderPath: '../loader',
    // },
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
