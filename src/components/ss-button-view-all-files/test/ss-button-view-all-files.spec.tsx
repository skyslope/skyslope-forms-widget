import { newSpecPage } from '@stencil/core/testing';
import { SsButtonViewAllFiles } from '../ss-button-view-all-files';

describe('ss-button-view-all-files', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SsButtonViewAllFiles],
      html: `<ss-button-view-all-files></ss-button-view-all-files>`,
    });
    expect(page.root).toEqualHtml(`
      <ss-button-view-all-files>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </ss-button-view-all-files>
    `);
  });
});
