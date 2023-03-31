
export enum AppEnvironment {
  DEVELOPMENT = 'dev',
  INTEG = 'integ',
  STAGING = 'staging',
  PRODUCTION = 'prod',
}

export const environment: Record<AppEnvironment, { formsUrl: string }> = {
  [AppEnvironment.DEVELOPMENT]: {
    formsUrl: `https://integ-forms.skyslope.com/`,
  },
  [AppEnvironment.INTEG]: {
    formsUrl: `https://integ-forms.skyslope.com/`,
  },
  [AppEnvironment.STAGING]: {
    formsUrl: `https://staging-forms.skyslope.com/`,
  },
  [AppEnvironment.PRODUCTION]: {
    formsUrl: `https://forms.skyslope.com/`,
  },
};
