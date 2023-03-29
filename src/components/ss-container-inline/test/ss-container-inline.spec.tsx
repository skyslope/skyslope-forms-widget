import { newSpecPage } from '@stencil/core/testing';
import { SsContainerInline } from '../ss-container-inline';

describe('ss-container-inline', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SsContainerInline],
      html: `<ss-container-inline></ss-container-inline>`,
    });
    expect(page.root).toEqualHtml(`
      <ss-container-inline>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </ss-container-inline>
    `);
  });
});
