
export enum AppEnvironment {
  DEVELOPMENT = 'dev',
  INTEG = 'integ',
  STAGING = 'staging',
  PRODUCTION = 'prod',
}

// digisignUrl: the DigiSign sender, which Forms hands the user off to inside our frame.
export const environment: Record<AppEnvironment, { formsUrl: string; digisignUrl: string }> = {
  [AppEnvironment.DEVELOPMENT]: {
    // formsUrl: `https://94c7-66-60-164-10.ngrok-free.app/`,
    formsUrl: `http://localhost:3001/`,
    // formsUrl: `https://integ-forms.skyslope.com/`,
    digisignUrl: `http://localhost:3000/`,
  },
  [AppEnvironment.INTEG]: {
    formsUrl: `https://integ-forms.skyslope.com/`,
    digisignUrl: `https://integ-send.skyslope.com/`,
  },
  [AppEnvironment.STAGING]: {
    formsUrl: `https://staging-forms.skyslope.com/`,
    digisignUrl: `https://staging-send.skyslope.com/`,
  },
  [AppEnvironment.PRODUCTION]: {
    formsUrl: `https://forms.skyslope.com/`,
    digisignUrl: `https://send.skyslope.com/`,
  },
};
