import { newSpecPage } from '@stencil/core/testing';
import { SsButtonCreateListing } from '../ss-button-create-listing';

describe('ss-button-create-listing', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SsButtonCreateListing],
      html: `<ss-button-create-listing></ss-button-create-listing>`,
    });
    expect(page.root).toEqualHtml(`
      <ss-button-create-listing>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </ss-button-create-listing>
    `);
  });
});
