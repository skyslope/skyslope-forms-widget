import { Component, Host, h, Prop, Listen } from '@stencil/core';

const DescriptionSvg = ({ buttonClass }: { buttonClass: string }) => (
  <svg class={buttonClass} width='18' height='18' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
    <path
      d='M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z'></path>
  </svg>
);

@Component({
  tag: 'ss-button-start-buyer-agreement',
  styleUrl: '../../styles/ss-button-styles.css',
  shadow: false,
})
export class SsButtonStartBuyerAgreement {
  /**
   *
   */
  @Prop() readonly unstyled: boolean = false;

  @Listen('click', {})
  handleClick() {
    window.skyslope.widget.navigateToStartBuyerAgreement();
    if (!window.skyslope.widget.openInline) {
      window.skyslope.widget.openModal();
    }
  }

  render() {
    return (
      <Host>
        <button class={this.unstyled ? '' : 'ss-button-styled'}>
          <DescriptionSvg buttonClass={this.unstyled ? 'hide-icons' : 'ss-icons'} />
          <slot></slot>
        </button>
      </Host>
    );
  }
}
