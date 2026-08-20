import { Component, Host, h, Env, Element, Event, EventEmitter } from '@stencil/core';
import reinitializeGlobalScript from '../../globalScript';

@Component({
  tag: 'ss-container-inline',
  styleUrl: 'ss-container-inline.css',
  shadow: true,
})
export class SsContainerInline {
  @Element() el: HTMLSsContainerInlineElement;

  /**
   * Emitted when a host-supplied getToken callback throws. Lets the host page react
   * (e.g. re-authenticate the user) instead of the iframe silently dead-ending on the
   * Forms "third-party cookies disabled" page.
   */
  @Event() authTokenError: EventEmitter<{ error: unknown }>;

  // Resolved once before the iframe first renders. The token must be present on the
  // very first iframe URL: the Forms app reads it from the URL fragment only at load,
  // so a later hash change would be ignored.
  private token: string | null = null;

  async componentWillLoad() {
    const getToken = window.skyslope?.widget?.getToken;
    if (getToken == null) return;
    try {
      this.token = (await getToken()) ?? null;
    } catch (error) {
      this.token = null;
      this.authTokenError.emit({ error });
    }
  }

  private addUrlParams(url: string, params: Record<string, string> | string | URLSearchParams): string {
    const urlObj = new URL(url);
    const urlParams = new URLSearchParams(params);
    urlParams.forEach((value, key) => urlObj.searchParams.set(key, value));
    return urlObj.toString();
  }

  private getUrl(): string {
    const { widget } = window.skyslope ?? {};
    if (widget == null) return '';

    const params: Record<string, string> = {
      widgetTrack: JSON.stringify({
        widgetOrigin: window.location.origin,
        widgetSourceEvent: 'click',
        widgetSourceUrl: widget.path,
      }),
    };

    if (widget.idp) params.idp = widget.idp;
    if (widget.headerVariant) params.headerVariant = widget.headerVariant;

    const baseUrl = `${Env.formsUrl}${widget.path}`;
    const url = this.addUrlParams(baseUrl, params);

    // Pass the token in the URL fragment (not a query param): fragments are not sent to
    // the server, and the Forms app strips it from history immediately on read.
    return this.token != null ? `${url}#t=${this.token}` : url;
  }

  private iframe = () => this.el.shadowRoot.getElementById('ss-container-iframe') as HTMLIFrameElement;

  private reloadIframe = () => {
    this.iframe().contentWindow.postMessage('reload', Env.formsUrl);
  };

  private navigateTo = () => {
    this.iframe().src = this.getUrl();
  };

  connectedCallback() {
    const { widget } = window.skyslope ?? {};
    widget?.registerReload(this.reloadIframe);
    widget?.registerNavigateTo(this.navigateTo);
  }

  disconnectedCallback() {
    // this is not actually needed, but I think makes more sense to reinitialize the globalScript stuff if this component isn't alive
    reinitializeGlobalScript();
  }

  render() {
    return (
      <Host>
        <iframe id="ss-container-iframe" frameborder="0" allowfullScreen title="SkySlope Forms" src={this.getUrl()} style={{ backgroundColor: '#f4f8fc' }} />
      </Host>
    );
  }
}
