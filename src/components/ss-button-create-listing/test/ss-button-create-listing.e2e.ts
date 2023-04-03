import { newE2EPage } from '@stencil/core/testing';

describe('ss-button-create-listing', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<ss-button-create-listing></ss-button-create-listing>');

    const element = await page.find('ss-button-create-listing');
    expect(element).toHaveClass('hydrated');
  });
});
