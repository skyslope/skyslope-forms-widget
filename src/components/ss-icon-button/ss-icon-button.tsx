import { Component, Host, h } from '@stencil/core';

const createRipple = event => {
  const ripple = document.getElementsByClassName('ripple')[0];
  // eslint-disable-next-line @stencil-community/strict-boolean-conditions
  if (ripple) {
    ripple.remove();
  }

  const button = event.currentTarget;

  const circle = document.createElement('span');
  const diameter = Math.max(button.clientWidth, button.clientHeight);
  const radius = diameter / 2;

  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${event.offsetX - radius}px`;
  circle.style.top = `${event.offsetY - radius}px`;
  circle.classList.add('ripple');

  button.appendChild(circle);
};

@Component({
  tag: 'ss-icon-button',
  styleUrl: 'ss-icon-button.css',
  shadow: true,
})
export class SsIconButton {
  private onClickHandler(e) {
    createRipple(e);
  }

  render() {
    return (
      <Host>
        <button class='icon-button' onClick={this.onClickHandler}>
          <slot></slot>
        </button>
      </Host>
    );
  }
}
