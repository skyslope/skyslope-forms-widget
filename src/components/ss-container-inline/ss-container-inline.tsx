import { Component, Host, h, Env, Element, Event, EventEmitter } from '@stencil/core';
import reinitializeGlobalScript, { readGetToken } from '../../globalScript';

// Status sent by the embedded Forms app (files-ui PostMessageStatus) when its own
// authentication fails inside the iframe — e.g. the "third-party cookies disabled"
// dead end, or a token that expired mid-session and could not be renewed.
const FORMS_AUTH_FAILED = 'forms-auth-failed';

// Sent by the widget TO the Forms app to hand over a fresh token for in-place session
// renewal (the Forms app imports it without reloading). Paired with a files-ui listener.
const FORMS_SET_TOKEN = 'forms-set-token';

// Sent back by the Forms app once it has tried to install a token we pushed. Carries the
// expiry of the token the SESSION ended up with, which is what we re-arm the timer on.
const FORMS_TOKEN_INSTALLED = 'forms-token-installed';

// Sent by the widget TO the Forms app when the host signs the user out or switches users, so
// Forms drops the session it built from our tokens. Paired with a files-ui listener.
const FORMS_CLEAR_TOKEN = 'forms-clear-token';

// Sent back by the Forms app once it has dropped that session.
const FORMS_TOKEN_CLEARED = 'forms-token-cleared';

// Sent by the Forms app each time it loads in the frame, with the expiry of the token its
// session is using. The first sign-in (the #t= reload) gets no forms-token-installed answer, and
// that session token can expire before the host token we sent, so the first renewal is timed on this.
const FORMS_SESSION_EXPIRY = 'forms-session-expiry';

// Sent by the Forms app when the user signed out inside it during a token session. Forms has
// already dropped the session; the host decides what happens next.
const FORMS_SIGNED_OUT = 'forms-signed-out';

// The same token hand-off for the DigiSign sender. Forms hands the user off to DigiSign by
// navigating our frame there; in a token session DigiSign cannot sign in by cookie either, so it
// asks us for a token. DigiSign -> widget: no session, waiting for a token.
const DIGISIGN_AUTH_REQUIRED = 'digisign-auth-required';
// widget -> DigiSign: a token to install (the first one and every renewal).
const DIGISIGN_SET_TOKEN = 'digisign-set-token';
// DigiSign -> widget: the outcome, with the expiry of the token its session uses.
const DIGISIGN_TOKEN_INSTALLED = 'digisign-token-installed';
// widget -> DigiSign: the host signed out; drop the session.
const DIGISIGN_CLEAR_TOKEN = 'digisign-clear-token';
// DigiSign -> widget: the session is gone.
const DIGISIGN_TOKEN_CLEARED = 'digisign-token-cleared';
// DigiSign -> widget: it gave up waiting for a token.
const DIGISIGN_AUTH_FAILED = 'digisign-auth-failed';
const DIGISIGN_SIGNED_OUT = 'digisign-signed-out';

// Which app is in our frame. Its URL is another origin we cannot read, so we go by which app
// last sent us a message.
type FrameApp = 'forms' | 'digisign';

// The shape of the status messages the apps in our frame send us. sessionless is set on
// forms-session-expiry only when Forms is signed in from a widget token.
type FrameMessage = { status?: string; ok?: boolean; exp?: number; sessionless?: boolean };

// The set-token status each app expects.
const SET_TOKEN_STATUS: Record<FrameApp, string> = { forms: FORMS_SET_TOKEN, digisign: DIGISIGN_SET_TOKEN };

// A JWT-style exp (seconds) as epoch ms, or null if it is not a usable number.
function expToMs(exp: unknown): number | null {
  return typeof exp === 'number' && isFinite(exp) ? exp * 1000 : null;
}

// How long each step of a clear waits: the app's confirmation, then, after a DigiSign clear, the
// Forms reload. An older Forms never answers, and the host should not wait long on its own sign-out.
const CLEAR_WAIT_MS = 3 * 1000;

