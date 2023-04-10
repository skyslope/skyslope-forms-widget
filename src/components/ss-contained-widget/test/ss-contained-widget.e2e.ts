import { newE2EPage } from '@stencil/core/testing';

describe('ss-contained-widget', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<ss-contained-widget></ss-contained-widget>');

    const element = await page.find('ss-contained-widget');
    expect(element).toHaveClass('hydrated');
  });
});
