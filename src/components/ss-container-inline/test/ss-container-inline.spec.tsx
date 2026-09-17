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
    component.iframe = () => ({ contentWindow: { postMessage } });

    await component.refreshToken();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { status: 'set-token', token: 'token-1' },
      'http://localhost:3001' // Env.formsUrl origin in spec
    );
  });

  it('does not post when no token is available', async () => {
    const { component } = makeComponent(null);
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage } });

    await component.refreshToken();

    expect(postMessage).not.toHaveBeenCalled();
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

  it('arms a renewal once the token path is entered, capped at 80% of a long token life', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    // 1h token: the 5-minute lead would mean waiting 55 min (92% of its life), so the 80% cap
    // binds instead and absorbs clock skew between the user's machine and the issuer.
    expectDelayNear(renewalDelay(component), 3600_000 * 0.8);
  });

  it('uses the 5-minute lead when that is sooner than the 80% cap', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(1200));
    withIframe(component);
    await component.handleAuthFailed();
    // 20m token: lead => 15 min, cap => 16 min. The lead is sooner.
    expectDelayNear(renewalDelay(component), 1200_000 - 5 * 60_000);
  });

  it('renews immediately when the token is already inside the lead window', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(120));
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

    expectDelayNear(renewalDelay(component), 1200_000 - 5 * 60_000);
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
