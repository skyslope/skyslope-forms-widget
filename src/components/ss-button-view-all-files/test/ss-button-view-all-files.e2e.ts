import { newE2EPage } from '@stencil/core/testing';

describe('ss-button-view-all-files', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<ss-button-view-all-files></ss-button-view-all-files>');

    const element = await page.find('ss-button-view-all-files');
    expect(element).toHaveClass('hydrated');
  });
});
