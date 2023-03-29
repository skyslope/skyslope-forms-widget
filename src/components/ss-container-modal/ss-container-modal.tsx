import { Component, Host, h, Prop, Fragment, Event, EventEmitter } from '@stencil/core';

const CloseSvg = () => <svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 96 960 960' width='24'>
  <path
    d='M256 842.153 213.847 800l224-224-224-224L256 309.847l224 224 224-224L746.153 352l-224 224 224 224L704 842.153l-224-224-224 224Z' />
</svg>;
// const RefreshSvg = () => <svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 96 960 960' width='24'>
//   <path
//     d='M481.539 875.999q-125.625 0-212.812-87.17-87.187-87.169-87.187-212.768t87.187-212.829q87.187-87.231 212.812-87.231 70.154 0 132.769 31.193 62.615 31.192 104.153 88.039V276.001h59.999v244.613H533.847v-59.998h157.999q-31.615-57.923-87.692-91.27Q548.077 336 481.539 336q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h63.229q-27.231 97.922-107.269 158.961-80.038 61.038-181.96 61.038Z' />
// </svg>;



@Component({
  tag: 'ss-container-modal',
  styleUrl: 'ss-container-modal.css',
  shadow: true,
})
export class SsContainerModal {
  /**
   * Should the modal be open
   */
  @Prop() readonly open: boolean;
  /**
   * Classes override for custom styling
   */
  @Prop() readonly classes?: {
    modalWrapper?: string;
    modalOverlay?: string;
    modalHeader?: string;
    modalContent?: string;
    maxWidthContainer?: string;
  };
  /**
   * Callback when close button clicked
   *
   * Closing of the modal should happen automatically, but this event will also be called
   *
   * Call with onCloseClicked (using JSX) or
   * ```const ssContainerModal = document.querySelector('ss-container-modal');
   * ssContainerModal.addEventListener('closeClicked', event => {  your listener })```
   */
  @Event() closeClicked: EventEmitter<void>;
  /**
   * Callback when refresh button clicked
   *
   * Refresh will be handled automatically, but this event will also be called
   *
   * Call with onCloseClicked (using JSX) or
   * ```const ssContainerModal = document.querySelector('ss-container-modal');
   * ssContainerModal.addEventListener('refreshClicked', event => {  your listener })```
   */
  @Event() refreshClicked: EventEmitter<void>;

  private closeClickedHandler= (e) => {
    e.stopPropagation();
    this.closeClicked.emit(e);
    window.skyslope.closeModal();
  }
  // private refreshClickedHandler = (e) => {
  //   e.stopPropagation();
  //   this.refreshClicked.emit();
  //   window.skyslope.refreshIframe();
  // }

  render() {
    const modalWrapperClass = this.classes?.modalWrapper ?? 'modal-wrapper';
    const modalOverlayClass = this.classes?.modalOverlay ?? 'modal-overlay';
    const modalHeaderClass = this.classes?.modalHeader ?? 'modal-header';
    const modalContentClass = this.classes?.modalContent ?? 'modal-content';
    const maxWidthContainerClass = this.classes?.maxWidthContainer ?? 'max-width-container';

    return (
      <Host>
        {this.open ? <Fragment>
          <div class={modalOverlayClass}></div>
          <div class={modalWrapperClass}>
            <div class={maxWidthContainerClass}>
              <div class={modalHeaderClass}>
                <slot></slot>{/*user could add their own buttons if they wanted to*/}
                {/*<ss-icon-button onClick={this.refreshClickedHandler}>*/}
                {/*  <RefreshSvg />*/}
                {/*</ss-icon-button>*/}
                <ss-icon-button onClick={this.closeClickedHandler}>
                  <CloseSvg />
                </ss-icon-button>
              </div>
              <div class={modalContentClass}>
                <ss-container-inline idp='ure'></ss-container-inline>
              </div>
            </div>
          </div>
        </Fragment> : null}
      </Host>
    );
  }

}
