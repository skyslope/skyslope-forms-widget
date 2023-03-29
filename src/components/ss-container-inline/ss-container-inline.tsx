import { Component, Host, h, Prop, Env, Element } from '@stencil/core';

@Component({
  tag: 'ss-container-inline',
  styleUrl: 'ss-container-inline.css',
  shadow: true,
})
export class SsContainerInline {
  /**
   * The first name
   */
  @Prop() readonly idp!: string;

  @Element() el: HTMLSsContainerInlineElement;

  connectedCallback() {
    window.skyslope.refreshIframe = () => {
      (this.el.shadowRoot.getElementById('ss-container-iframe') as HTMLIFrameElement).contentWindow.postMessage('reload');
    };
  }

  render() {
    return (
      <Host>
        <iframe
          id='ss-container-iframe'
          frameborder='0'
          allowfullScreen
          title='SkySlope Forms'
          src={`${Env.formsUrl}?idp=${this.idp}`}
        />
      </Host>
    );
  }

}
