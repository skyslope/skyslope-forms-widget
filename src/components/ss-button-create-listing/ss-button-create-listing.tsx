import { Component, Host, h, Prop, Listen } from '@stencil/core';

const CreateListingSvg = ({ buttonClass }: { buttonClass: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" class={buttonClass} height="18" viewBox="0 96 960 960" width="18">
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

  @Listen('click', {})
  handleClick() {
    window.skyslope.widget.navigateToCreateListing();
    if (!window.skyslope.widget.openInline) {
      window.skyslope.widget.openModal();
    }
  }

  render() {
    return (
      <Host>
        <button class={this.unstyled ? '' : 'ss-button-styled'}>
          <CreateListingSvg buttonClass={this.unstyled ? 'hide-icons' : 'ss-icons'} />
          <slot></slot>
        </button>
      </Host>
    );
  }
}
