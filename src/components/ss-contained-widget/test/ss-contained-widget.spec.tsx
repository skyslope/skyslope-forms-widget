import { newSpecPage } from '@stencil/core/testing';
import { SsContainedWidget } from '../ss-contained-widget';

describe('ss-contained-widget', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SsContainedWidget],
      html: `<ss-contained-widget></ss-contained-widget>`,
    });
    expect(page.root).toEqualHtml(`
      <ss-contained-widget>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </ss-contained-widget>
    `);
  });
});
