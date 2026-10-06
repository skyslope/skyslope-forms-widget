// Import the testing entry so the mock `window` global is installed.
import '@stencil/core/testing';
import { Env } from '@stencil/core';
import { SsContainerInline } from '../ss-container-inline';
import { SkySlopeWidget } from '../../../globalScript';

// The real `stencil test` injects env from stencil.config (dev formsUrl = http://localhost:3001/).
// Set it here too so getUrl() / the message handlers have a formsUrl when the spec is executed
// directly through jest; leaves any value already injected untouched.
Env.formsUrl = Env.formsUrl ?? 'http://localhost:3001/';
// Run locally with: npx jest ss-container-inline.spec --preset @stencil/core/testing --testRunner jest-jasmine2
// (the default `stencil test` runner spawns puppeteer, which is blocked in this environment).

// The component reads window.skyslope at render time and its getToken callback while resolving
// the token. newSpecPage() resets custom window props on setup, so we drive the component
// instance directly: set the global, invoke the method under test, then assert on the URL it
// builds, the iframe src it sets, and the events it emits.
//
// Narrow-to-Safari contract: the iframe loads WITHOUT a token (so browsers whose cookie auth
// works are untouched). A token is fetched and injected only when the Forms app reports an
// in-iframe auth failure (forms-auth-failed) and a getToken callback exists.
type GetToken = () => string | null | Promise<string | null>;

// getToken is NOT a property of the widget instance - initialize() stores it in module scope
// so embedding pages have no standardized global to call. Drive it through the real
// initialize() rather than hand-stubbing, so these tests exercise the actual wiring.
function stubWidget(getToken: GetToken | null = null) {
  const widget = new SkySlopeWidget();
  widget.initialize({ getToken });
  (window as any).skyslope = { widget };
}

// Build a decode-only JWT with a given lifetime. Nothing verifies the signature on the paths
// under test - the widget only reads `exp` to decide when to ask for the next token.
function jwtExpiringIn(seconds: number, marker = 'tok'): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds, marker })).toString('base64');
  return `header.${payload}.signature`;
}

function makeComponent(getToken: GetToken | null): {
  component: any;
  emitted: Array<{ reason: string; error?: unknown }>;
  iframeEl: { src: string };
} {
  stubWidget(getToken);
  const component = new SsContainerInline() as any;
  const emitted: Array<{ reason: string; error?: unknown }> = [];
  component.authError = { emit: (detail: any) => emitted.push(detail) };
  // Stand in for the shadow-root iframe (el is a read-only @Element in a real render).
  const iframeEl = { src: '' };
  component.iframe = () => iframeEl;
  return { component, emitted, iframeEl };
}

