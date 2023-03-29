import { newE2EPage } from '@stencil/core/testing';

describe('ss-icon-button', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<ss-icon-button></ss-icon-button>');

    const element = await page.find('ss-icon-button');
    expect(element).toHaveClass('hydrated');
  });
});
