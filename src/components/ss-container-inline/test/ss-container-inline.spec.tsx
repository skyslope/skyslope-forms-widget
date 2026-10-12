// Import the testing entry so the mock `window` global is installed.
import '@stencil/core/testing';
import { Env } from '@stencil/core';
import { SsContainerInline } from '../ss-container-inline';
import reinitializeGlobalScript, { SkySlopeWidget, readGetToken } from '../../../globalScript';

// The real `stencil test` injects env from stencil.config (dev formsUrl = http://localhost:3001/).
// Set it here too so getUrl() / the message handlers have a formsUrl when the spec is executed
// directly through jest; leaves any value already injected untouched.
Env.formsUrl = Env.formsUrl ?? 'http://localhost:3001/';
Env.digisignUrl = Env.digisignUrl ?? 'http://localhost:3000/';
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
  iframeEl: { src: string; navigatedTo?: string; contentWindow: any };
} {
  stubWidget(getToken);
  const component = new SsContainerInline() as any;
  const emitted: Array<{ reason: string; error?: unknown }> = [];
  component.authError = { emit: (detail: any) => emitted.push(detail) };
  // Stand in for the shadow-root iframe (el is a read-only @Element in a real render).
  // Cookie loads set src. Token loads navigate the frame's window instead, recorded in navigatedTo.
  const iframeEl: { src: string; navigatedTo?: string; contentWindow: any } = { src: '', contentWindow: null };
  iframeEl.contentWindow = { postMessage: jest.fn(), location: { replace: (url: string) => (iframeEl.navigatedTo = url) } };
  component.iframe = () => iframeEl;
  return { component, emitted, iframeEl };
}

// Let a few rounds of promise callbacks run, so async handlers reach their next await.
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
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
    const loaded = iframeEl.navigatedTo ?? '';
    expect(loaded).toContain('#t=jwt.abc.def');
    // Fragment comes after the query so the Forms app reads the token at load.
    expect(loaded.indexOf('#t=')).toBeGreaterThan(loaded.indexOf('widgetTrack='));
    // Token is a fragment, never a query param (fragments aren't sent to the server).
    expect(loaded).not.toMatch(/[?&]t=/);
    // Loaded through the frame's window, so the token never lands in the src attribute.
    expect(iframeEl.src).toBe('');
    expect(emitted).toEqual([]);
  });

  it('awaits an async getToken in the fallback', async () => {
    const { component, iframeEl } = makeComponent(async () => 'async-token');
    await component.handleAuthFailed();
    expect(iframeEl.navigatedTo).toContain('#t=async-token');
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
    expect(iframeEl.navigatedTo).toContain('#t=token-1');

    iframeEl.navigatedTo = 'SENTINEL';
    await component.handleAuthFailed();
    expect(iframeEl.navigatedTo).toBe('SENTINEL'); // not reloaded a second time
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
    expect(calls).toBe(1); // getToken not called again
  });
});

describe('ss-container-inline navigation token handling', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  it('drops the token on navigation when the host has since removed getToken', async () => {
    const { component, iframeEl } = makeComponent(() => 'token-1');
    await component.handleAuthFailed();
    expect(iframeEl.navigatedTo).toContain('#t=token-1');

    stubWidget(null); // the host calls initialize() again, without getToken
    await component.navigateTo();

    expect(component.token).toBeNull();
    expect(iframeEl.src).not.toContain('#t=');
    expect(iframeEl.src.startsWith(Env.formsUrl)).toBe(true); // reloaded without a token
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
    expect(iframeEl.navigatedTo).toContain('#t=token-1');
    await component.navigateTo();
    expect(iframeEl.navigatedTo).toContain('#t=token-2');
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
    component.iframe = () => ({ contentWindow: { postMessage, location: { replace: jest.fn() } }, src: '' });
    await component.handleAuthFailed(); // on the token path, with token-1 in the URL

    await component.refreshToken();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { status: 'forms-set-token', token: 'token-2' },
      'http://localhost:3001' // Env.formsUrl origin in spec
    );
  });

  // A host that configured getToken but whose user signed in with cookies (Chrome, say) never
  // left the cookie path. Pushing a token there would switch Forms to a sessionless session.
  it('sends nothing on the cookie path, even with a getToken configured', async () => {
    const getToken = jest.fn(() => 'token');
    const { component } = makeComponent(getToken);
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage, location: { replace: jest.fn() } }, src: '' });

    await component.refreshToken();

    expect(getToken).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('URL-encodes the token it puts in the #t= fragment', async () => {
    const { component, iframeEl } = makeComponent(() => 'a+b/c=d&e');
    await component.handleAuthFailed();
    expect(iframeEl.navigatedTo?.endsWith('#t=a%2Bb%2Fc%3Dd%26e')).toBe(true);
  });

  // A cookie-based host has no getToken. If it calls refreshToken() anyway - and the native
  // web view is the same shape - the call must do nothing at all. Asserting only "did not
  // post" is not enough: an earlier version of this silently armed a retry timer and then
  // raised token-renewal-failed at a host that had never opted into the token path.
  it('is a silent no-op when the host configured no getToken', async () => {
    const { component, emitted } = makeComponent(null);
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage, location: { replace: jest.fn() } } });

    await component.refreshToken();
    await component.refreshToken();

    expect(postMessage).not.toHaveBeenCalled();
    expect(component.renewalTimer).toBeNull();
    expect(emitted).toEqual([]);
  });

  // Same rule mid-session: a host that calls initialize() again without getToken has opted out.
  it('is a silent no-op in token mode once the host has dropped getToken', async () => {
    const { component, emitted } = makeComponent(() => 'token-1');
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage, location: { replace: jest.fn() } }, src: '' });
    await component.handleAuthFailed();
    stubWidget(null);

    await component.refreshToken();

    expect(postMessage).not.toHaveBeenCalled();
    expect(component.renewalRetryUsed).toBe(false);
    expect(emitted).toEqual([]);
  });

  it('treats a getToken that returns undefined as no token', async () => {
    const { component, emitted, iframeEl } = makeComponent(() => undefined as any);
    await component.handleAuthFailed();
    expect(component.token).toBeNull();
    expect(iframeEl.navigatedTo).toBeUndefined();
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });
});

describe('ss-container-inline reload', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  it('does nothing if the host navigates before the iframe has rendered', async () => {
    const { component } = makeComponent(null);
    component.iframe = () => null;
    await expect(component.navigateTo()).resolves.toBeUndefined();
  });

  it('does nothing if the host calls reload() before the iframe has rendered', () => {
    const { component } = makeComponent(null);
    component.iframe = () => null;
    expect(() => component.reloadIframe()).not.toThrow();
  });

  it('leaves the frame alone if the host navigates before setting up window.skyslope', async () => {
    const { component, iframeEl } = makeComponent(null);
    iframeEl.src = 'http://localhost:3001/current';
    delete (window as any).skyslope;
    await component.navigateTo();
    expect(iframeEl.src).toBe('http://localhost:3001/current');
  });

  it('posts reload to the Forms origin', () => {
    const { component } = makeComponent(null);
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage, location: { replace: jest.fn() } } });
    component.reloadIframe();
    expect(postMessage).toHaveBeenCalledWith('reload', 'http://localhost:3001');
  });
});

