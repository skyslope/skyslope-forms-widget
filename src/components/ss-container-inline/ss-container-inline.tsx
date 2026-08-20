import { Component, Host, h, Env, Element, Event, EventEmitter } from '@stencil/core';
import reinitializeGlobalScript from '../../globalScript';

// Status sent by the embedded Forms app (files-ui PostMessageStatus) when its own
// authentication fails inside the iframe — e.g. the "third-party cookies disabled"
// dead end, or a token that expired mid-session and could not be renewed.
const FORMS_AUTH_FAILED = 'forms-auth-failed';

export type WidgetAuthErrorReason = 'token-callback-failed' | 'iframe-auth-failed';

@Component({
  tag: 'ss-container-inline',
  styleUrl: 'ss-container-inline.css',
  shadow: true,
})
export class SsContainerInline {
  @Element() el: HTMLSsContainerInlineElement;

  /**
   * Emitted when authentication cannot be established for the embedded Forms app, so the
   * host page can react (e.g. re-authenticate the user) instead of the iframe silently
   * dead-ending on the Forms "third-party cookies disabled" page. reason is
   * 'token-callback-failed' when the host getToken callback throws, or 'iframe-auth-failed'
   * when the Forms app reports its own auth failure from inside the iframe.
   */
  @Event() authError: EventEmitter<{ reason: WidgetAuthErrorReason; error?: unknown }>;

  // The current token. Resolved before the iframe first renders and again on every
  // navigation, so a navigation late in a session carries a fresh token. The token must be
  // present on the iframe URL at load: the Forms app reads it from the URL fragment only at
  // load, so it cannot be handed over after the fact without reloading the frame.
  private token: string | null = null;

  private async resolveToken(): Promise<void> {
    const getToken = window.skyslope?.widget?.getToken;
    if (getToken == null) return;
    try {
      this.token = (await getToken()) ?? null;
    } catch (error) {
      this.token = null;
      this.authError.emit({ reason: 'token-callback-failed', error });
    }
  }

  async componentWillLoad() {
    await this.resolveToken();
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

  private navigateTo = async () => {
    // Refresh the token first so a navigation late in the session doesn't reuse a stale one.
    await this.resolveToken();
    this.iframe().src = this.getUrl();
  };

  private handleMessage = (event: MessageEvent) => {
    // Only trust messages from the Forms origin we framed.
    if (event.origin !== new URL(Env.formsUrl).origin) return;
    let data: { status?: string };
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (data?.status === FORMS_AUTH_FAILED) {
      this.authError.emit({ reason: 'iframe-auth-failed' });
    }
  };

  connectedCallback() {
    const { widget } = window.skyslope ?? {};
    widget?.registerReload(this.reloadIframe);
    widget?.registerNavigateTo(this.navigateTo);
    window.addEventListener('message', this.handleMessage);
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.handleMessage);
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
