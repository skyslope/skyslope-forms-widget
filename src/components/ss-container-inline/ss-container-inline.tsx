import { Component, Host, h, Env, Element } from '@stencil/core';
import { SkyslopePaths } from './types';
import reinitializeGlobalScript from '../../globalScript';

@Component({
  tag: 'ss-container-inline',
  styleUrl: 'ss-container-inline.css',
  shadow: true,
})
export class SsContainerInline {
  @Element() el: HTMLSsContainerInlineElement;

  private iframe() {
    return this.el.shadowRoot.getElementById('ss-container-iframe') as HTMLIFrameElement;
  }

  private reloadIframe() {
    this.iframe().contentWindow.postMessage('reload', Env.formsUrl);
  }

  private navigateTo(path: string) {
    console.log('navigateTo 2');
    this.iframe().src = `${Env.formsUrl}${path}?idp=${window.skyslope.idp}`;
    // window.skyslope.path = path;
  }

  connectedCallback() {
    window.skyslope.reload = () => this.reloadIframe();
    window.skyslope.navigateTo = (path: string) => this.navigateTo(path);
    window.skyslope.navigateToCreateTransaction = () => this.navigateTo(SkyslopePaths.CreateTransaction);
    window.skyslope.navigateToCreateListing = () => this.navigateTo(SkyslopePaths.CreateListing);
    window.skyslope.navigateToBrowseLibraries = () => this.navigateTo(SkyslopePaths.BrowseLibraries);
    window.skyslope.navigateToViewAllFiles = () => this.navigateTo(SkyslopePaths.ViewFiles);
  }

  disconnectedCallback() {
    // this is not actually needed, but I think makes more sense to reinitialize the globalScript stuff if this component isn't alive
    reinitializeGlobalScript();
  }

  private idpQuerystring = window.skyslope.path.includes('?') ? `&idp=${window.skyslope.idp}` : `?idp=${window.skyslope.idp}`;

  render() {
    return (
      <Host>
        <iframe id="ss-container-iframe" frameborder="0" allowfullScreen title="SkySlope Forms" src={`${Env.formsUrl}${window.skyslope.path}${this.idpQuerystring}`} />
      </Host>
    );
  }
}