describe('ss-container-inline narrow-to-Safari token fallback', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  it('loads WITHOUT a token fragment even when getToken is provided (cookie path is unaffected)', () => {
    const { component } = makeComponent(() => 'jwt.abc.def');
    const url = component.getUrl();
    expect(url).toContain('widgetTrack=');
    expect(url).not.toContain('#t=');
    expect(component.token).toBeNull();
  });

  it('loads without a token fragment when no getToken is provided', () => {
    const { component } = makeComponent(null);
    expect(component.getUrl()).not.toContain('#t=');
  });

  it('on forms-auth-failed with a getToken, reloads the iframe with the token in a trailing #t= fragment and raises no authError', async () => {
    const { component, emitted, iframeEl } = makeComponent(() => 'jwt.abc.def');
    await component.handleAuthFailed();
    expect(component.token).toBe('jwt.abc.def');
    expect(iframeEl.src).toContain('#t=jwt.abc.def');
    // Fragment comes after the query so the Forms app reads the token at load.
    expect(iframeEl.src.indexOf('#t=')).toBeGreaterThan(iframeEl.src.indexOf('widgetTrack='));
    // Token is a fragment, never a query param (fragments aren't sent to the server).
    expect(iframeEl.src).not.toMatch(/[?&]t=/);
    expect(emitted).toEqual([]);
  });

  it('awaits an async getToken in the fallback', async () => {
    const { component, iframeEl } = makeComponent(async () => 'async-token');
    await component.handleAuthFailed();
    expect(iframeEl.src).toContain('#t=async-token');
  });

  it('on forms-auth-failed with no getToken, raises authError(iframe-auth-failed) and injects no token', async () => {
    const { component, emitted, iframeEl } = makeComponent(null);
    await component.handleAuthFailed();
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
    expect(iframeEl.src).toBe('');
  });

  it('on forms-auth-failed when getToken resolves null, raises authError(iframe-auth-failed) and injects no token', async () => {
    const { component, emitted, iframeEl } = makeComponent(() => null);
    await component.handleAuthFailed();
    expect(component.token).toBeNull();
    expect(iframeEl.src).toBe('');
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('on forms-auth-failed when getToken throws, emits token-callback-failed then iframe-auth-failed and injects no token', async () => {
    const boom = new Error('mint failed');
    const { component, emitted, iframeEl } = makeComponent(() => {
      throw boom;
    });
    await component.handleAuthFailed();
    expect(iframeEl.src).toBe('');
    expect(emitted).toEqual([{ reason: 'token-callback-failed', error: boom }, { reason: 'iframe-auth-failed' }]);
  });

  it('does not loop: a second forms-auth-failed after the token fallback raises authError instead of reloading again', async () => {
    let calls = 0;
    const { component, emitted, iframeEl } = makeComponent(() => `token-${++calls}`);
    await component.handleAuthFailed();
    expect(iframeEl.src).toContain('#t=token-1');

    iframeEl.src = 'SENTINEL';
    await component.handleAuthFailed();
    expect(iframeEl.src).toBe('SENTINEL'); // not reloaded a second time
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
    expect(calls).toBe(1); // getToken not called again
  });
});

describe('ss-container-inline navigation token handling', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  it('does not carry a token on navigation in the normal (cookie) path', async () => {
    let calls = 0;
    const { component, iframeEl } = makeComponent(() => `token-${++calls}`);
    await component.navigateTo();
    expect(iframeEl.src).not.toContain('#t=');
    expect(calls).toBe(0); // getToken not invoked outside the token fallback
  });

  it('carries a fresh token on navigation once the token fallback is active', async () => {
    let calls = 0;
    const { component, iframeEl } = makeComponent(() => `token-${++calls}`);
    await component.handleAuthFailed(); // enters token mode, injects token-1
    expect(iframeEl.src).toContain('#t=token-1');
    await component.navigateTo();
    expect(iframeEl.src).toContain('#t=token-2');
  });
});

describe('ss-container-inline refreshToken (host-initiated renewal)', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  it('posts a fresh token to the Forms origin instead of the URL', async () => {
    let calls = 0;
    const { component } = makeComponent(() => `token-${++calls}`);
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage }, src: '' });
    await component.handleAuthFailed(); // on the token path, with token-1 in the URL

    await component.refreshToken();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { status: 'set-token', token: 'token-2' },
      'http://localhost:3001' // Env.formsUrl origin in spec
    );
  });

  // A host that configured getToken but whose user signed in with cookies (Chrome, say) never
  // left the cookie path. Pushing a token there would switch Forms to a sessionless session.
  it('sends nothing on the cookie path, even with a getToken configured', async () => {
    const getToken = jest.fn(() => 'token');
    const { component } = makeComponent(getToken);
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage }, src: '' });

    await component.refreshToken();

    expect(getToken).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('URL-encodes the token it puts in the #t= fragment', async () => {
    const { component, iframeEl } = makeComponent(() => 'a+b/c=d&e');
    await component.handleAuthFailed();
    expect(iframeEl.src.endsWith('#t=a%2Bb%2Fc%3Dd%26e')).toBe(true);
  });

  // A cookie-based host has no getToken. If it calls refreshToken() anyway - and the native
  // web view is the same shape - the call must do nothing at all. Asserting only "did not
  // post" is not enough: an earlier version of this silently armed a retry timer and then
  // raised token-renewal-failed at a host that had never opted into the token path.
  it('is a silent no-op when the host configured no getToken', async () => {
    const { component, emitted } = makeComponent(null);
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage } });

    await component.refreshToken();
    await component.refreshToken();

    expect(postMessage).not.toHaveBeenCalled();
    expect(component.renewalTimer).toBeNull();
    expect(emitted).toEqual([]);
  });
});

