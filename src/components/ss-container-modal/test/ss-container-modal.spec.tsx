import { newSpecPage } from '@stencil/core/testing';
import { SsContainerModal } from '../ss-container-modal';

describe('ss-container-modal', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SsContainerModal],
      html: `<ss-container-modal></ss-container-modal>`,
    });
    expect(page.root).toEqualHtml(`
      <ss-container-modal>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </ss-container-modal>
    `);
  });
});
