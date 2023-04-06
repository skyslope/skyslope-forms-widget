import { Component, Host, h, Prop, Listen } from '@stencil/core';

const CreateListingSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" class="ss-icons" height="18" viewBox="0 96 960 960" width="18">
    <path class="ss-icons" d="M160 936V456l320-240 320 240v480H560V656H400v280H160Z" />
  </svg>
);

@Component({
  tag: 'ss-button-create-listing',
  styleUrl: '../../styles/ss-button-styles.css',
  shadow: false,
})
export class SsButtonCreateListing {
  /**
   *
   */
  @Prop() readonly unstyled: boolean = false;
  /**
   *
   */
  @Prop() readonly openModal: boolean = true;

  @Listen('click', {})
  handleClick() {
    if (this.openModal === false) {
      window.skyslope.navigateToCreateListing();
    } else {
      window.skyslope.navigateToCreateListing();
      window.skyslope.openModal();
    }
  }

  render() {
    return (
      <Host>
        <button class={this.unstyled ? '' : 'ss-button-styled'}>
          <CreateListingSvg />
          <slot></slot>
        </button>
      </Host>
    );
  }
}