describe('ss-container-inline message handling / origin trust', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  function messageEvent(origin: string, data: unknown): MessageEvent {
    return { origin, data } as MessageEvent;
  }

  it('routes a forms-auth-failed message from the Forms origin to the auth-failed handler (no getToken -> authError)', () => {
    const { component, emitted } = makeComponent(null);
    // Env.formsUrl in spec is http://localhost:3001/. With no getToken the handler emits
    // synchronously (no await before the emit), so this asserts without awaiting.
    component.handleMessage(messageEvent('http://localhost:3001', JSON.stringify({ status: 'forms-auth-failed' })));
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('accepts an already-parsed message object', () => {
    const { component, emitted } = makeComponent(null);
    component.handleMessage(messageEvent('http://localhost:3001', { status: 'forms-auth-failed' }));
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('ignores messages from a different origin', () => {
    const { component, emitted } = makeComponent(() => 'jwt');
    component.handleMessage(messageEvent('https://evil.example.com', JSON.stringify({ status: 'forms-auth-failed' })));
    expect(emitted).toEqual([]);
  });

  it('ignores unrelated and malformed payloads from the Forms origin', () => {
    const { component, emitted } = makeComponent(null);
    component.handleMessage(messageEvent('http://localhost:3001', JSON.stringify({ status: 'forms-user-ready' })));
    component.handleMessage(messageEvent('http://localhost:3001', 'not-json{'));
    expect(emitted).toEqual([]);
  });
});

// The renewal timer lives in the host page, which is why it survives Forms navigating away.
// These tests assert the SCHEDULE rather than advancing wall-clock time: what matters is when
// we decide to ask for the next token, and that a bad answer never re-arms a tight loop.
describe('ss-container-inline renewal scheduling', () => {
  // resolveToken also arms a timer (the getToken deadline), so a flat list of delays cannot
  // tell us which one is the renewal. Hand out an id per call and look up the one the
  // component actually kept as its renewal timer.
  let timers: Array<{ id: number; ms: number }>;
  let realSetTimeout: typeof setTimeout;
  let nextId: number;

  beforeEach(() => {
    timers = [];
    nextId = 1;
    realSetTimeout = global.setTimeout;
    (global as any).setTimeout = (_fn: any, ms?: number) => {
      const id = nextId++;
      timers.push({ id, ms: ms ?? 0 });
      return id;
    };
  });

  afterEach(() => {
    (global as any).setTimeout = realSetTimeout;
    delete (window as any).skyslope;
  });

  // The delay the component is actually waiting on before it next asks for a token.
  function renewalDelay(component: any): number | null {
    if (component.renewalTimer == null) return null;
    const timer = timers.find(t => t.id === component.renewalTimer);
    return timer != null ? timer.ms : null;
  }

  // exp is minted in whole seconds and read back a few ms later, so compare with tolerance.
  function expectDelayNear(actual: number | null, expected: number) {
    expect(actual).not.toBeNull();
    expect(Math.abs((actual as number) - expected)).toBeLessThan(2000);
  }

  function withIframe(component: any) {
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage }, src: '' });
    return postMessage;
  }

  it('arms the renewal to land inside the exchange cache window, not early', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    // The exchange serves one cached token per user until a TTL sweep drops it five minutes
    // before expiry, so renewing early returns the SAME token and buys nothing. Three minutes
    // out clears the sweep and still leaves runway. An hour-long token waits 57 minutes.
    expectDelayNear(renewalDelay(component), 3600_000 - 3 * 60_000);
  });

  it('uses the same lead regardless of how long the token lives', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(1200));
    withIframe(component);
    await component.handleAuthFailed();
    expectDelayNear(renewalDelay(component), 1200_000 - 3 * 60_000);
  });

  it('renews immediately when the token is already inside the lead window', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(60));
    withIframe(component);
    await component.handleAuthFailed();
    expect(renewalDelay(component)).toBe(0);
  });

  it('arms no renewal at all for a token whose exp cannot be decoded', async () => {
    const { component } = makeComponent(() => 'not.a.jwt');
    withIframe(component);
    await component.handleAuthFailed();
    expect(component.renewalTimer).toBeNull();
  });

  it('renews by posting set-token to the Forms origin, never by reloading', async () => {
    let call = 0;
    const { component, iframeEl } = makeComponent(() => (++call === 1 ? jwtExpiringIn(3600, 'first') : jwtExpiringIn(7200, 'second')));
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    const srcAfterBootstrap = iframeEl.src;

    await component.renewNow();

    expect(postMessage).toHaveBeenCalledTimes(1);
    const [payload, targetOrigin] = postMessage.mock.calls[0];
    expect(payload.status).toBe('set-token');
    expect(payload.token).toBe(component.token);
    // The replacement really is a different token, not the bootstrap one re-sent.
    expect(payload.token).not.toBe(srcAfterBootstrap.split('#t=')[1]);
    // The token must go to the exact Forms origin. A '*' target would hand it to any listener.
    expect(targetOrigin).toBe('http://localhost:3001');
    // Renewal is in place: the iframe URL is untouched, so form state survives.
    expect(iframeEl.src).toBe(srcAfterBootstrap);
  });

  it('re-arms on the expiry Forms reports, not the one the host token carried', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    // After the exchange the session can be running on a token with a different lifetime;
    // the ack carries the one that actually matters.
    const sessionExp = Math.floor(Date.now() / 1000) + 1200;

    component.handleTokenInstalled({ ok: true, exp: sessionExp });

    expectDelayNear(renewalDelay(component), 1200_000 - 3 * 60_000);
  });

  it('treats a host that hands back a no-later token as a failed renewal', async () => {
    // Same lifetime every call: a cached, near-dead token.
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    postMessage.mockClear();

    await component.renewNow();

    expect(postMessage).not.toHaveBeenCalled(); // never pushed to Forms
    expect(renewalDelay(component)).toBe(30_000); // backed off to a retry, not re-armed tight
  });

  it('treats an install that does not move the session expiry as a failed renewal', async () => {
    // The token exchange hands back the same internal token for a user for its whole life, so a
    // renewal can report success while buying no extra time. Re-arming on that expiry would
    // schedule the next attempt at zero delay and spin.
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    emitted.length = 0;

    // First ack establishes what the SESSION expires at - nothing to compare against yet.
    const sessionExp = Math.floor(Date.now() / 1000) + 1800;
    component.handleTokenInstalled({ ok: true, exp: sessionExp });
    expect(emitted).toEqual([]);

    timers.length = 0;
    // A renewal that reports the SAME session expiry bought no time.
    component.handleTokenInstalled({ ok: true, exp: sessionExp });

    expect(renewalDelay(component)).toBe(30_000); // backed off, NOT re-armed at zero
    expect(emitted).toEqual([]); // first failure stays quiet; the old token still works

    component.handleTokenInstalled({ ok: true, exp: sessionExp });
    expect(emitted).toEqual([{ reason: 'token-renewal-failed' }]);
  });

  it('reports to the host only after a renewal fails twice', async () => {
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    emitted.length = 0;

    component.handleTokenInstalled({ ok: false });
    expect(emitted).toEqual([]); // the current token still works; retry first

    component.handleTokenInstalled({ ok: false });
    expect(emitted).toEqual([{ reason: 'token-renewal-failed' }]);
  });

  it('clears a pending renewal when the container goes away', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    expect(component.renewalTimer).not.toBeNull();

    component.disconnectedCallback();

    expect(component.renewalTimer).toBeNull();
  });
});