// Fragment that tells Forms to drop the session stored in this frame as it starts. Used after a
// clear that went to DigiSign, which cannot reach the Forms session it was handed off from.
const FORMS_CLEAR_FRAGMENT = 'forms-clear=1';

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

// A renewal has to move the session's expiry, as Forms (or DigiSign) reports it back, by at least
// this much. An unchanged expiry would otherwise re-arm at zero delay and spin. The app's answer is
// judged, not the host token (except that an older app that sends no expiry is judged on the host
// token's): a host that caches its token hands back the same one, and the exchange still turns it
// into a fresh session token inside the renewal window.
const MIN_EXPIRY_GAIN_MS = 60 * 1000;

// The longest delay setTimeout accepts. A longer one fires at once.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

export type WidgetAuthErrorReason = 'token-callback-failed' | 'iframe-auth-failed' | 'token-renewal-failed' | 'signed-out';

@Component({
  tag: 'ss-container-inline',
  styleUrl: 'ss-container-inline.css',
  shadow: true,
})
export class SsContainerInline {
  @Element() el: HTMLSsContainerInlineElement;

  /**
   * Emitted when sign-in inside the frame cannot be established or kept, so the host can react
   * (e.g. re-authenticate the user). reason is 'token-callback-failed' when getToken throws or
   * times out, 'iframe-auth-failed' when Forms or DigiSign could not sign in inside the frame,
   * 'token-renewal-failed' when a renewal failed twice, and 'signed-out' when the user signed out
   * inside Forms or DigiSign during a token session.
   */
  @Event({ bubbles: true, composed: true }) authError: EventEmitter<{ reason: WidgetAuthErrorReason; error?: unknown }>;

  // The token most recently fetched from the host and handed to the app in the frame. Null outside
  // token mode, so browsers whose cookie sign-in works never get one.
  private token: string | null = null;

  // True once Forms reported its cookie sign-in failed (Safari's third-party-cookie wall, say) and
  // the host has a getToken. Only then are tokens fetched and sent. Also stops a second wall from
  // reloading again, which would loop. Also set when the frame shows it is already on a widget token
  // session (after a host reload or a remount, Forms restores that session from the frame's storage).
  private tokenMode = false;

  // True after the user signed out inside Forms or DigiSign, or the host called clearToken(). Until the
  // next cookie wall starts a new sign-in, a frame that says it is on a token session is not taken up:
  // a token then would sign the user straight back in, or race the reload that drops the session.
  private adoptionBlocked = false;

  // Best known session expiry, in epoch ms: the token we sent, until the app reports the real one.
  // Null while we are not on the token path or the token could not be decoded.
  private expiresAt: number | null = null;

  // When the next renewal is due, in epoch ms, including any minimum wait (a retry, or the floor
  // after a renewal post). The visibility check renews only once this has passed. Null when no
  // renewal is planned.
  private renewalDueAt: number | null = null;

  // Not `number`: @types/node is in scope, so setTimeout is typed as Node's.
  private renewalTimer: ReturnType<typeof setTimeout> | null = null;

  // One retry is allowed per renewal round; it resets when a renewal succeeds.
  private renewalRetryUsed = false;

  // The session expiry from the last successful install answer (Forms or DigiSign). The next
  // renewal answer is judged against it. Null until the first answer after a sign-in. Distinct from
  // expiresAt, which starts out as the expiry of a token we sent.
  private lastInstalledExpiry: number | null = null;

  // Resolves the wait in clearToken() with the app that confirmed the clear. Null when no clear is
  // waiting.
  private resolveClearWait: ((app: FrameApp) => void) | null = null;

  // Bumped whenever the token session ends: the host's clearToken(), a sign-out inside Forms, or
  // unmount. Token work that awaits the host records it first and stops if it changed, so a token
  // fetched before the session ended is never used after it.
  private sessionGeneration = 0;

  // The clear in progress, so a second clearToken() call joins it instead of starting another.
  private clearing: Promise<void> | null = null;

