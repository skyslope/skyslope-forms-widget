import { newSpecPage } from '@stencil/core/testing';
import { SsButtonStartBuyerAgreement } from '../ss-button-start-buyer-agreement';

describe('ss-button-start-buyer-agreement', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SsButtonStartBuyerAgreement],
      html: `<ss-button-start-buyer-agreement></ss-button-start-buyer-agreement>`,
    });
    expect(page.root).toEqualHtml(`
      <ss-button-start-buyer-agreement>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </ss-button-start-buyer-agreement>
    `);
  });
});
