import { newE2EPage } from '@stencil/core/testing';

describe('ss-container-modal', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<ss-container-modal></ss-container-modal>');

    const element = await page.find('ss-container-modal');
    expect(element).toHaveClass('hydrated');
  });
});
