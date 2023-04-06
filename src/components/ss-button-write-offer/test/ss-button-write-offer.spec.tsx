import { newSpecPage } from '@stencil/core/testing';
import { SsButtonWriteOffer } from '../ss-button-write-offer';

describe('ss-button-write-offer', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SsButtonWriteOffer],
      html: `<ss-button-write-offer></ss-button-write-offer>`,
    });
    expect(page.root).toEqualHtml(`
      <ss-button-write-offer>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </ss-button-write-offer>
    `);
  });
});
