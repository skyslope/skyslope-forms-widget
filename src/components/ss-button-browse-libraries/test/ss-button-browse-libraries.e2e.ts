import { newE2EPage } from '@stencil/core/testing';

describe('ss-button-browse-libraries', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<ss-button-browse-libraries></ss-button-browse-libraries>');

    const element = await page.find('ss-button-browse-libraries');
    expect(element).toHaveClass('hydrated');

    const button = await page.find('ss-button-browse-libraries button');
    expect(button).toHaveClass('ss-button-styled');
    element.setProperty('unstyled', true);
    await page.waitForChanges();
    expect(button).not.toHaveClass('ss-button-styled');
  });
});
