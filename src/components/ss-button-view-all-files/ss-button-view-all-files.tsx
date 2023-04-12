import { Component, Host, h, Prop, Listen } from '@stencil/core';

const ViewAllFilesSvg = ({ buttonClass }: { buttonClass: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" class={buttonClass} height="18" viewBox="0 96 960 960" width="18">
    <path d="M141 896q-24 0-42-18.5T81 836V316q0-23 18-41.5t42-18.5h280l60 60h340q23 0 41.5 18.5T881 376v460q0 23-18.5 41.5T821 896H141Z" />
  </svg>
);

@Component({
  tag: 'ss-button-view-all-files',
  styleUrl: '../../styles/ss-button-styles.css',
  shadow: false,
})
export class SsButtonViewAllFiles {
  /**
   *
   */
  @Prop() readonly unstyled: boolean = false;

  @Listen('click', {})
  handleClick() {
    window.skyslope.widget.navigateToViewAllFiles();
    if (!window.skyslope.widget.openInline) {
      window.skyslope.widget.openModal();
    }
  }

  render() {
    return (
      <Host>
        <button class={this.unstyled ? '' : 'ss-button-styled'}>
          <ViewAllFilesSvg buttonClass={this.unstyled ? 'hide-icons' : 'ss-icons'} />
          <slot></slot>
        </button>
      </Host>
    );
  }
}