  // The renewal in progress. The timer and the visibility check can both fire at once; a second
  // renewal would read the first one's answer as a renewal that gained nothing.
  private renewing: Promise<void> | null = null;

  // The app that last spoke to us from our frame. Renewals go to it.
  private frameApp: FrameApp = 'forms';

  // Read the `exp` claim without verifying the signature. The widget is not the thing that
  // trusts this token — it only needs to know when to go and ask for the next one.
  // A missing or malformed payload throws and lands in the catch.
  private decodeExpiry(jwt: string): number | null {
    try {
      const payload = jwt.split('.')[1];
      return expToMs(JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).exp);
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
  // minDelayMs keeps the next attempt at least that far out, even for a token already inside the
  // lead window.
  private scheduleRenewal(expiresAt: number | null, minDelayMs = 0): void {
    this.clearRenewalTimer();
    this.expiresAt = expiresAt;
    this.renewalDueAt = null;
    if (expiresAt == null) return;
    // A token with less life left than the lead is already inside the window, so go now.
    this.armRenewal(Math.max(minDelayMs, expiresAt - Date.now() - RENEWAL_LEAD_MS));
  }

  private armRenewal(delay: number): void {
    // A longer delay would fire at once and renew far too early.
    delay = Math.min(delay, MAX_TIMER_DELAY_MS);
    this.renewalDueAt = Date.now() + delay;
    this.renewalTimer = setTimeout(() => {
      void this.renewNow();
    }, delay);
  }

  // Give the host's callback a deadline. A promise that never settles is otherwise
  // indistinguishable from a host that is simply slow.
  private withGetTokenTimeout(pending: Promise<string | null>): Promise<string | null> {
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

  private async fetchHostToken(): Promise<void> {
    const getToken = readGetToken();
    if (getToken == null) {
      // The host dropped getToken (initialize() again without it). Never carry the old token on.
      this.token = null;
      return;
    }
    const generation = this.sessionGeneration;
    try {
      const token = await this.withGetTokenTimeout(Promise.resolve(getToken()));
      if (generation !== this.sessionGeneration) return;
      this.token = token;
    } catch (error) {
      if (generation !== this.sessionGeneration) return;
      this.token = null;
      this.authError.emit({ reason: 'token-callback-failed', error });
    }
  }

  // Fetch a fresh token and hand it to the app in the frame in place. Whether it bought more time
  // is judged on the app's answer (handleTokenInstalled), not on the host token.
  private renewNow = (): Promise<void> => {
    if (this.renewing != null) return this.renewing;
    const renewal = this.runRenewal().finally(() => {
      if (this.renewing === renewal) this.renewing = null;
    });
    this.renewing = renewal;
    return renewal;
  };

  private runRenewal = async (): Promise<void> => {
    // Only the token path renews: on the cookie path a pushed token would switch Forms to a
    // sessionless session. With no getToken (a cookie host, or one that dropped it) there is
    // nothing to renew and nothing went wrong, so return quietly: no retry, no authError.
    if (!this.tokenMode || readGetToken() == null) return;

    const generation = this.sessionGeneration;
    await this.fetchHostToken();
    if (generation !== this.sessionGeneration) return;
    if (this.token == null) {
      this.handleRenewalFailure();
      return;
    }

    const nextExpiry = this.decodeExpiry(this.token);
    // A renewal goes to whichever app is in the frame now.
    this.postToFrame(this.frameApp, { status: SET_TOKEN_STATUS[this.frameApp], token: this.token });
    // Arm on what we can see for now. Forms answers with the expiry of the token the session
    // actually ended up using — after an exchange that can differ — and we re-arm on that. A host
    // that caches its token can hand back one that is itself inside the lead window, so wait at
    // least a retry interval rather than renewing again at once while Forms answers.
    this.scheduleRenewal(nextExpiry, RENEWAL_RETRY_MS);
  };

  private handleRenewalFailure(): void {
    this.clearRenewalTimer();
    if (this.renewalRetryUsed) {
      // Give up until the host acts (refreshToken or clearToken): coming back to the tab must not
      // start renewing again and raise the same error each time.
      this.renewalDueAt = null;
      this.authError.emit({ reason: 'token-renewal-failed' });
      return;
    }
    // The current token still works until it really expires, so one failure is not the end.
    this.renewalRetryUsed = true;
    this.armRenewal(RENEWAL_RETRY_MS);
  }

  // Always sent to the app's exact origin: a '*' target would hand a token to whatever happened to
  // be listening.
  private postToFrame(app: FrameApp, message: unknown): void {
    this.iframe()?.contentWindow?.postMessage(message, this.originOf(app));
  }

  // Messages to and from each app use only this origin.
  private originOf(app: FrameApp): string {
    return new URL(app === 'digisign' ? Env.digisignUrl : Env.formsUrl).origin;
  }

  private handleTokenInstalled(data: FrameMessage): void {
    // A late answer after clearToken() must not restart renewal.
    if (!this.tokenMode) return;
    if (data.ok === false) {
      this.handleRenewalFailure();
      return;
    }

    // An older app may send no expiry; fall back to the best one we know.
    const installedExpiry = expToMs(data.exp) ?? this.expiresAt;

    // Inside the renewal window, an answer that leaves the session expiring at about the same time
    // renewed nothing, and re-arming on it would retry at once and spin. Treat it as a failed
    // renewal: back off, then tell the host, which is the only one that can do anything about it.
    // Outside the window (the host called refreshToken() early) the exchange hands back the same
    // cached token, so the same expiry is expected and the timer simply stays on it. An unknown
    // expiry counts as inside: there is nothing safe to wait for.
    const insideWindow = installedExpiry == null || installedExpiry - Date.now() <= RENEWAL_LEAD_MS;
    if (
      this.lastInstalledExpiry != null &&
      insideWindow &&
      (installedExpiry == null || installedExpiry - this.lastInstalledExpiry < MIN_EXPIRY_GAIN_MS)
    ) {
      this.handleRenewalFailure();
      return;
    }

    this.lastInstalledExpiry = installedExpiry;
    this.renewalRetryUsed = false;
    this.scheduleRenewal(installedExpiry);
  }

  // Background tabs throttle timers, so a widget that has been hidden for a long time can come
  // back already past its renewal point. Check on the way in rather than trusting the timer.
  private handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return;
    if (!this.tokenMode || this.renewalDueAt == null) return;
    if (Date.now() >= this.renewalDueAt) void this.renewNow();
  };

  private addUrlParams(url: string, params: Record<string, string> | string | URLSearchParams): string {
    const urlObj = new URL(url);
    const urlParams = new URLSearchParams(params);
    urlParams.forEach((value, key) => urlObj.searchParams.set(key, value));
    return urlObj.toString();
  }

  private getUrl(clearForms = false): string {
    const { widget } = window.skyslope ?? {};
    if (widget == null) return '';

    const params: Record<string, string> = {
      widgetTrack: JSON.stringify({
        widgetOrigin: window.location.origin,
        widgetSourceEvent: 'click',
        widgetSourceUrl: widget.path,
      }),
    };

    // Tells the Forms gateway which page is framing it, so it can allow this origin in
    // frame-ancestors without the third-party cookie that Safari blocks. Same value as
    // widgetTrack.widgetOrigin; the gateway checks it against the partner whitelist.
    // An opaque origin (file://, sandboxed frame) reports the string "null": nothing useful to send.
    const frameOrigin = window.location.origin;
    if (frameOrigin && frameOrigin !== 'null') params.frameOrigin = frameOrigin;

    if (widget.idp) params.idp = widget.idp;
    if (widget.headerVariant) params.headerVariant = widget.headerVariant;

    const baseUrl = `${Env.formsUrl}${widget.path}`;
    const url = this.addUrlParams(baseUrl, params);

    // Pass the token in the URL fragment (not a query param): fragments are not sent to
    // the server, and the Forms app strips it from history immediately on read.
    if (this.token != null) return `${url}#t=${encodeURIComponent(this.token)}`;
    return clearForms ? `${url}#${FORMS_CLEAR_FRAGMENT}` : url;
  }

  private iframe = () => this.el.shadowRoot?.getElementById('ss-container-iframe') as HTMLIFrameElement | null;

  private reloadIframe = () => {
    this.postToFrame('forms', 'reload');
  };

  // Point the frame at the current Forms URL. Does nothing before the frame renders or before
  // the host has set up window.skyslope, rather than loading an empty src.
  private loadFrame(clearForms = false): boolean {
    const iframe = this.iframe();
    const url = this.getUrl(clearForms);
    if (iframe == null || url === '') return false;
    // A URL that carries a token is loaded by navigating the frame's own window. The src attribute
    // stays in the host page's DOM for the whole session, where other scripts and session-replay
    // tools could read the token.
    if (this.token != null) {
      // No frame window to navigate: refuse rather than write the token into src.
      if (iframe.contentWindow == null) return false;
      iframe.contentWindow.location.replace(url);
      return true;
    }
    iframe.src = url;
    return true;
  }

  private navigateTo = async () => {
    // Only carry a token forward once the cookie-free fallback is active; refresh it first so a
    // navigation late in a session doesn't reuse a stale one. In the normal (cookie) path this
    // leaves the token null, so navigation never introduces a token.
    const generation = this.sessionGeneration;
    if (this.tokenMode) await this.fetchHostToken();
    if (generation !== this.sessionGeneration) return;
    this.loadFrame();
  };

  // Renew the session in place. Exposed to the host as widget.refreshToken() for the case
  // where its own token rotates early (an account switch, say). The normal renewal, shortly before
  // expiry, runs on our own timer and needs nothing from the host.
  private refreshToken = (): Promise<void> => this.renewNow();

  // Forget the user. Exposed to the host as widget.clearToken() for sign-out or a user switch:
  // the session Forms built from our tokens lives in the Forms tab's sessionStorage and would
  // otherwise outlast the host's own sign-out.
  private clearToken = (): Promise<void> => {
    this.clearing ??= this.runClear().finally(() => {
      this.clearing = null;
    });
    return this.clearing;
  };

  private runClear = async (): Promise<void> => {
    const generation = this.endTokenSession();
    this.adoptionBlocked = true;

    const answeredBy = await this.askFrameToClear();
    // Unmounted while waiting: there is no frame left to reload.
    if (generation !== this.sessionGeneration) return;
    // Whatever was in the frame, Forms is loaded next.
    this.frameApp = 'forms';
    if (answeredBy === 'forms') {
      // Forms dropped its session. Reload without a token. Anything still running in the old page
      // goes away with it.
      this.loadFrame();
      return;
    }
    // DigiSign answered, or nothing did (an app still loading, such as DigiSign mid hand-off). The
    // Forms session DigiSign was handed off from can still be stored in this frame and would sign
    // the old user back in. Load Forms with the fragment that makes it drop that session as it
    // starts, and wait for that load, so the host's own reload after clearToken() cannot cut it short.
    const iframe = this.iframe();
    const loaded = iframe != null ? this.waitForFrameLoad(iframe) : Promise.resolve();
    this.loadFrame(true);
    await loaded;
  };

  // Resolves when the frame finishes its next load, or after CLEAR_WAIT_MS. Never rejects.
  private waitForFrameLoad(iframe: HTMLIFrameElement): Promise<void> {
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        iframe.removeEventListener('load', done);
        resolve();
      };
      const timer = setTimeout(done, CLEAR_WAIT_MS);
      iframe.addEventListener('load', done);
    });
  }

  // Stop renewing and forget the token, so nothing sends it again. Bumping sessionGeneration makes
  // token work that is still waiting on the host stand down.
  private endTokenSession(): number {
    const generation = ++this.sessionGeneration;
    this.clearRenewalTimer();
    this.renewing = null;
    this.token = null;
    this.expiresAt = null;
    this.renewalDueAt = null;
    this.lastInstalledExpiry = null;
    this.renewalRetryUsed = false;
    this.adoptionBlocked = false;
    // Leave token mode so the next cookie wall can start the token path again, for the next user.
    this.tokenMode = false;
    return generation;
  }

  // DigiSign has no session in our frame and is waiting for a token. Only a token session gets
  // here: Forms tells DigiSign to ask only when Forms itself is signed in from our tokens, so a
  // cookie session never receives a token. Fetch one and post it to DigiSign's exact origin.
  private handleDigisignAuthRequired = async () => {
    // Not in token mode, but DigiSign asking proves Forms was on a widget token session: one Forms
    // restored after a host reload or a remount, without a cookie wall this time. Take it up.
    const adopting = !this.tokenMode;
    if (adopting && !this.adoptTokenSession()) {
      this.authError.emit({ reason: 'iframe-auth-failed' });
      return;
    }
    const generation = this.sessionGeneration;
    await this.fetchHostToken();
    if (generation !== this.sessionGeneration) return;
    // Also covers a host that dropped getToken: fetchHostToken leaves the token null.
    if (this.token == null) {
      // Nothing was sent, so a later cookie wall may start the token path again.
      if (adopting) this.tokenMode = false;
      this.authError.emit({ reason: 'iframe-auth-failed' });
      return;
    }
    // DigiSign's answer is a first sign-in, not a renewal: it reports the expiry of its session
    // token, which can match one reported before (the exchange caches one token per user). Let
    // that answer set the baseline instead of being judged as a renewal that gained nothing.
    this.lastInstalledExpiry = null;
    this.renewalRetryUsed = false;
    // To DigiSign explicitly: frameApp can change while getToken runs.
    this.postToFrame('digisign', { status: DIGISIGN_SET_TOKEN, token: this.token });
    this.scheduleRenewal(this.decodeExpiry(this.token));
  };

  // The user signed out inside Forms or DigiSign, which already dropped its session. Stop renewing
  // and hand out no more tokens (a later token ask is refused until the cookie wall starts a new
  // sign-in), and leave the frame where it is: a reload would sign the user straight back in.
  private handleSignedOut(): void {
    if (!this.tokenMode) return;
    this.endTokenSession();
    this.adoptionBlocked = true;
    this.authError.emit({ reason: 'signed-out' });
  }

  // Enter token mode for a session the frame already has, rather than one we just started. Only
  // with a getToken (browsers whose cookie sign-in works never get a token) and not right after
  // an in-frame sign-out. Returns whether token mode is now on.
  private adoptTokenSession(): boolean {
    if (readGetToken() == null || this.adoptionBlocked) return false;
    this.tokenMode = true;
    return true;
  }

  // Ask the app in the frame to clear its session and wait for its answer, or give up after a short
  // timeout. Resolves with the app that answered, or null when none did. Never rejects.
  // The ask goes to both apps, each to its exact origin, and the browser drops the one whose origin
  // does not match the page in the frame. frameApp alone is not enough: it still says Forms while
  // Forms hands the frame to DigiSign, until DigiSign's first message.
  private askFrameToClear(): Promise<FrameApp | null> {
    return new Promise(resolve => {
      const done = (app: FrameApp | null) => {
        clearTimeout(timer);
        this.resolveClearWait = null;
        resolve(app);
      };
      const timer = setTimeout(() => done(null), CLEAR_WAIT_MS);
      this.resolveClearWait = done;
      if (this.iframe()?.contentWindow == null) {
        done(null);
        return;
      }
      this.postToFrame('forms', { status: FORMS_CLEAR_TOKEN });
      this.postToFrame('digisign', { status: DIGISIGN_CLEAR_TOKEN });
    });
  }

  // Messages from the app in our frame. A message is accepted only from our own frame (another
  // window on the same origin, a second Forms tab say, must not drive this widget's auth), and only
  // from the origin of the app its status prefix names, so DigiSign cannot start the Forms fallback.
  // Going by the prefix also tells the apps apart when both share one origin (a local setup).
  private handleMessage = (event: MessageEvent) => {
    const frameWindow = this.iframe()?.contentWindow;
    if (frameWindow == null || event.source !== frameWindow) return;
    let data: FrameMessage;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (typeof data?.status !== 'string') return;
    const app: FrameApp | null = data.status.startsWith('forms-')
      ? 'forms'
      : data.status.startsWith('digisign-')
        ? 'digisign'
        : null;
    if (app == null || event.origin !== this.originOf(app)) return;
    // The other app has its own session, so its next install answer is not a renewal of the last
    // app's session. Let that answer set a fresh baseline.
    if (app !== this.frameApp) this.lastInstalledExpiry = null;
    this.frameApp = app;
    switch (data.status) {
      case FORMS_AUTH_FAILED:
        void this.handleAuthFailed();
        break;
      case FORMS_SESSION_EXPIRY:
        this.handleSessionExpiry(data);
        break;
      case FORMS_SIGNED_OUT:
      case DIGISIGN_SIGNED_OUT:
        this.handleSignedOut();
        break;
      case DIGISIGN_AUTH_REQUIRED:
        void this.handleDigisignAuthRequired();
        break;
      case DIGISIGN_AUTH_FAILED:
        this.authError.emit({ reason: 'iframe-auth-failed' });
        break;
      case FORMS_TOKEN_INSTALLED:
      case DIGISIGN_TOKEN_INSTALLED:
        this.handleTokenInstalled(data);
        break;
      case FORMS_TOKEN_CLEARED:
      case DIGISIGN_TOKEN_CLEARED:
        this.resolveClearWait?.(app);
        break;
    }
  };

  // Re-time the next renewal on the session's own expiry. Only the timer moves: this is not a
  // renewal answer, so it does not set the baseline the next renewal answer is compared against
  // (Forms sends the same expiry again after reloading inside the frame, and a renewal right after
  // sign-in may get it back too).
  // Outside token mode it is ignored, unless Forms says its session came from a widget token
  // (sessionless): then Forms restored that session after a host reload or a remount, and we take
  // it up so it keeps renewing. Older Forms, and cookie sessions, never send that flag.
  private handleSessionExpiry(data: FrameMessage): void {
    if (!this.tokenMode && (data.sessionless !== true || !this.adoptTokenSession())) return;
    const exp = expToMs(data.exp);
    if (exp != null) this.scheduleRenewal(exp);
  }

  // Forms could not sign in inside the frame (Safari's third-party-cookie wall, say). With a
  // getToken, and on the first try, switch to the token path: fetch a token and reload the frame
  // with it in the #t= fragment. With no getToken, or when the token path already failed, tell the
  // host.
  private handleAuthFailed = async () => {
    if (readGetToken() == null || this.tokenMode) {
      this.authError.emit({ reason: 'iframe-auth-failed' });
      return;
    }
    this.tokenMode = true;
    // A new sign-in: the user is past any sign-out inside the frame.
    this.adoptionBlocked = false;
    const generation = this.sessionGeneration;
    await this.fetchHostToken();
    if (generation !== this.sessionGeneration) return;
    if (this.token == null) {
      // No token was injected, so a later wall (after a reload) may try again.
      this.tokenMode = false;
      this.authError.emit({ reason: 'iframe-auth-failed' });
      return;
    }
    if (!this.loadFrame()) {
      // The host's widget setup went away while getToken ran, so the token never reached the frame.
      // Drop it and leave token mode, so a later wall can start the token path again.
      this.endTokenSession();
      return;
    }
    // From here the session lives on a token with a finite life, so start watching it.
    this.scheduleRenewal(this.decodeExpiry(this.token));
  };

  connectedCallback() {
    const { widget } = window.skyslope ?? {};
    widget?.registerReload(this.reloadIframe);
    widget?.registerNavigateTo(this.navigateTo);
    widget?.registerRefresh(this.refreshToken);
    widget?.registerClearToken(this.clearToken);
    window.addEventListener('message', this.handleMessage);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.handleMessage);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    // Stops renewals, and token work still waiting on the host.
    this.endTokenSession();
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
