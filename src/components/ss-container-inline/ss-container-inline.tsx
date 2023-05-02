import { Component, Host, h, Env, Element } from '@stencil/core';
import reinitializeGlobalScript from '../../globalScript';

@Component({
  tag: 'ss-container-inline',
  styleUrl: 'ss-container-inline.css',
  shadow: true,
})
export class SsContainerInline {
  @Element() el: HTMLSsContainerInlineElement;

  private getUrl() {
    // const idpQuerystring = window.skyslope.widget.path.includes('?') ? `&idp=${window.skyslope.widget.idp}` : `?idp=${window.skyslope.widget.idp}`;
    return `${Env.formsUrl}${window.skyslope.widget.path}`;
  }

  private iframe = () => (this.el.shadowRoot.getElementById('ss-container-iframe') as HTMLIFrameElement);

  private reloadIframe = () => {
    this.iframe().contentWindow.postMessage('reload', Env.formsUrl);
  };

  private navigateTo = () => {
    console.log('navigateTo 2');
    this.iframe().src = this.getUrl();
  };

  connectedCallback() {
    window.skyslope.widget.registerReload(this.reloadIframe)
    window.skyslope.widget.registerNavigateTo(this.navigateTo)
  }

  disconnectedCallback() {
    // this is not actually needed, but I think makes more sense to reinitialize the globalScript stuff if this component isn't alive
    reinitializeGlobalScript();
  }

  render() {
    return (
      <Host>
        <iframe id="ss-container-iframe" frameborder="0" allowfullScreen title="SkySlope Forms" src={this.getUrl()} />
      </Host>
    );
  }
}
