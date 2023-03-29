import { newSpecPage } from '@stencil/core/testing';
import { SsIconButton } from '../ss-icon-button';

describe('ss-icon-button', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SsIconButton],
      html: `<ss-icon-button></ss-icon-button>`,
    });
    expect(page.root).toEqualHtml(`
      <ss-icon-button>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </ss-icon-button>
    `);
  });
});
