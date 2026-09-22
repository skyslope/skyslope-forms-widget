import { Component, Host, h, Env, Element, Event, EventEmitter } from '@stencil/core';
import reinitializeGlobalScript, { readGetToken } from '../../globalScript';

// Status sent by the embedded Forms app (files-ui PostMessageStatus) when its own
// authentication fails inside the iframe — e.g. the "third-party cookies disabled"
// dead end, or a token that expired mid-session and could not be renewed.
const FORMS_AUTH_FAILED = 'forms-auth-failed';

// Sent by the widget TO the Forms app to hand over a fresh token for in-place session
// renewal (the Forms app imports it without reloading). Paired with a files-ui listener.
const FORMS_SET_TOKEN = 'set-token';

// Sent back by the Forms app once it has tried to install a token we pushed. Carries the
// expiry of the token the SESSION ended up with, which is what we re-arm the timer on.
const FORMS_TOKEN_INSTALLED = 'token-installed';

// Ask the host for a fresh token this long before the current one expires.
//
// This has to land inside a specific window, and renewing EARLIER is not safer — it is useless.
// The token exchange caches one internal token per user and serves it to every exchange request
// until a TTL sweep drops the cache entry five minutes before that token expires. Ask any sooner
// and the exchange hands back the same token the session is already running on, so the renewal
// buys nothing. Mongo's TTL monitor runs about once a minute, so an entry due at five minutes
// out is really gone somewhere between five and four minutes out; three minutes clears that with
// a full sweep to spare, and still leaves enough runway for the round trip and one retry.
const RENEWAL_LEAD_MS = 3 * 60 * 1000;

// How long the host's getToken gets before we call the renewal failed. Without this, a
// callback that never settles would let the session die with nothing reported.
const GET_TOKEN_TIMEOUT_MS = 30 * 1000;

// A failed renewal is not fatal — the current token keeps working until it really expires —
// so wait a little and try once more before telling the host.
const RENEWAL_RETRY_MS = 30 * 1000;

// A replacement token has to outlive the one it replaces by at least this much. A host that
// hands back the same near-dead token from a cache would otherwise put us in a tight loop.
const MIN_EXPIRY_GAIN_MS = 60 * 1000;

export type WidgetAuthErrorReason = 'token-callback-failed' | 'iframe-auth-failed' | 'token-renewal-failed';

@Component({
  tag: 'ss-container-inline',
  styleUrl: 'ss-container-inline.css',
  shadow: true,
})
export class SsContainerInline {
  @Element() el: HTMLSsContainerInlineElement;

  /**
   * Emitted when authentication cannot be established or kept for the embedded Forms app, so
   * the host page can react (e.g. re-authenticate the user) instead of the iframe silently
   * dead-ending. reason is 'token-callback-failed' when the host getToken callback throws or
   * times out, 'iframe-auth-failed' when the Forms app reports its own auth failure from
   * inside the iframe, and 'token-renewal-failed' when a renewal could not be completed
   * before the current token ran out.
   */
  @Event() authError: EventEmitter<{ reason: WidgetAuthErrorReason; error?: unknown }>;

  // The token most recently handed to the Forms app. Null until the cookie-free fallback is
  // triggered (see tokenMode): the iframe loads WITHOUT a token so browsers whose cookie auth
  // works are unaffected.
  private token: string | null = null;

  // Cookie-free fallback state. Starts false: the iframe loads normally (cookies) and no token
  // is injected. Flips to true only when the Forms app reports an in-iframe auth failure (e.g.
  // Safari's third-party-cookie wall) and a getToken callback exists. Once true, tokens are
  // resolved and injected on (re)load. Browsers where cookies work never reach this, so they
  // never receive a token. Also acts as the single-attempt guard against a reload loop.
  private tokenMode = false;

  // When the token the session is running on expires, in epoch ms. Null while we are not on
  // the token path or the token could not be decoded.
  private expiresAt: number | null = null;