describe('ss-container-inline message handling / origin trust', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  // The Forms frame window the component posts to and accepts messages from.
  const frameWindow = { postMessage: jest.fn() };

  function withFrame(component: any) {
    component.iframe = () => ({ src: '', contentWindow: frameWindow });
    return component;
  }

  function messageEvent(origin: string, data: unknown, source: unknown = frameWindow): MessageEvent {
    return { origin, data, source } as MessageEvent;
  }

  it('ignores messages before the iframe exists, even from the Forms origin', () => {
    const { component, emitted } = makeComponent(null);
    component.iframe = () => null;
    component.handleMessage(messageEvent('http://localhost:3001', { status: 'forms-auth-failed' }));
    expect(emitted).toEqual([]);
  });

  it('ignores messages from another window on the Forms origin', () => {
    const { component, emitted } = makeComponent(null);
    withFrame(component);
    component.handleMessage(messageEvent('http://localhost:3001', { status: 'forms-auth-failed' }, { postMessage: jest.fn() }));
    expect(emitted).toEqual([]);
  });

  it('routes a forms-auth-failed message from the Forms origin to the auth-failed handler (no getToken -> authError)', () => {
    const { component, emitted } = makeComponent(null);
    withFrame(component);
    // Env.formsUrl in spec is http://localhost:3001/. With no getToken the handler emits
    // synchronously (no await before the emit), so this asserts without awaiting.
    component.handleMessage(messageEvent('http://localhost:3001', JSON.stringify({ status: 'forms-auth-failed' })));
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('accepts an already-parsed message object', () => {
    const { component, emitted } = makeComponent(null);
    withFrame(component);
    component.handleMessage(messageEvent('http://localhost:3001', { status: 'forms-auth-failed' }));
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('ignores messages from a different origin', () => {
    const { component, emitted } = makeComponent(() => 'jwt');
    withFrame(component);
    component.handleMessage(messageEvent('https://evil.example.com', JSON.stringify({ status: 'forms-auth-failed' })));
    expect(emitted).toEqual([]);
  });

  it('ignores unrelated and malformed payloads from the Forms origin', () => {
    const { component, emitted } = makeComponent(null);
    withFrame(component);
    component.handleMessage(messageEvent('http://localhost:3001', JSON.stringify({ status: 'forms-user-ready' })));
    component.handleMessage(messageEvent('http://localhost:3001', 'not-json{'));
    expect(emitted).toEqual([]);
  });

  it('ignores a payload with a non-string status, or no payload at all, without throwing', () => {
    const { component, emitted } = makeComponent(null);
    withFrame(component);
    expect(() => {
      component.handleMessage(messageEvent('http://localhost:3001', { status: 42 }));
      component.handleMessage(messageEvent('http://localhost:3001', JSON.stringify({ status: { startsWith: 'x' } })));
      component.handleMessage(messageEvent('http://localhost:3001', 'null'));
      component.handleMessage(messageEvent('http://localhost:3001', null));
    }).not.toThrow();
    expect(emitted).toEqual([]);
  });

  // A local setup can serve both apps from one origin. The status prefix then decides which app
  // spoke, so DigiSign's messages still count as DigiSign's.
  it('tells the apps apart by status when both share an origin', () => {
    const realDigisignUrl = Env.digisignUrl;
    Env.digisignUrl = Env.formsUrl;
    try {
      const { component, emitted } = makeComponent(null);
      withFrame(component);
      component.handleMessage(messageEvent('http://localhost:3001', { status: 'digisign-auth-failed' }));
      expect(component.frameApp).toBe('digisign');
      expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
      component.handleMessage(messageEvent('http://localhost:3001', { status: 'forms-session-expiry', exp: 1 }));
      expect(component.frameApp).toBe('forms');
    } finally {
      Env.digisignUrl = realDigisignUrl;
    }
  });

  it('ignores a Forms status sent from the DigiSign origin', () => {
    // No getToken, so an accepted forms-auth-failed would raise iframe-auth-failed.
    const { component, emitted } = makeComponent(null);
    withFrame(component);
    component.handleMessage(messageEvent('http://localhost:3000', { status: 'forms-auth-failed' }));
    expect(emitted).toEqual([]);
  });

  // Renewals and clears go to the app that last spoke. A message we reject must not move that,
  // or a token meant for DigiSign would be sent to the Forms origin (or the other way round).
  it('does not let a rejected message change which app is in the frame', () => {
    const { component, emitted } = makeComponent(null);
    withFrame(component);
    component.handleMessage(messageEvent('http://localhost:3000', { status: 'digisign-token-cleared' }));
    expect(component.frameApp).toBe('digisign');

    // Forms origin, but from another window.
    component.handleMessage(messageEvent('http://localhost:3001', { status: 'forms-session-expiry', exp: 1 }, { postMessage: jest.fn() }));
    // Forms origin, our frame, but not JSON.
    component.handleMessage(messageEvent('http://localhost:3001', 'not-json{'));
    // Forms origin, our frame, but a status that is not a string.
    component.handleMessage(messageEvent('http://localhost:3001', { status: 7 }));
    // Forms origin, our frame, but a DigiSign status: Forms may only send forms-* statuses.
    component.handleMessage(messageEvent('http://localhost:3001', { status: 'digisign-auth-failed' }));

    expect(component.frameApp).toBe('digisign');
    expect(emitted).toEqual([]);
  });

  it('ignores a status that names neither app, even from our frame on the Forms origin', () => {
    const { component, emitted } = makeComponent(null);
    withFrame(component);
    component.frameApp = 'digisign';

    component.handleMessage(messageEvent('http://localhost:3001', { status: 'auth-failed' }));

    expect(component.frameApp).toBe('digisign');
    expect(emitted).toEqual([]);
  });
});

// The renewal timer lives in the host page, which is why it survives Forms navigating away.
// These tests assert the SCHEDULE rather than advancing wall-clock time: what matters is when
// we decide to ask for the next token, and that a bad answer never re-arms a tight loop.
describe('ss-container-inline token expiry decoding', () => {
  // Real JWTs are base64url with the padding stripped. atob uses forgiving base64, which accepts
  // a missing pad, so only the url-safe characters need mapping. Cover every valid pad length.
  it.each([0, 1, 2])('reads exp from an unpadded base64url payload (%i pad chars stripped)', (extra) => {
    const component = new SsContainerInline() as any;
    for (let filler = 0; filler < 6; filler++) {
      const claims = { exp: 1900000000, sub: '?>'.repeat(filler + extra) };
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
      expect(payload).not.toContain('=');
      expect(component.decodeExpiry(`header.${payload}.sig`)).toBe(1900000000 * 1000);
    }
  });

  const encode = (json: string) => Buffer.from(json).toString('base64url');
  it.each([
    ['no payload segment', 'just-one-part'],
    ['an empty payload', 'header..sig'],
    ['a payload that is not JSON', `header.${encode('not json')}.sig`],
    ['a JSON null payload', `header.${encode('null')}.sig`],
    ['an exp that is a numeric string', `header.${encode('{"exp":"1900000000"}')}.sig`],
    ['an exp that is not finite', `header.${encode('{"exp":1e400}')}.sig`],
  ])('reads no expiry from %s', (_label, jwt) => {
    const component = new SsContainerInline() as any;
    expect(component.decodeExpiry(jwt)).toBeNull();
  });
});

describe('ss-container-inline renewal scheduling', () => {
  // fetchHostToken also arms a timer (the getToken deadline), so a flat list of delays cannot
  // tell us which one is the renewal. Hand out an id per call and look up the one the
  // component actually kept as its renewal timer.
  let timers: Array<{ id: number; ms: number; fn: () => void }>;
  let realSetTimeout: typeof setTimeout;
  let nextId: number;

  beforeEach(() => {
    timers = [];
    nextId = 1;
    realSetTimeout = global.setTimeout;
    (global as any).setTimeout = (fn: () => void, ms?: number) => {
      const id = nextId++;
      timers.push({ id, ms: ms ?? 0, fn });
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
    component.iframe = () => ({ contentWindow: { postMessage, location: { replace: jest.fn() } }, src: '' });
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

  it('renews by posting forms-set-token to the Forms origin, never by reloading', async () => {
    let call = 0;
    const { component, iframeEl } = makeComponent(() => (++call === 1 ? jwtExpiringIn(3600, 'first') : jwtExpiringIn(7200, 'second')));
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    const srcAfterBootstrap = iframeEl.src;

    await component.renewNow();

    expect(postMessage).toHaveBeenCalledTimes(1);
    const [payload, targetOrigin] = postMessage.mock.calls[0];
    expect(payload.status).toBe('forms-set-token');
    expect(payload.token).toBe(component.token);
    // The replacement really is a different token, not the bootstrap one re-sent.
    expect(payload.token).not.toBe(srcAfterBootstrap.split('#t=')[1]);
    // The token must go to the exact Forms origin. A '*' target would hand it to any listener.
    expect(targetOrigin).toBe('http://localhost:3001');
    // Renewal is in place: the iframe URL is untouched, so form state survives.
    expect(iframeEl.src).toBe(srcAfterBootstrap);
  });

  it('times the first renewal on the session expiry Forms reports after the sign-in reload', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    const frame = { postMessage: jest.fn(), location: { replace: jest.fn() } };
    component.iframe = () => ({ contentWindow: frame, src: '' });
    await component.handleAuthFailed();
    // The exchange can hand Forms a cached token that runs out well before the host token.
    const sessionExp = Math.floor(Date.now() / 1000) + 1200;

    component.handleMessage({
      origin: 'http://localhost:3001',
      source: frame,
      data: { status: 'forms-session-expiry', exp: sessionExp },
    } as any);

    expectDelayNear(renewalDelay(component), 1200_000 - 3 * 60_000);
  });

  it('still accepts a renewal right after sign-in that comes back with the reported session expiry', async () => {
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    const sessionExp = Math.floor(Date.now() / 1000) + 1200;
    component.handleSessionExpiry({ exp: sessionExp });

    // The exchange hands back the same cached session token for an early host rotation.
    component.handleTokenInstalled({ ok: true, exp: sessionExp });

    expect(component.renewalRetryUsed).toBe(false);
    expect(emitted).toEqual([]);
    expectDelayNear(renewalDelay(component), 1200_000 - 3 * 60_000);
  });

  it('accepts the same session expiry again when Forms reloads inside the frame', async () => {
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    const sessionExp = Math.floor(Date.now() / 1000) + 1200;

    component.handleSessionExpiry({ exp: sessionExp });
    component.handleSessionExpiry({ exp: sessionExp });

    expectDelayNear(renewalDelay(component), 1200_000 - 3 * 60_000);
    expect(component.renewalRetryUsed).toBe(false);
    expect(emitted).toEqual([]);
  });

  it('ignores a session expiry on the cookie path', () => {
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);

    component.handleSessionExpiry({ exp: Math.floor(Date.now() / 1000) + 1200 });

    expect(component.renewalTimer).toBeNull();
    expect(component.lastInstalledExpiry).toBeNull();
  });

  it('ignores a session expiry that is not a number', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    const before = renewalDelay(component);

    component.handleSessionExpiry({ exp: 'soon' });

    expect(renewalDelay(component)).toBe(before);
    expect(component.lastInstalledExpiry).toBeNull();
  });

  it('stops renewing and tells the host when the user signs out inside Forms', async () => {
    const { component, emitted, iframeEl } = makeComponent(() => jwtExpiringIn(3600));
    const frame = { postMessage: jest.fn(), location: { replace: jest.fn() } };
    component.iframe = () => ({ contentWindow: frame, get src() { return iframeEl.src; }, set src(v) { iframeEl.src = v; } });
    await component.handleAuthFailed();
    const srcAfterSignIn = iframeEl.src;

    component.handleMessage({ origin: 'http://localhost:3001', source: frame, data: { status: 'forms-signed-out' } } as any);

    expect(component.renewalTimer).toBeNull();
    expect(component.tokenMode).toBe(false);
    expect(component.token).toBeNull();
    expect(emitted).toEqual([{ reason: 'signed-out' }]);
    // No reload: it would hit the cookie wall and sign the user straight back in.
    expect(iframeEl.src).toBe(srcAfterSignIn);
  });

  it('ignores a signed-out message on the cookie path', () => {
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);

    component.handleSignedOut();

    expect(emitted).toEqual([]);
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

  it('runs one renewal when the timer and the visibility check fire together', async () => {
    let call = 0;
    let release: (token: string) => void = () => {};
    const { component, emitted } = makeComponent(() => {
      call += 1;
      if (call === 1) return jwtExpiringIn(3600, 'first');
      return new Promise<string>(resolve => (release = resolve));
    });
    const postMessage = withIframe(component);
    await component.handleAuthFailed();

    const fromTimer = component.renewNow();
    const fromVisibility = component.renewNow();
    release(jwtExpiringIn(7200, 'second'));
    await Promise.all([fromTimer, fromVisibility]);

    expect(call).toBe(2);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([]);
  });

  it('does not join a renewal from before a clear, even one still waiting on getToken', async () => {
    let call = 0;
    const { component } = makeComponent(() => {
      call += 1;
      if (call === 2) return new Promise<string>(() => {});
      return jwtExpiringIn(3600, `t${call}`);
    });
    withIframe(component);
    await component.handleAuthFailed();
    const stuck = component.renewNow();

    void component.clearToken();

    expect(component.renewNow()).not.toBe(stuck);
  });

  it('still renews when a host that caches its token hands back the same one', async () => {
    // Inside the renewal window the exchange turns the same partner token into a fresh session
    // token, so the host token is not judged. Forms' answer is.
    const cached = jwtExpiringIn(3600);
    const { component, emitted } = makeComponent(() => cached);
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    const sessionExp = Math.floor(Date.now() / 1000) + 1800;
    component.handleTokenInstalled({ ok: true, exp: sessionExp });
    postMessage.mockClear();
    emitted.length = 0;

    await component.renewNow();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toEqual({ status: 'forms-set-token', token: cached });

    // Forms reports the fresh session token's later expiry: renewed, re-armed on it.
    component.handleTokenInstalled({ ok: true, exp: sessionExp + 3600 });
    expect(emitted).toEqual([]);
    expectDelayNear(renewalDelay(component), (1800 + 3600) * 1000 - 3 * 60_000);
    component.clearRenewalTimer();
  });

  it('waits at least a retry interval after renewing with a host token already inside the lead window', async () => {
    // A cached host token with a minute left must not re-arm at zero delay and spin while Forms answers.
    const nearDead = jwtExpiringIn(60);
    const { component } = makeComponent(() => nearDead);
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    postMessage.mockClear();

    await component.renewNow();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(renewalDelay(component)).toBe(30_000);
    component.clearRenewalTimer();
  });

  it('treats an install that does not move the session expiry as a failed renewal', async () => {
    // A renewal can report success while buying no extra time (a token asked for too early, before
    // the exchange's cache lets go of it). Re-arming on that expiry would retry at once and spin.
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    emitted.length = 0;

    // First ack establishes what the SESSION expires at - nothing to compare against yet. It is
    // inside the renewal window, where a renewal must move it.
    const sessionExp = Math.floor(Date.now() / 1000) + 120;
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

  // The host called refreshToken() long before the renewal window. The exchange hands back the same
  // cached session token, so Forms answers with the same expiry. That is not a failed renewal.
  it('keeps renewing after an early refreshToken that comes back with the same expiry', async () => {
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    const sessionExp = Math.floor(Date.now() / 1000) + 1800;
    component.handleTokenInstalled({ ok: true, exp: sessionExp });
    component.handleTokenInstalled({ ok: false }); // an earlier failure used the retry
    expect(component.renewalRetryUsed).toBe(true);
    postMessage.mockClear();

    await component.refreshToken();
    expect(postMessage).toHaveBeenCalledTimes(1);
    component.handleTokenInstalled({ ok: true, exp: sessionExp });

    expect(component.renewalRetryUsed).toBe(false);
    expect(emitted).toEqual([]);
    expectDelayNear(renewalDelay(component), 1800_000 - 3 * 60_000);

    // A second early refresh is still not a failure.
    component.handleTokenInstalled({ ok: true, exp: sessionExp });
    expect(emitted).toEqual([]);
    expectDelayNear(renewalDelay(component), 1800_000 - 3 * 60_000);
    component.clearRenewalTimer();
  });

  it('still counts the same expiry inside the renewal window as a failed renewal', async () => {
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    const sessionExp = Math.floor(Date.now() / 1000) + 150;
    component.handleTokenInstalled({ ok: true, exp: sessionExp });

    component.handleTokenInstalled({ ok: true, exp: sessionExp });

    expect(component.renewalRetryUsed).toBe(true);
    expect(renewalDelay(component)).toBe(30_000);
    expect(emitted).toEqual([]);
    component.clearRenewalTimer();
  });

  it('caps the renewal timer at the longest delay the browser allows', async () => {
    // Past about 24.8 days setTimeout fires at once, which would renew right away.
    const { component } = makeComponent(() => jwtExpiringIn(60 * 24 * 3600));
    withIframe(component);
    await component.handleAuthFailed();

    expect(renewalDelay(component)).toBe(2 ** 31 - 1);
    component.clearRenewalTimer();
  });

  describe('a token session Forms restored after a host reload or a remount', () => {
    function restored(getToken: GetToken | null) {
      const made = makeComponent(getToken);
      const frame = { postMessage: jest.fn(), location: { replace: jest.fn() } };
      made.component.iframe = () => ({ contentWindow: frame, src: '' });
      const fromForms = (data: any) => made.component.handleMessage({ origin: 'http://localhost:3001', source: frame, data } as any);
      return { ...made, frame, fromForms };
    }

    it('is taken up when Forms says its session came from a widget token', async () => {
      const getToken = jest.fn(() => jwtExpiringIn(3600));
      const { component, emitted, frame, fromForms } = restored(getToken);
      const sessionExp = Math.floor(Date.now() / 1000) + 1200;

      fromForms({ status: 'forms-session-expiry', exp: sessionExp, sessionless: true });

      expect(component.tokenMode).toBe(true);
      expectDelayNear(renewalDelay(component), 1200_000 - 3 * 60_000);
      expect(getToken).not.toHaveBeenCalled(); // no token until the renewal is due

      await component.renewNow();
      expect(frame.postMessage).toHaveBeenCalledTimes(1);
      expect(frame.postMessage.mock.calls[0][0].status).toBe('forms-set-token');
      expect(emitted).toEqual([]);
      component.clearRenewalTimer();
    });

    it('is left alone when the session expiry carries no sessionless flag (an older Forms, or cookies)', () => {
      const getToken = jest.fn(() => jwtExpiringIn(3600));
      const { component, fromForms } = restored(getToken);

      fromForms({ status: 'forms-session-expiry', exp: Math.floor(Date.now() / 1000) + 1200 });

      expect(component.tokenMode).toBe(false);
      expect(component.renewalTimer).toBeNull();
      expect(getToken).not.toHaveBeenCalled();
    });

    it('is left alone when the host has no getToken', () => {
      const { component, fromForms } = restored(null);

      fromForms({ status: 'forms-session-expiry', exp: Math.floor(Date.now() / 1000) + 1200, sessionless: true });

      expect(component.tokenMode).toBe(false);
      expect(component.renewalTimer).toBeNull();
    });

    it('still treats a later cookie wall as the loop guard', async () => {
      const getToken = jest.fn(() => jwtExpiringIn(3600));
      const { component, emitted, frame, fromForms } = restored(getToken);
      fromForms({ status: 'forms-session-expiry', exp: Math.floor(Date.now() / 1000) + 1200, sessionless: true });

      fromForms({ status: 'forms-auth-failed' });
      await settle();

      expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
      expect(getToken).not.toHaveBeenCalled();
      expect(frame.location.replace).not.toHaveBeenCalled();
      component.clearRenewalTimer();
    });

    it('is not taken up right after the user signed out inside Forms', async () => {
      const { component, emitted, fromForms } = restored(() => jwtExpiringIn(3600));
      await component.handleAuthFailed();
      fromForms({ status: 'forms-signed-out' });
      emitted.length = 0;

      fromForms({ status: 'forms-session-expiry', exp: Math.floor(Date.now() / 1000) + 1200, sessionless: true });

      expect(component.tokenMode).toBe(false);
      expect(component.renewalTimer).toBeNull();
    });
  });

  it('still sends a host token that expires before the session', async () => {
    // After an exchange the session's token can outlive the host's. A host token that expires
    // before the session is still handed over; Forms' answer decides whether it renewed anything.
    let next = jwtExpiringIn(3600, 'first');
    const { component } = makeComponent(() => next);
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    component.handleTokenInstalled({ ok: true, exp: Math.floor(Date.now() / 1000) + 7200 });
    postMessage.mockClear();

    next = jwtExpiringIn(3700, 'second'); // later than the last host token, earlier than the session
    await component.renewNow();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0].status).toBe('forms-set-token');
  });

  it('stops a renewal that was waiting on getToken when the container went away', async () => {
    let settle: (token: string) => void = () => {};
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    stubWidget(() => new Promise<string>((resolve) => (settle = resolve)));
    postMessage.mockClear();

    const renewing = component.renewNow();
    component.disconnectedCallback();
    settle(jwtExpiringIn(7200));
    await renewing;

    expect(postMessage).not.toHaveBeenCalled();
    expect(component.renewalTimer).toBeNull();
  });

  it('gives up on a getToken that never settles after 30s, tells the host, and lets a later wall try again', async () => {
    let next: () => string | Promise<string> = () => new Promise<string>(() => {});
    const { component, emitted } = makeComponent(() => next());
    const replace = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage: jest.fn(), location: { replace } }, src: '' });

    let finished = false;
    const falling = component.handleAuthFailed().then(() => (finished = true));
    await settle();
    expect(finished).toBe(false); // still waiting on the host
    const deadline = timers.find(t => t.ms === 30_000);
    expect(deadline).toBeDefined();

    deadline.fn();
    await settle();
    expect(finished).toBe(true);
    await falling;

    expect(emitted.map(e => e.reason)).toEqual(['token-callback-failed', 'iframe-auth-failed']);
    expect((emitted[0].error as Error).message).toBe('getToken timed out');
    expect(replace).not.toHaveBeenCalled();
    expect(component.tokenMode).toBe(false);

    // The next wall starts over instead of hitting the "already tried" guard.
    next = () => jwtExpiringIn(3600);
    await component.handleAuthFailed();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain('#t=');
  });

  it('loads nothing when the container goes away while the fallback waits on getToken', async () => {
    let release: (token: string) => void = () => {};
    const { component, emitted, iframeEl } = makeComponent(() => new Promise<string>(resolve => (release = resolve)));
    const replace = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage: jest.fn(), location: { replace } }, src: '' });

    const falling = component.handleAuthFailed();
    component.disconnectedCallback();
    release(jwtExpiringIn(3600));
    await falling;

    expect(replace).not.toHaveBeenCalled();
    expect(iframeEl.src).toBe('');
    expect(component.renewalTimer).toBeNull();
    expect(emitted).toEqual([]);
  });

  it('retries a renewal Forms rejected once, 30s later, by asking the host again', async () => {
    let n = 0;
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600 + 600 * n++));
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    postMessage.mockClear();

    component.handleTokenInstalled({ ok: false });
    expect(renewalDelay(component)).toBe(30_000);
    expect(emitted).toEqual([]);

    // The retry timer fires: a new token goes to Forms.
    timers.find(t => t.id === component.renewalTimer).fn();
    await settle();
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0].status).toBe('forms-set-token');

    // That renewal worked, so the next failure gets its own retry instead of reporting at once.
    component.handleTokenInstalled({ ok: true, exp: Math.floor(Date.now() / 1000) + 7200 });
    component.handleTokenInstalled({ ok: false });
    expect(emitted).toEqual([]);
    expect(renewalDelay(component)).toBe(30_000);
    component.clearRenewalTimer();
  });

  it('falls back to the expiry it already knows when Forms answers without one (an older Forms)', async () => {
    const { component, emitted } = makeComponent(() => jwtExpiringIn(3600));
    withIframe(component);
    await component.handleAuthFailed();
    const known = component.expiresAt;
    expect(known).not.toBeNull();

    component.handleTokenInstalled({ ok: true });

    expect(emitted).toEqual([]);
    expect(component.lastInstalledExpiry).toBe(known);
    expectDelayNear(renewalDelay(component), 3600_000 - 3 * 60_000);
    component.clearRenewalTimer();
  });

  it('treats a renewal whose getToken returns nothing as a failed renewal: retry once, then tell the host', async () => {
    let next: string | null = jwtExpiringIn(3600);
    const { component, emitted } = makeComponent(() => next);
    const postMessage = withIframe(component);
    await component.handleAuthFailed();
    postMessage.mockClear();
    next = null;

    await component.renewNow();
    expect(postMessage).not.toHaveBeenCalled();
    expect(renewalDelay(component)).toBe(30_000);
    expect(emitted).toEqual([]);

    await component.renewNow();
    expect(postMessage).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ reason: 'token-renewal-failed' }]);
    expect(component.renewalTimer).toBeNull();
  });

  // A failed getToken during a renewal is reported to the host at once, as everywhere else, and the
  // renewal still gets its one retry before token-renewal-failed.
  it('reports a getToken that throws during a renewal, then retries once', async () => {
    let calls = 0;
    const { component, emitted } = makeComponent(() => {
      calls += 1;
      if (calls > 1) throw new Error('host down');
      return jwtExpiringIn(3600);
    });
    withIframe(component);
    await component.handleAuthFailed();

    await component.renewNow();
    expect(emitted.map((e) => e.reason)).toEqual(['token-callback-failed']);
    expect(component.renewalRetryUsed).toBe(true);
    expect(component.renewalTimer).not.toBeNull();

    await component.renewNow();
    expect(emitted.map((e) => e.reason)).toEqual(['token-callback-failed', 'token-callback-failed', 'token-renewal-failed']);
    component.clearRenewalTimer();
  });

  describe('when the tab becomes visible again', () => {
    let visibility = 'visible';
    beforeEach(() => {
      visibility = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    });
    afterEach(() => {
      delete (document as any).visibilityState;
    });

    it('renews at once when a throttled timer left it past the renewal point', async () => {
      const { component } = makeComponent(() => jwtExpiringIn(60));
      withIframe(component);
      await component.handleAuthFailed();
      component.renewNow = jest.fn();

      component.handleVisibilityChange();

      expect(component.renewNow).toHaveBeenCalledTimes(1);
      component.clearRenewalTimer();
    });

    it('leaves it to the timer when it is not yet past the renewal point', async () => {
      const { component } = makeComponent(() => jwtExpiringIn(3600));
      withIframe(component);
      await component.handleAuthFailed();
      component.renewNow = jest.fn();

      component.handleVisibilityChange();

      expect(component.renewNow).not.toHaveBeenCalled();
      component.clearRenewalTimer();
    });

    // Right after a renewal post the next one waits at least a retry interval, even for a token
    // already inside the lead window. Coming back to the tab must not skip that wait.
    it('keeps the wait after a renewal post', async () => {
      const { component } = makeComponent(() => jwtExpiringIn(60));
      withIframe(component);
      await component.handleAuthFailed();
      await component.renewNow();
      component.renewNow = jest.fn();

      component.handleVisibilityChange();

      expect(component.renewNow).not.toHaveBeenCalled();
      component.clearRenewalTimer();
    });

    it('does not start again after a renewal has given up', async () => {
      let calls = 0;
      const { component, emitted } = makeComponent(() => (++calls === 1 ? jwtExpiringIn(60) : null));
      withIframe(component);
      await component.handleAuthFailed();
      await component.renewNow(); // fails, one retry left
      await component.renewNow(); // fails again: gives up
      expect(emitted.map((e) => e.reason)).toEqual(['token-renewal-failed']);
      component.renewNow = jest.fn();
      // Come back an hour later, well past any renewal or retry that was planned.
      const later = Date.now() + 60 * 60 * 1000;
      jest.spyOn(Date, 'now').mockReturnValue(later);

      component.handleVisibilityChange();

      expect(component.renewNow).not.toHaveBeenCalled();
      (Date.now as jest.Mock).mockRestore();
    });

    it('does nothing while the tab is still hidden', async () => {
      const { component } = makeComponent(() => jwtExpiringIn(60));
      withIframe(component);
      await component.handleAuthFailed();
      component.renewNow = jest.fn();
      visibility = 'hidden';

      component.handleVisibilityChange();

      expect(component.renewNow).not.toHaveBeenCalled();
      component.clearRenewalTimer();
    });
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
    const replace = jest.fn();
    const iframeEl: any = { src: '', contentWindow: { postMessage, location: { replace } } };
    component.iframe = () => iframeEl;
    await component.handleAuthFailed();
    // The token-carrying load goes through the frame window, so src never holds the token.
    expect(replace.mock.calls[0][0]).toContain('#t=');
    expect(iframeEl.src).toBe('');
    postMessage.mockClear();
    return { component, emitted, iframeEl, postMessage };
  }

  const tokenCleared = (component: any, origin = formsOrigin(), source = component.iframe()?.contentWindow) =>
    component.handleMessage({ origin, source, data: { status: 'forms-token-cleared' } } as MessageEvent);

  it('posts forms-clear-token to the exact Forms origin, then reloads the frame without a token once Forms confirms', async () => {
    const { component, iframeEl, postMessage } = await onTokenPath();

    const clearing = component.clearToken();
    expect(postMessage).toHaveBeenCalledWith({ status: 'forms-clear-token' }, formsOrigin());
    expect(iframeEl.src).toBe(''); // not reloaded before Forms answers
    tokenCleared(component);
    await clearing;

    expect(iframeEl.src).toMatch(/^http:\/\/localhost:3001\/[^#]*$/); // reloaded, no token
    expect(iframeEl.src.startsWith(Env.formsUrl)).toBe(true);
  });

  it('loads Forms with the clear fragment after the timeout when no app answers', async () => {
    const { component, iframeEl } = await onTokenPath();
    iframeEl.addEventListener = jest.fn();
    iframeEl.removeEventListener = jest.fn();

    const clearing = component.clearToken();
    // The first 3s timer is the wait for an answer; the second, the wait for the Forms load.
    pendingTimers.find(t => t.ms === 3000).fn();
    await Promise.resolve();
    expect(iframeEl.src).toMatch(/^http:\/\/localhost:3001\/[^#]*#forms-clear=1$/); // no token, clear fragment
    pendingTimers.filter(t => t.ms === 3000)[1].fn();
    await clearing;
    expect(component.frameApp).toBe('forms');
  });

  // Forms has handed the frame to DigiSign, but DigiSign has not spoken yet, so frameApp still says
  // Forms. The ask must still reach DigiSign, and the reload must still drop the Forms session.
  it('asks both apps to clear, each at its exact origin', async () => {
    const { component, postMessage } = await onTokenPath();
    expect(component.frameApp).toBe('forms');

    const clearing = component.clearToken();
    expect(postMessage.mock.calls).toEqual([
      [{ status: 'forms-clear-token' }, formsOrigin()],
      [{ status: 'digisign-clear-token' }, new URL(Env.digisignUrl).origin],
    ]);
    tokenCleared(component);
    await clearing;
  });

  it('drops the Forms session when DigiSign answers a clear before it ever spoke', async () => {
    const { component, iframeEl } = await onTokenPath();
    iframeEl.addEventListener = jest.fn();
    iframeEl.removeEventListener = jest.fn();

    const clearing = component.clearToken();
    component.handleMessage({
      origin: new URL(Env.digisignUrl).origin,
      source: iframeEl.contentWindow,
      data: { status: 'digisign-token-cleared' },
    } as MessageEvent);
    await Promise.resolve();
    await Promise.resolve();
    expect(iframeEl.src.endsWith('#forms-clear=1')).toBe(true);
    pendingTimers.filter(t => t.ms === 3000)[1].fn();
    await clearing;
    expect(component.frameApp).toBe('forms');
  });

  it('ignores a forms-token-cleared message from another origin', async () => {
    const { component, iframeEl } = await onTokenPath();

    const clearing = component.clearToken();
    tokenCleared(component, 'https://evil.example');
    await Promise.resolve();
    expect(iframeEl.src).toBe(''); // still waiting

    tokenCleared(component);
    await clearing;
    expect(iframeEl.src).toMatch(/^http:\/\/localhost:3001\/[^#]*$/); // reloaded, no token
  });

  it('never writes the token into src when the frame has no window', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    const iframeEl: any = { src: '', contentWindow: null };
    component.iframe = () => iframeEl;

    await component.handleAuthFailed();

    expect(iframeEl.src).toBe('');
    expect(component.tokenMode).toBe(false);
    expect(component.token).toBeNull();
  });

  it('leaves token mode when the frame cannot be loaded with the token, so a later wall can retry', async () => {
    const { component } = makeComponent(() => {
      // The host tears down its widget setup while getToken runs, so there is no URL to load.
      delete (window as any).skyslope.widget;
      return jwtExpiringIn(3600);
    });
    const replace = jest.fn();
    component.iframe = () => ({ src: '', contentWindow: { postMessage: jest.fn(), location: { replace } } });

    await component.handleAuthFailed();

    expect(replace).not.toHaveBeenCalled();
    expect(component.tokenMode).toBe(false);
    expect(component.token).toBeNull();
    expect(component.renewalTimer).toBeNull();
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
    expect(iframeEl.contentWindow.location.replace.mock.calls.at(-1)[0]).toContain('#t='); // the token path started again
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

    const renewing = component.renewNow();
    await clearWithAck(component);
    postMessage.mockClear();
    pending.settle(jwtExpiringIn(3600, 'previous-user'));
    await renewing;

    expect(postMessage).not.toHaveBeenCalled(); // no forms-set-token after the sign-out
    expect(component.token).toBeNull();
    expect(component.renewalTimer).toBeNull();
    expect(iframeEl.src).toMatch(/^http:\/\/localhost:3001\/[^#]*$/); // reloaded, no token
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

    expect(iframeEl.src).toMatch(/^http:\/\/localhost:3001\/[^#]*$/); // reloaded, no token
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
    expect(iframeEl.src).toMatch(/^http:\/\/localhost:3001\/[^#]*$/); // reloaded, no token
  });

  it('ignores a forms-token-installed that arrives after the clear', async () => {
    const { component } = await onTokenPath();
    await clearWithAck(component);

    component.handleMessage({
      origin: formsOrigin(),
      source: component.iframe()?.contentWindow,
      data: { status: 'forms-token-installed', ok: true, exp: Math.floor(Date.now() / 1000) + 3600 },
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
    expect(iframeEl.navigatedTo).toContain('#t='); // the token path started again
  });

  it('ignores a forms-token-cleared from another window on the Forms origin', async () => {
    const { component, iframeEl } = await onTokenPath();

    const clearing = component.clearToken();
    tokenCleared(component, formsOrigin(), { postMessage: jest.fn() }); // e.g. a second Forms tab
    await Promise.resolve();
    expect(iframeEl.src).toBe(''); // still waiting on our own frame

    tokenCleared(component);
    await clearing;
    expect(iframeEl.src).toMatch(/^http:\/\/localhost:3001\/[^#]*$/); // reloaded, no token
  });

  it('joins a clear already in progress instead of starting a second one', async () => {
    const { component, postMessage } = await onTokenPath();

    const first = component.clearToken();
    const second = component.clearToken();
    expect(second).toBe(first);
    expect(postMessage).toHaveBeenCalledTimes(2); // one ask to each app

    tokenCleared(component);
    await Promise.all([first, second]);
    expect(pendingTimers.filter((t) => t.ms === 3000)).toHaveLength(1);
  });

  it('skips the reload if the widget is unmounted while waiting for Forms', async () => {
    const { component, iframeEl } = await onTokenPath();

    const clearing = component.clearToken();
    component.disconnectedCallback();
    tokenCleared(component);
    await clearing;

    expect(iframeEl.src).toBe(''); // the old src, untouched
  });

  it('ends the token session and resolves at once when there is no frame to ask', async () => {
    const { component, postMessage } = await onTokenPath();
    component.iframe = () => null;
    let done = false;

    const clearing = component.clearToken().then(() => (done = true));
    await settle();

    expect(done).toBe(true); // did not sit out the 3s wait
    expect(postMessage).not.toHaveBeenCalled();
    expect(component.tokenMode).toBe(false);
    expect(component.token).toBeNull();
    expect(component.renewalTimer).toBeNull();
    await clearing;
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

describe('ss-container-inline token loads stay out of the iframe src', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  function withWindow(component: any, iframeEl: { src: string }) {
    const replace = jest.fn();
    component.iframe = () => ({
      contentWindow: { location: { replace }, postMessage: jest.fn() },
      get src() { return iframeEl.src; },
      set src(v: string) { iframeEl.src = v; },
    });
    return replace;
  }

  it('loads the token-carrying URL through the frame window, leaving src without the token', async () => {
    const { component, iframeEl } = makeComponent(() => jwtExpiringIn(3600));
    iframeEl.src = 'http://localhost:3001/error/cookies';
    const replace = withWindow(component, iframeEl);

    await component.handleAuthFailed();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain('#t=');
    expect(iframeEl.src).toBe('http://localhost:3001/error/cookies');
    component.clearRenewalTimer();
  });

  it('still sets src for a load without a token', async () => {
    const { component, iframeEl } = makeComponent(null);
    const replace = withWindow(component, iframeEl);

    await component.navigateTo();

    expect(replace).not.toHaveBeenCalled();
    expect(iframeEl.src).toContain('http://localhost:3001');
    expect(iframeEl.src).not.toContain('#t=');
  });
});

describe('ss-container-inline DigiSign hand-off', () => {
  const DS = 'http://localhost:3000';
  const FORMS = 'http://localhost:3001';

  afterEach(() => {
    delete (window as any).skyslope;
  });

  function framed(getToken: GetToken | null) {
    const made = makeComponent(getToken);
    const frame = { postMessage: jest.fn(), location: { replace: jest.fn() } };
    const loadListeners = new Set<() => void>();
    const iframe = {
      contentWindow: frame,
      get src() { return made.iframeEl.src; },
      set src(v) { made.iframeEl.src = v; },
      addEventListener: (_type: string, fn: () => void) => loadListeners.add(fn),
      removeEventListener: (_type: string, fn: () => void) => loadListeners.delete(fn),
    };
    made.component.iframe = () => iframe;
    // Fires the frame's load event, as the browser does when the new page has loaded.
    const frameLoaded = () => [...loadListeners].forEach(fn => fn());
    const fromDigisign = (data: any, source: any = frame) => made.component.handleMessage({ origin: DS, source, data } as any);
    const fromForms = (data: any) => made.component.handleMessage({ origin: FORMS, source: frame, data } as any);
    return { ...made, frame, fromDigisign, fromForms, frameLoaded };
  }

  it('answers DigiSign with a token posted to its exact origin in a token session', async () => {
    const { component, frame, fromDigisign } = framed(() => jwtExpiringIn(3600, 'ds'));
    await component.handleAuthFailed();
    frame.postMessage.mockClear();

    fromDigisign({ status: 'digisign-auth-required' });
    await settle();

    expect(frame.postMessage).toHaveBeenCalledTimes(1);
    const [payload, target] = frame.postMessage.mock.calls[0];
    expect(payload.status).toBe('digisign-set-token');
    expect(typeof payload.token).toBe('string');
    expect(target).toBe(DS);
    expect(component.renewalTimer).not.toBeNull();
    component.clearRenewalTimer();
  });

  it('refuses DigiSign outside token mode when the host has no getToken', async () => {
    const { component, emitted, frame, fromDigisign } = framed(null);

    fromDigisign({ status: 'digisign-auth-required' });
    await settle();

    expect(component.tokenMode).toBe(false);
    expect(frame.postMessage).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('ignores DigiSign messages from another window', async () => {
    const getToken = jest.fn(() => jwtExpiringIn(3600));
    const { component, frame, fromDigisign } = framed(getToken);
    await component.handleAuthFailed();
    getToken.mockClear();
    frame.postMessage.mockClear();

    fromDigisign({ status: 'digisign-auth-required' }, { postMessage: jest.fn() });
    await settle();

    expect(getToken).not.toHaveBeenCalled();
    expect(frame.postMessage).not.toHaveBeenCalled();
    component.clearRenewalTimer();
  });

  // Back in Forms after DigiSign. DigiSign's answer set the baseline, and the exchange caches one
  // token per user, so Forms can answer its first renewal with the same expiry. That is Forms'
  // first answer, not a renewal of DigiSign's session that gained nothing.
  it('starts a fresh renewal baseline when the other app takes over the frame', async () => {
    const { component, emitted, fromDigisign, fromForms } = framed(() => jwtExpiringIn(3600));
    await component.handleAuthFailed();
    fromDigisign({ status: 'digisign-auth-required' });
    await settle();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    fromDigisign({ status: 'digisign-token-installed', ok: true, exp });

    fromForms({ status: 'forms-session-expiry', exp });
    fromForms({ status: 'forms-token-installed', ok: true, exp });

    expect(component.renewalRetryUsed).toBe(false); // not counted as a failed renewal
    expect(component.lastInstalledExpiry).toBe(exp * 1000);
    expect(emitted).toEqual([]);
    component.clearRenewalTimer();
  });

  it('still treats a same-app answer with no gain as a failed renewal', async () => {
    const { component, fromForms } = framed(() => jwtExpiringIn(3600));
    await component.handleAuthFailed();
    const exp = Math.floor(Date.now() / 1000) + 120; // inside the renewal window
    fromForms({ status: 'forms-token-installed', ok: true, exp });
    fromForms({ status: 'forms-token-installed', ok: true, exp });

    expect(component.renewalRetryUsed).toBe(true);
    component.clearRenewalTimer();
  });

  it('sends renewals to whichever app spoke last', async () => {
    let n = 0;
    const { component, frame, fromDigisign, fromForms } = framed(() => jwtExpiringIn(3600 + 600 * ++n));
    await component.handleAuthFailed();
    fromDigisign({ status: 'digisign-auth-required' });
    await settle();
    frame.postMessage.mockClear();

    await component.renewNow();
    expect(frame.postMessage.mock.calls[0][0].status).toBe('digisign-set-token');
    expect(frame.postMessage.mock.calls[0][1]).toBe(DS);

    fromForms({ status: 'forms-session-expiry', exp: Math.floor(Date.now() / 1000) + 3600 });
    frame.postMessage.mockClear();
    await component.renewNow();
    expect(frame.postMessage.mock.calls[0][0].status).toBe('forms-set-token');
    expect(frame.postMessage.mock.calls[0][1]).toBe(FORMS);
    component.clearRenewalTimer();
  });

  it('asks DigiSign to clear when it is in the frame, then has Forms drop its session too', async () => {
    const { component, frame, fromDigisign, frameLoaded, iframeEl } = framed(() => jwtExpiringIn(3600));
    await component.handleAuthFailed();
    fromDigisign({ status: 'digisign-auth-required' });
    await settle();
    frame.postMessage.mockClear();
    let cleared = false;

    const clearing = component.clearToken().then(() => {
      cleared = true;
    });
    await settle();
    expect(frame.postMessage).toHaveBeenCalledWith({ status: 'digisign-clear-token' }, DS);

    fromDigisign({ status: 'digisign-token-cleared' });
    await settle();
    // The Forms session DigiSign was handed off from is still in the frame: Forms is loaded with
    // the fragment that drops it, without a token, and the clear waits for that load.
    expect(iframeEl.src.startsWith(FORMS)).toBe(true);
    expect(iframeEl.src.endsWith('#forms-clear=1')).toBe(true);
    expect(iframeEl.src).not.toContain('#t=');
    expect(cleared).toBe(false);

    frameLoaded();
    await clearing;
    expect(component.tokenMode).toBe(false);
    expect(component.frameApp).toBe('forms');
  });

  it('finishes a DigiSign clear after the timeout when the Forms load never fires', async () => {
    const realSetTimeout = global.setTimeout;
    const held: Array<{ fn: () => void; ms: number }> = [];
    (global as any).setTimeout = (fn: () => void, ms?: number) => {
      held.push({ fn, ms: ms ?? 0 });
      return held.length;
    };
    try {
      const { component, fromDigisign, iframeEl } = framed(() => jwtExpiringIn(3600));
      await component.handleAuthFailed();
      fromDigisign({ status: 'digisign-auth-required' });
      await settle();
      let cleared = false;

      const clearing = component.clearToken().then(() => (cleared = true));
      await settle();
      fromDigisign({ status: 'digisign-token-cleared' });
      await settle();
      expect(iframeEl.src.endsWith('#forms-clear=1')).toBe(true);
      expect(cleared).toBe(false); // waiting on the Forms load

      // The newest 3s timer is the wait for that load; the older one was the wait for DigiSign.
      const waits = held.filter(t => t.ms === 3000);
      expect(waits).toHaveLength(2);
      waits[1].fn();
      await settle();

      expect(cleared).toBe(true);
      await clearing;
    } finally {
      (global as any).setTimeout = realSetTimeout;
    }
  });

  it('tells the host when getToken has no token for DigiSign', async () => {
    let next: string | null = jwtExpiringIn(3600);
    const { component, emitted, frame, fromDigisign } = framed(() => next);
    await component.handleAuthFailed();
    frame.postMessage.mockClear();
    next = null;

    fromDigisign({ status: 'digisign-auth-required' });
    await settle();

    expect(frame.postMessage).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
    component.clearRenewalTimer();
  });

  it('sends DigiSign no token, not even the earlier one, once the host has dropped getToken', async () => {
    const { component, emitted, frame, fromDigisign } = framed(() => jwtExpiringIn(3600));
    await component.handleAuthFailed();
    expect(component.token).not.toBeNull();
    frame.postMessage.mockClear();
    stubWidget(null);

    fromDigisign({ status: 'digisign-auth-required' });
    await settle();

    expect(frame.postMessage).not.toHaveBeenCalled();
    expect(component.token).toBeNull();
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
    component.clearRenewalTimer();
  });

  it('tells the host when getToken throws while DigiSign waits', async () => {
    const boom = new Error('mint failed');
    let fail = false;
    const { component, emitted, frame, fromDigisign } = framed(() => {
      if (fail) throw boom;
      return jwtExpiringIn(3600);
    });
    await component.handleAuthFailed();
    frame.postMessage.mockClear();
    fail = true;

    fromDigisign({ status: 'digisign-auth-required' });
    await settle();

    expect(frame.postMessage).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ reason: 'token-callback-failed', error: boom }, { reason: 'iframe-auth-failed' }]);
    component.clearRenewalTimer();
  });

  it('sends the DigiSign token to the DigiSign origin even if Forms spoke while getToken ran', async () => {
    let call = 0;
    let release: (token: string) => void = () => {};
    const { component, frame, fromDigisign, fromForms } = framed(() =>
      ++call === 1 ? jwtExpiringIn(3600) : new Promise<string>(resolve => (release = resolve)),
    );
    await component.handleAuthFailed();
    frame.postMessage.mockClear();

    fromDigisign({ status: 'digisign-auth-required' });
    fromForms({ status: 'forms-session-expiry', exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(component.frameApp).toBe('forms');
    release(jwtExpiringIn(3600, 'ds'));
    await settle();

    expect(frame.postMessage).toHaveBeenCalledTimes(1);
    expect(frame.postMessage.mock.calls[0][0].status).toBe('digisign-set-token');
    expect(frame.postMessage.mock.calls[0][1]).toBe(DS);
    component.clearRenewalTimer();
  });

  it('does not add the Forms clear fragment when Forms itself was asked to clear', async () => {
    const { component, frame, fromForms, iframeEl } = framed(() => jwtExpiringIn(3600));
    await component.handleAuthFailed();
    frame.postMessage.mockClear();

    const clearing = component.clearToken();
    await settle();
    expect(frame.postMessage).toHaveBeenCalledWith({ status: 'forms-clear-token' }, FORMS);
    fromForms({ status: 'forms-token-cleared' });
    await clearing;

    expect(iframeEl.src).not.toContain('forms-clear');
  });

  it('treats each DigiSign sign-in as a new baseline, not a renewal that gained nothing', async () => {
    const { component, emitted, fromDigisign } = framed(() => jwtExpiringIn(3600));
    await component.handleAuthFailed();
    // DigiSign's session token comes from the exchange's cache, so every load reports the same expiry.
    const sessionExp = Math.floor(Date.now() / 1000) + 1800;

    for (let load = 0; load < 3; load++) {
      fromDigisign({ status: 'digisign-auth-required' });
      await settle();
      fromDigisign({ status: 'digisign-token-installed', ok: true, exp: sessionExp });
    }

    expect(component.renewalRetryUsed).toBe(false);
    expect(emitted).toEqual([]);
    expect(component.lastInstalledExpiry).toBe(sessionExp * 1000);
    component.clearRenewalTimer();
  });

  it('re-arms on the expiry DigiSign reports', async () => {
    const { component, fromDigisign } = framed(() => jwtExpiringIn(3600));
    await component.handleAuthFailed();
    fromDigisign({ status: 'digisign-auth-required' });
    await settle();
    const sessionExp = Math.floor(Date.now() / 1000) + 1800;

    fromDigisign({ status: 'digisign-token-installed', ok: true, exp: sessionExp });

    expect(component.lastInstalledExpiry).toBe(sessionExp * 1000);
    component.clearRenewalTimer();
  });

  it('stops renewing and refuses DigiSign more tokens when the user signs out inside DigiSign', async () => {
    const getToken = jest.fn(() => jwtExpiringIn(3600));
    const { component, emitted, frame, fromDigisign } = framed(getToken);
    await component.handleAuthFailed();
    fromDigisign({ status: 'digisign-auth-required' });
    await settle();
    emitted.length = 0;
    getToken.mockClear();
    frame.postMessage.mockClear();

    fromDigisign({ status: 'digisign-signed-out' });

    expect(emitted).toEqual([{ reason: 'signed-out' }]);
    expect(component.tokenMode).toBe(false);
    expect(component.renewalTimer).toBeNull();

    // A reload of the DigiSign page asks again: no token for it now.
    fromDigisign({ status: 'digisign-auth-required' });
    await settle();
    expect(getToken).not.toHaveBeenCalled();
    expect(frame.postMessage).not.toHaveBeenCalled();
  });

  it('does not let DigiSign send Forms statuses', async () => {
    const getToken = jest.fn(() => jwtExpiringIn(3600));
    const { component, emitted, fromDigisign } = framed(getToken);

    fromDigisign({ status: 'forms-auth-failed' });
    await settle();

    expect(getToken).not.toHaveBeenCalled();
    expect(component.tokenMode).toBe(false);
    expect(emitted).toEqual([]);
  });

  // After a host reload or a remount, Forms restored its token session from the frame's storage
  // without a cookie wall, so the widget is not in token mode. DigiSign only asks in a token session.
  it('takes up the token session when DigiSign asks outside token mode and the host has getToken', async () => {
    const getToken = jest.fn(() => jwtExpiringIn(3600, 'ds'));
    const { component, emitted, frame, fromDigisign } = framed(getToken);

    fromDigisign({ status: 'digisign-auth-required' });
    await settle();

    expect(component.tokenMode).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(frame.postMessage).toHaveBeenCalledTimes(1);
    expect(frame.postMessage.mock.calls[0][0].status).toBe('digisign-set-token');
    expect(frame.postMessage.mock.calls[0][1]).toBe(DS);
    expect(component.renewalTimer).not.toBeNull();
    expect(emitted).toEqual([]);
    component.clearRenewalTimer();
  });

  it('leaves token mode again when the taken-up session gets no token', async () => {
    const { component, emitted, frame, fromDigisign } = framed(() => null);

    fromDigisign({ status: 'digisign-auth-required' });
    await settle();

    expect(component.tokenMode).toBe(false);
    expect(frame.postMessage).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  // After clearToken(), DigiSign reloads and asks for a token while the widget reloads Forms with
  // #forms-clear=1. Taking that ask up would race the reload that drops the old session, so the next
  // session starts with a cookie wall, as it did before. A host reload is a new widget, which takes
  // a restored session up.
  it('ends a taken-up session on clearToken, and takes up no other until a new cookie wall', async () => {
    const { component, emitted, frame, fromDigisign, fromForms } = framed(() => jwtExpiringIn(3600));
    fromDigisign({ status: 'digisign-auth-required' });
    await settle();
    expect(component.tokenMode).toBe(true);

    const clearing = component.clearToken();
    await settle();
    fromForms({ status: 'forms-token-cleared' });
    await clearing;
    expect(component.tokenMode).toBe(false);
    expect(component.renewalTimer).toBeNull();
    expect(component.adoptionBlocked).toBe(true);

    emitted.length = 0;
    frame.postMessage.mockClear();
    fromDigisign({ status: 'digisign-auth-required' });
    await settle();
    expect(component.tokenMode).toBe(false);
    expect(frame.postMessage).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);

    // The cookie wall Forms hits after #forms-clear starts the next sign-in.
    await component.handleAuthFailed();
    expect(component.adoptionBlocked).toBe(false);
    expect(component.tokenMode).toBe(true);
    component.clearRenewalTimer();
  });

  it('starts over after an in-frame sign-out once a new cookie wall signs the user in', async () => {
    const { component, fromDigisign } = framed(() => jwtExpiringIn(3600));
    await component.handleAuthFailed();
    fromDigisign({ status: 'digisign-signed-out' });
    expect(component.adoptionBlocked).toBe(true);

    await component.handleAuthFailed();

    expect(component.adoptionBlocked).toBe(false);
    component.clearRenewalTimer();
  });

  it('sends DigiSign nothing, and reports nothing, when the host signs out while getToken runs', async () => {
    let call = 0;
    let release: (token: string) => void = () => {};
    const { component, emitted, frame, fromDigisign, fromForms } = framed(() =>
      ++call === 1 ? jwtExpiringIn(3600) : new Promise<string>(resolve => (release = resolve)),
    );
    await component.handleAuthFailed();
    fromDigisign({ status: 'digisign-auth-required' });
    await settle();

    const clearing = component.clearToken();
    await settle();
    fromForms({ status: 'forms-token-cleared' });
    await clearing;
    release(jwtExpiringIn(3600, 'late'));
    await settle();

    const statuses = frame.postMessage.mock.calls.map(c => c[0]?.status);
    expect(statuses).not.toContain('digisign-set-token');
    expect(emitted).toEqual([]);
  });

  it('tells the host when DigiSign gives up waiting', () => {
    const { emitted, fromDigisign } = framed(() => jwtExpiringIn(3600));

    fromDigisign({ status: 'digisign-auth-failed' });

    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });
});

describe('ss-container-inline mount and unmount', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).skyslope;
  });

  it('routes the global refreshToken() and clearToken() to the mounted container', async () => {
    const { component } = makeComponent(null);
    component.renewNow = jest.fn().mockResolvedValue(undefined);
    component.clearToken = jest.fn().mockResolvedValue(undefined);
    component.connectedCallback();
    const { widget } = (window as any).skyslope;

    await widget.refreshToken();
    await widget.clearToken();

    expect(component.renewNow).toHaveBeenCalledTimes(1);
    expect(component.clearToken).toHaveBeenCalledTimes(1);
    component.disconnectedCallback();
  });

  it('stops listening for frame messages and tab visibility on unmount', () => {
    const { component } = makeComponent(null);
    const addWindow = jest.spyOn(window, 'addEventListener');
    const removeWindow = jest.spyOn(window, 'removeEventListener');
    const removeDocument = jest.spyOn(document, 'removeEventListener');
    component.connectedCallback();
    expect(addWindow).toHaveBeenCalledWith('message', component.handleMessage);

    component.disconnectedCallback();

    expect(removeWindow).toHaveBeenCalledWith('message', component.handleMessage);
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', component.handleVisibilityChange);
  });

  it('ends the token session on unmount', async () => {
    const { component } = makeComponent(() => jwtExpiringIn(3600));
    await component.handleAuthFailed();
    expect(component.tokenMode).toBe(true);

    component.disconnectedCallback();

    expect(component.tokenMode).toBe(false);
    expect(component.token).toBeNull();
    expect(component.renewalTimer).toBeNull();
  });
});

describe('globalScript widget API', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  it('keeps getToken in module scope, off the widget the page can reach', () => {
    const getToken = () => 'tok';
    const widget = new SkySlopeWidget();
    widget.initialize({ getToken } as any);

    expect(readGetToken()).toBe(getToken);
    expect(Object.values(widget)).not.toContain(getToken);
  });

  it('forgets getToken when the global script is set up again', () => {
    const widget = new SkySlopeWidget();
    widget.initialize({ getToken: () => 'tok' } as any);
    expect(readGetToken()).not.toBeNull();

    reinitializeGlobalScript();

    expect(readGetToken()).toBeNull();
  });

  it('refuses a second refresh registration and keeps the first', () => {
    const widget = new SkySlopeWidget();
    const first = jest.fn();
    widget.registerRefresh(first);

    expect(() => widget.registerRefresh(jest.fn())).toThrow(/Refresh Callback is already defined/);
    widget.refreshToken();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('refuses a second clear-token registration and keeps the first', async () => {
    const widget = new SkySlopeWidget();
    const first = jest.fn().mockResolvedValue(undefined);
    widget.registerClearToken(first);

    expect(() => widget.registerClearToken(jest.fn().mockResolvedValue(undefined))).toThrow(/Clear Token Callback is already defined/);
    await widget.clearToken();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('makes refreshToken a no-op until a container registers, then routes it there', async () => {
    const widget = new SkySlopeWidget();
    await expect(widget.refreshToken()).resolves.toBeUndefined();

    const refresh = jest.fn(() => Promise.resolve());
    widget.registerRefresh(refresh);
    await widget.refreshToken();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('lets the host wait for the renewal refreshToken starts', async () => {
    const widget = new SkySlopeWidget();
    let finishRenewal: () => void = () => {};
    widget.registerRefresh(() => new Promise<void>((resolve) => (finishRenewal = resolve)));
    let done = false;

    const refreshing = widget.refreshToken().then(() => {
      done = true;
    });
    await settle();
    expect(done).toBe(false);

    finishRenewal();
    await refreshing;
    expect(done).toBe(true);
  });
});
