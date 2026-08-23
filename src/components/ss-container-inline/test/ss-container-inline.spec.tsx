// Import the testing entry so the mock `window` global is installed.
import '@stencil/core/testing';
import { Env } from '@stencil/core';
import { SsContainerInline } from '../ss-container-inline';

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

function stubWidget(getToken: GetToken | null = null) {
  (window as any).skyslope = {
    widget: {
      path: '',
      idp: null,
      headerVariant: null,
      getToken,
      registerReload: () => undefined,
      registerNavigateTo: () => undefined,
      registerRefresh: () => undefined,
    },
  };
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