  // ReturnType<typeof setTimeout> rather than number: @types/node is in scope here, so the
  // bare global is typed as Node's Timeout. This form is correct in both environments.
  private renewalTimer: ReturnType<typeof setTimeout> | null = null;

  // One retry is allowed per renewal round; it resets when a renewal succeeds.
  private renewalRetryUsed = false;

  // The last expiry Forms reported for the SESSION. Distinct from expiresAt, which starts out as
  // the expiry of a token we sent — those two can legitimately differ, so only this is comparable
  // from one renewal to the next.
  private lastReportedExpiry: number | null = null;

  // Read the `exp` claim without verifying the signature. The widget is not the thing that
  // trusts this token — it only needs to know when to go and ask for the next one.
  private decodeExpiry(jwt: string | null): number | null {
    if (jwt == null) return null;
    try {
      const payload = jwt.split('.')[1];
      if (payload == null || payload === '') return null;
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      const exp = JSON.parse(json)?.exp;
      return typeof exp === 'number' && isFinite(exp) ? exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private clearRenewalTimer(): void {
    if (this.renewalTimer != null) {
      clearTimeout(this.renewalTimer);
      this.renewalTimer = null;
    }
  }

  // Arm the next renewal. An undecodable token simply gets no timer — we would be guessing.
  private scheduleRenewal(expiresAt: number | null): void {
    this.clearRenewalTimer();
    this.expiresAt = expiresAt;
    if (expiresAt == null) return;

    const lifetime = expiresAt - Date.now();
    if (lifetime <= 0) {
      void this.renewNow();
      return;
    }
    // A token with less life left than the lead is already inside the window, so go now.
    const delay = Math.max(0, lifetime - RENEWAL_LEAD_MS);
    this.renewalTimer = setTimeout(() => {
      void this.renewNow();
    }, delay);
  }

  // Give the host's callback a deadline. A promise that never settles is otherwise
  // indistinguishable from a host that is simply slow.
  private withTimeout(pending: Promise<string | null>): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('getToken timed out')), GET_TOKEN_TIMEOUT_MS);
      pending.then(
        value => {
          clearTimeout(timer);
          resolve(value ?? null);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private async resolveToken(): Promise<void> {
    const getToken = readGetToken();
    if (getToken == null) return;
    try {
      this.token = await this.withTimeout(Promise.resolve(getToken()));
    } catch (error) {
      this.token = null;
      this.authError.emit({ reason: 'token-callback-failed', error });
    }
  }

  // Fetch a fresh token and hand it to the Forms app in place. `force` is used by the host's
  // own refreshToken() call, where an early rotation is intentional and the staleness check
  // would only get in the way.
  private renewNow = async (force = false): Promise<void> => {
    // No token path configured - a cookie-based host, or the native web view. There is
    // nothing to renew and nothing has gone wrong, so this is a silent no-op: no retry
    // timer, no authError. Only the token path can fail to renew.
    if (readGetToken() == null) return;

    const previousExpiry = this.expiresAt;
    await this.resolveToken();
    if (this.token == null) {
      this.handleRenewalFailure();
      return;
    }

    const nextExpiry = this.decodeExpiry(this.token);
    if (!force && previousExpiry != null && nextExpiry != null && nextExpiry - previousExpiry < MIN_EXPIRY_GAIN_MS) {
      // The host handed back something that expires no later than what we already had.
      this.handleRenewalFailure();
      return;
    }

    this.postTokenToForms(this.token);
    // Arm on what we can see for now. Forms answers with the expiry of the token the session
    // actually ended up using — after an exchange that can differ — and we re-arm on that.
    this.scheduleRenewal(nextExpiry);
  };

  private handleRenewalFailure(): void {
    // The current token still works until it really expires, so one failure is not the end.
    if (!this.renewalRetryUsed) {
      this.renewalRetryUsed = true;
      this.clearRenewalTimer();
      this.renewalTimer = setTimeout(() => {
        void this.renewNow();
      }, RENEWAL_RETRY_MS);
      return;
    }
    this.clearRenewalTimer();
    this.authError.emit({ reason: 'token-renewal-failed' });
  }

  // Always targeted at the exact Forms origin. A '*' target would hand the token to whatever
  // happened to be listening.
  private postTokenToForms(token: string): void {
    this.iframe()?.contentWindow?.postMessage({ status: FORMS_SET_TOKEN, token }, new URL(Env.formsUrl).origin);
  }

  private handleTokenInstalled(data: { ok?: boolean; exp?: number }): void {
    if (data.ok === false) {
      this.handleRenewalFailure();
      return;
    }

    const installedExpiry = typeof data.exp === 'number' && isFinite(data.exp) ? data.exp * 1000 : this.expiresAt;

    // A renewal that leaves the session expiring at the same moment has not renewed anything.
    // This is not hypothetical: the token exchange returns the SAME internal token for a given
    // user for that token's whole life, so handing it a fresh partner token buys no extra time.
    // Re-arming on an unchanged expiry schedules the next attempt at zero delay and spins, so
    // treat it as a failed renewal — back off, then tell the host, which is the only actor that
    // can do anything about it.
    //
    // Compared against the last expiry FORMS reported, never against the expiry of a token we
    // sent: the session's token can legitimately outlive or undercut the one handed over, and
    // that difference is the whole reason the acknowledgement carries an expiry at all.
    if (
      this.lastReportedExpiry != null &&
      installedExpiry != null &&
      installedExpiry - this.lastReportedExpiry < MIN_EXPIRY_GAIN_MS
    ) {
      this.handleRenewalFailure();
      return;
    }

    this.lastReportedExpiry = installedExpiry;
    this.renewalRetryUsed = false;
    this.scheduleRenewal(installedExpiry);
  }

  // Background tabs throttle timers, so a widget that has been hidden for a long time can come
  // back already past its renewal point. Check on the way in rather than trusting the timer.
  private handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return;
    if (!this.tokenMode || this.expiresAt == null) return;
    if (Date.now() >= this.expiresAt - RENEWAL_LEAD_MS) void this.renewNow();
  };

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

  // Renew the session in place. Exposed to the host as widget.refreshToken() for the case
  // where its own token rotates early (an account switch, say) — the normal five-minute
  // renewal is driven by our own timer and needs nothing from the host.
  private refreshToken = async () => {
    await this.renewNow(true);
  };

  private handleMessage = (event: MessageEvent) => {
    // Only trust messages from the Forms origin we framed.
    if (event.origin !== new URL(Env.formsUrl).origin) return;
    let data: { status?: string; ok?: boolean; exp?: number };
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (data?.status === FORMS_AUTH_FAILED) {
      void this.handleAuthFailed();
      return;
    }
    if (data?.status === FORMS_TOKEN_INSTALLED) {
      this.handleTokenInstalled(data);
    }
  };

  // The Forms app could not authenticate inside the iframe (e.g. Safari's third-party-cookie
  // wall). If a getToken callback exists and we have not already tried, switch to the cookie-free
  // path: fetch a token and reload the iframe with it in the URL fragment. Browsers where the
  // cookie flow works never send FORMS_AUTH_FAILED, so they never enter tokenMode. If there is no
  // token path, or the token fallback itself failed (a second failure), surface it to the host.
  private handleAuthFailed = async () => {
    const getToken = readGetToken();
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
    // From here the session lives on a token with a finite life, so start watching it.
    this.scheduleRenewal(this.decodeExpiry(this.token));
  };

  connectedCallback() {
    const { widget } = window.skyslope ?? {};
    widget?.registerReload(this.reloadIframe);
    widget?.registerNavigateTo(this.navigateTo);
    widget?.registerRefresh(this.refreshToken);
    window.addEventListener('message', this.handleMessage);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.handleMessage);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.clearRenewalTimer();
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
