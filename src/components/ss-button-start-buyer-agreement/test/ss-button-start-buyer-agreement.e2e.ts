import { newE2EPage } from '@stencil/core/testing';

describe('ss-button-start-buyer-agreement', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<ss-button-start-buyer-agreement></ss-button-start-buyer-agreement>');

    const element = await page.find('ss-button-start-buyer-agreement');
    expect(element).toHaveClass('hydrated');
  });
});
