import { Component, Host, h, Prop, Listen } from '@stencil/core';

const ViewAllFilesSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" class="ss-icons" height="18" viewBox="0 96 960 960" width="18">
    <path d="M560 482v-48q33-14 67.5-21t72.5-7q26 0 51 4t49 10v44q-24-9-48.5-13.5T700 446q-38 0-73 9.5T560 482Zm0 220v-49q33-13.5 67.5-20.25T700 626q26 0 51 4t49 10v44q-24-9-48.5-13.5T700 666q-38 0-73 9t-67 27Zm0-110v-48q33-14 67.5-21t72.5-7q26 0 51 4t49 10v44q-24-9-48.5-13.5T700 556q-38 0-73 9.5T560 592Zm-48 214q50-25 98-37.5T712 756q38 0 78.5 6t69.5 16V349q-34-17-71.822-25-37.823-8-76.178-8-54 0-104.5 16.5T512 379v427Zm-30 90q-51-38-111-58.5T248 817q-36.537 0-71.768 9Q141 835 106 848q-23.1 11-44.55-3Q40 831 40 805V342q0-15 7-27.5T68 295q42-20 87.5-29.5T248 256q63 0 122.5 17T482 325q51-35 109.5-52T712 256q47.179 0 92.089 9.5Q849 275 891 295q14 7 21.5 19.5T920 342v463q0 27.894-22.5 42.447Q875 862 853 848q-34-14-69.232-22.5Q748.537 817 712 817q-63 0-121 21t-109 58Z" />
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
    window.skyslope.widget.navigateToCreateListing();
    if (!window.skyslope.widget.openInline) {
      window.skyslope.widget.openModal();
    }
  }

  render() {
    return (
      <Host>
        <button class={this.unstyled ? '' : 'ss-button-styled'}>
          <ViewAllFilesSvg />
          <slot></slot>
        </button>
      </Host>
    );
  }
}
