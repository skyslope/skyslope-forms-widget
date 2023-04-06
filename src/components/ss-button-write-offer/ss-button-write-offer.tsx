import { Component, Host, h, Prop, Listen } from '@stencil/core';

const WriteOfferSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" class="ss-icons" height="18" viewBox="0 96 960 960" width="18">
    <path
      class="ss-icons"
      d="M451 863h55v-52q61-7 95-37.5t34-81.5q0-51-29-83t-98-61q-58-24-84-43t-26-51q0-31 22.5-49t61.5-18q30 0 52 14t37 42l48-23q-17-35-45-55t-66-24v-51h-55v51q-51 7-80.5 37.5T343 454q0 49 30 78t90 54q67 28 92 50.5t25 55.5q0 32-26.5 51.5T487 763q-39 0-69.5-22T375 681l-51 17q21 46 51.5 72.5T451 809v54Zm29 113q-82 0-155-31.5t-127.5-86Q143 804 111.5 731T80 576q0-83 31.5-156t86-127Q252 239 325 207.5T480 176q83 0 156 31.5T763 293q54 54 85.5 127T880 576q0 82-31.5 155T763 858.5q-54 54.5-127 86T480 976Z"
    />
  </svg>
);

@Component({
  tag: 'ss-button-write-offer',
  styleUrl: '../../styles/ss-button-styles.css',
  shadow: false,
})
export class SsButtonWriteOffer {
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
          <WriteOfferSvg />
          <slot></slot>
        </button>
      </Host>
    );
  }
}
