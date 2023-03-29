export type AppEnv = 'dev' | 'prod';
export const environment: Record<AppEnv, { formsUrl: string }> = {
  dev: {
    formsUrl: `https://integ-forms.skyslope.com/`,
  },
  prod: {
    formsUrl: `https://integ-forms.skyslope.com/`,
    // formsUrl: `https://forms.skyslope.com/`,
  },
};
