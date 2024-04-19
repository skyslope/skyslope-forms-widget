import { Component, Host, h, Env, Element } from '@stencil/core';
import reinitializeGlobalScript from '../../globalScript';

@Component({
  tag: 'ss-container-inline',
  styleUrl: 'ss-container-inline.css',
  shadow: true,
})
export class SsContainerInline {
  @Element() el: HTMLSsContainerInlineElement;

  private addUrlParams(url: string, params: Record<string, string> | string | URLSearchParams): string {
    const urlObj = new URL(url);
    const urlParams = new URLSearchParams(params);
    urlParams.forEach((value, key) => urlObj.searchParams.set(key, value));
    return urlObj.toString();
  }

  private getUrl() {
    let params = {
      widgetTrack: JSON.stringify({
        widgetOrigin: window.location.origin,
        widgetSourceEvent: 'click',
        widgetSourceUrl: window.skyslope.widget.path,
      }),
    };
    if (window.skyslope.widget.idp != null) params['idp'] = window.skyslope.widget.idp;

    return `${this.addUrlParams(`${Env.formsUrl}${window.skyslope.widget.path}`, params)}`;
  }

  private iframe = () => (this.el.shadowRoot.getElementById('ss-container-iframe') as HTMLIFrameElement);

  private reloadIframe = () => {
    this.iframe().contentWindow.postMessage('reload', Env.formsUrl);
  };

  private navigateTo = () => {
    this.iframe().src = this.getUrl();
  };

  connectedCallback() {
    window.skyslope.widget.registerReload(this.reloadIframe);
    window.skyslope.widget.registerNavigateTo(this.navigateTo);
  }

  disconnectedCallback() {
    // this is not actually needed, but I think makes more sense to reinitialize the globalScript stuff if this component isn't alive
    reinitializeGlobalScript();
  }

  render() {
    return (
      <Host>
        <iframe id='ss-container-iframe' frameborder='0' allowfullScreen title='SkySlope Forms' src={this.getUrl()}
                style={{ backgroundColor: '#f4f8fc' }} />
      </Host>
    );
  }
}