describe('ss-container-inline clearToken (host sign-out or user switch)', () => {
  const formsOrigin = () => new URL(Env.formsUrl).origin;
  let realSetTimeout: typeof setTimeout;
  let pendingTimers: Array<{ fn: () => void; ms: number }>;

  beforeEach(() => {
    pendingTimers = [];
    realSetTimeout = global.setTimeout;
    // Hold timers so a test decides whether Forms answers before the clear times out.
    (global as any).setTimeout = (fn: () => void, ms?: number) => {
      pendingTimers.push({ fn, ms: ms ?? 0 });
      return pendingTimers.length;
    };
  });

  afterEach(() => {
    (global as any).setTimeout = realSetTimeout;
    delete (window as any).skyslope;
  });

  // A component already on the token path, with a frame that records what we post to it.
  async function onTokenPath() {
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    const postMessage = jest.fn();
    const iframeEl: any = { src: '', contentWindow: { postMessage } };
    component.iframe = () => iframeEl;
    await component.handleAuthFailed();
    expect(iframeEl.src).toContain('#t=');
    postMessage.mockClear();
    return { component, emitted, iframeEl, postMessage };
  }

  const tokenCleared = (component: any, origin = formsOrigin(), source = component.iframe()?.contentWindow) =>
    component.handleMessage({ origin, source, data: { status: 'token-cleared' } } as MessageEvent);

  it('posts clear-token to the exact Forms origin, then reloads the frame without a token once Forms confirms', async () => {
    const { component, iframeEl, postMessage } = await onTokenPath();

    const clearing = component.clearToken();
    expect(postMessage).toHaveBeenCalledWith({ status: 'clear-token' }, formsOrigin());
    expect(iframeEl.src).toContain('#t='); // not reloaded before Forms answers
    tokenCleared(component);
    await clearing;

    expect(iframeEl.src).not.toContain('#t=');
    expect(iframeEl.src.startsWith(Env.formsUrl)).toBe(true);
  });

  it('reloads anyway after the timeout when Forms never answers (an older Forms)', async () => {
    const { component, iframeEl } = await onTokenPath();

    const clearing = component.clearToken();
    const ackTimer = pendingTimers.find(t => t.ms === 3000);
    expect(ackTimer).toBeDefined();
    ackTimer.fn();
    await clearing;

    expect(iframeEl.src).not.toContain('#t=');
  });

  it('ignores a token-cleared message from another origin', async () => {
    const { component, iframeEl } = await onTokenPath();

    const clearing = component.clearToken();
    tokenCleared(component, 'https://evil.example');
    await Promise.resolve();
    expect(iframeEl.src).toContain('#t='); // still waiting

    tokenCleared(component);
    await clearing;
    expect(iframeEl.src).not.toContain('#t=');
  });

  it('stops renewing and leaves token mode, so the next cookie wall starts the token path for the next user', async () => {
    const { component, emitted, iframeEl } = await onTokenPath();
    expect(component.renewalTimer).not.toBeNull();

    const clearing = component.clearToken();
    tokenCleared(component);
    await clearing;

    expect(component.renewalTimer).toBeNull();
    expect(component.token).toBeNull();
    expect(component.tokenMode).toBe(false);
    // A second wall is a fresh start, not the "already tried" loop guard.
    await component.handleAuthFailed();
    expect(iframeEl.src).toContain('#t=');
    expect(emitted).toEqual([]);
  });

  // A getToken the test settles by hand, to hold a token fetch open across a clearToken().
  function deferredGetToken() {
    let settle: (token: string | null) => void = () => {};
    const getToken = jest.fn(() => new Promise<string | null>((resolve) => (settle = resolve)));
    return { getToken, settle: (token: string | null) => settle(token) };
  }

  async function clearWithAck(component: any) {
    const clearing = component.clearToken();
    tokenCleared(component);
    await clearing;
  }

  it('drops a renewal whose getToken was still running when the host signed out', async () => {
    const { component, iframeEl, postMessage } = await onTokenPath();
    const pending = deferredGetToken();
    stubWidget(pending.getToken);

    const renewing = component.renewNow(true);
    await clearWithAck(component);
    postMessage.mockClear();
    pending.settle(jwtExpiringIn(3600, 'previous-user'));
    await renewing;

    expect(postMessage).not.toHaveBeenCalled(); // no set-token after the sign-out
    expect(component.token).toBeNull();
    expect(component.renewalTimer).toBeNull();
    expect(iframeEl.src).not.toContain('#t=');
  });

  it('drops a fallback reload whose getToken was still running when the host signed out', async () => {
    const pending = deferredGetToken();
    const { component, emitted, iframeEl } = makeComponent(pending.getToken);
    const postMessage = jest.fn();
    (iframeEl as any).contentWindow = { postMessage };

    const falling = component.handleAuthFailed();
    await clearWithAck(component);
    pending.settle(jwtExpiringIn(3600, 'previous-user'));
    await falling;

    expect(iframeEl.src).not.toContain('#t=');
    expect(component.token).toBeNull();
    expect(emitted).toEqual([]); // the host signed out on purpose: no auth error for it
  });

  it('raises no auth error when a getToken that was running fails after the sign-out', async () => {
    let fail: (error: Error) => void = () => {};
    const getToken = () => new Promise<string | null>((_resolve, reject) => (fail = reject));
    const { component, emitted, iframeEl } = makeComponent(getToken);
    (iframeEl as any).contentWindow = { postMessage: jest.fn() };

    const falling = component.handleAuthFailed();
    await clearWithAck(component);
    fail(new Error('host session ended'));
    await falling;

    expect(emitted).toEqual([]);
  });

  it('does not reload again for a navigation whose getToken was still running at the sign-out', async () => {
    const { component, iframeEl } = await onTokenPath();
    const pending = deferredGetToken();
    stubWidget(pending.getToken);
    let loads = 0;
    let src = iframeEl.src;
    Object.defineProperty(iframeEl, 'src', {
      get: () => src,
      set: (value: string) => {
        loads += 1;
        src = value;
      },
    });

    const navigating = component.navigateTo();
    await clearWithAck(component);
    expect(loads).toBe(1); // clearToken's own reload
    pending.settle(jwtExpiringIn(3600, 'previous-user'));
    await navigating;

    expect(loads).toBe(1);
    expect(iframeEl.src).not.toContain('#t=');
  });

  it('ignores a token-installed that arrives after the clear', async () => {
    const { component } = await onTokenPath();
    await clearWithAck(component);

    component.handleMessage({
      origin: formsOrigin(),
      source: component.iframe()?.contentWindow,
      data: { status: 'token-installed', ok: true, exp: Math.floor(Date.now() / 1000) + 3600 },
    } as MessageEvent);

    expect(component.renewalTimer).toBeNull();
  });

  it('tries the fallback again after a getToken that returned nothing', async () => {
    let next: string | null = null;
    const { component, emitted, iframeEl } = makeComponent(() => next);

    await component.handleAuthFailed(); // host had no token yet
    expect(emitted.map((e) => e.reason)).toEqual(['iframe-auth-failed']);
    expect(component.tokenMode).toBe(false);

    next = jwtExpiringIn(3600);
    await component.handleAuthFailed(); // the next wall, after a reload
    expect(iframeEl.src).toContain('#t=');
  });

  it('ignores a token-cleared from another window on the Forms origin', async () => {
    const { component, iframeEl } = await onTokenPath();

    const clearing = component.clearToken();
    tokenCleared(component, formsOrigin(), { postMessage: jest.fn() }); // e.g. a second Forms tab
    await Promise.resolve();
    expect(iframeEl.src).toContain('#t='); // still waiting on our own frame

    tokenCleared(component);
    await clearing;
    expect(iframeEl.src).not.toContain('#t=');
  });

  it('joins a clear already in progress instead of starting a second one', async () => {
    const { component, postMessage } = await onTokenPath();

    const first = component.clearToken();
    const second = component.clearToken();
    expect(second).toBe(first);
    expect(postMessage).toHaveBeenCalledTimes(1);

    tokenCleared(component);
    await Promise.all([first, second]);
    expect(pendingTimers.filter((t) => t.ms === 3000)).toHaveLength(1);
  });

  it('is a no-op for the global API until an inline container registers', async () => {
    const widget = new SkySlopeWidget();
    await expect(widget.clearToken()).resolves.toBeUndefined();
  });

  it('routes the global widget.clearToken() to the registered container', async () => {
    const widget = new SkySlopeWidget();
    const clear = jest.fn().mockResolvedValue(undefined);
    widget.registerClearToken(clear);
    await widget.clearToken();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
