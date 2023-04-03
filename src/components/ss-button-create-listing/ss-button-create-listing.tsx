import {Component, Host, h, Prop} from '@stencil/core';

@Component({
  tag: 'ss-button-create-listing',
  styleUrl: 'ss-button-create-listing.css',
  shadow: false,
})
export class SsButtonCreateListing {

  /**
   *
   */
  @Prop() readonly unStyled: boolean = true;

  private onClick() {
    window.skyslope.navigateToCreateListing();

  }

  render() {
    return (
      <Host>
        <button class={this.unStyled ? '' : 'ss-styled-button'} onClick={this.onClick}>
          <slot></slot>
        </button>
      </Host>
    );
  }

}
