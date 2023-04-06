import { newE2EPage } from '@stencil/core/testing';

describe('ss-button-write-offer', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<ss-button-write-offer></ss-button-write-offer>');

    const element = await page.find('ss-button-write-offer');
    expect(element).toHaveClass('hydrated');
  });
});
