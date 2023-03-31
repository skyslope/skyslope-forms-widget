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

  private iframe() {
    return this.el.shadowRoot.getElementById('ss-container-iframe') as HTMLIFrameElement;
  }

  connectedCallback() {
    window.skyslope.reload = () => {
      console.log('refreshing iframe');
      this.iframe().contentWindow.postMessage('reload', Env.formsUrl);
    };

    window.skyslope.navigateTo = (path: string) => {
      this.iframe().src = `${Env.formsUrl}${path}`
    }
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
