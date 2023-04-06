import { newSpecPage } from '@stencil/core/testing';
import { SsButtonBrowseLibraries } from '../ss-button-browse-libraries';

describe('ss-button-browse-libraries', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SsButtonBrowseLibraries],
      html: `<ss-button-browse-libraries></ss-button-browse-libraries>`,
    });
    expect(page.root).toEqualHtml(`
      <ss-button-browse-libraries>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </ss-button-browse-libraries>
    `);
  });
});
