import { newE2EPage } from '@stencil/core/testing';

describe('ss-container-inline', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<ss-container-inline></ss-container-inline>');

    const element = await page.find('ss-container-inline');
    expect(element).toHaveClass('hydrated');
  });
});
