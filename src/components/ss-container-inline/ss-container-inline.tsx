import { Component, Host, h, Env, Element, Event, EventEmitter } from '@stencil/core';
import reinitializeGlobalScript from '../../globalScript';

// Status sent by the embedded Forms app (files-ui PostMessageStatus) when its own
// authentication fails inside the iframe — e.g. the "third-party cookies disabled"
// dead end, or a token that expired mid-session and could not be renewed.
const FORMS_AUTH_FAILED = 'forms-auth-failed';

// Sent by the widget TO the Forms app to hand over a fresh token for in-place session
// renewal (the Forms app imports it without reloading). Paired with a files-ui listener.
const FORMS_SET_TOKEN = 'set-token';

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

  // The current token. Null until the cookie-free fallback is triggered (see tokenMode):
  // the iframe loads WITHOUT a token so browsers whose cookie auth works are unaffected. Once
  // set, it is carried on the iframe URL fragment at (re)load — the Forms app reads it only at
  // load, so it cannot be handed over after the fact without reloading the frame.
  private token: string | null = null;

  // Cookie-free fallback state. Starts false: the iframe loads normally (cookies) and no token
  // is injected. Flips to true only when the Forms app reports an in-iframe auth failure (e.g.
  // Safari's third-party-cookie wall) and a getToken callback exists. Once true, tokens are
  // resolved and injected on (re)load. Browsers where cookies work never reach this, so they
  // never receive a token. Also acts as the single-attempt guard against a reload loop.
  private tokenMode = false;

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
    // Only carry a token forward once the cookie-free fallback is active; refresh it first so a
    // navigation late in a session doesn't reuse a stale one. In the normal (cookie) path this
    // leaves the token null, so navigation never introduces a token.
    if (this.tokenMode) await this.resolveToken();
    this.iframe().src = this.getUrl();
  };

  // Renew the session in place: fetch a fresh token and hand it to the Forms app via
  // postMessage (targeted at the Forms origin), so it can swap the token without a reload.
  // The token stays out of the iframe URL/DOM. No-ops if there is no getToken callback.
  private refreshToken = async () => {
    await this.resolveToken();
    if (this.token == null) return;
    this.iframe()?.contentWindow?.postMessage({ status: FORMS_SET_TOKEN, token: this.token }, new URL(Env.formsUrl).origin);
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
      void this.handleAuthFailed();
    }
  };

  // The Forms app could not authenticate inside the iframe (e.g. Safari's third-party-cookie
  // wall). If a getToken callback exists and we have not already tried, switch to the cookie-free
  // path: fetch a token and reload the iframe with it in the URL fragment. Browsers where the
  // cookie flow works never send FORMS_AUTH_FAILED, so they never enter tokenMode. If there is no
  // token path, or the token fallback itself failed (a second failure), surface it to the host.
  private handleAuthFailed = async () => {
    const getToken = window.skyslope?.widget?.getToken;
    if (getToken == null || this.tokenMode) {
      this.authError.emit({ reason: 'iframe-auth-failed' });
      return;
    }
    this.tokenMode = true;
    await this.resolveToken();
    if (this.token == null) {
      this.authError.emit({ reason: 'iframe-auth-failed' });
      return;
    }
    this.iframe().src = this.getUrl();
  };

  connectedCallback() {
    const { widget } = window.skyslope ?? {};
    widget?.registerReload(this.reloadIframe);
    widget?.registerNavigateTo(this.navigateTo);
    widget?.registerRefresh(this.refreshToken);
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
