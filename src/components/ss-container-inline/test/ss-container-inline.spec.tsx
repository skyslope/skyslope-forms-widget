// Import the testing entry so the mock `window` global is installed.
import '@stencil/core/testing';
import { SsContainerInline } from '../ss-container-inline';

// The component reads window.skyslope at render time and its getToken callback while
// resolving the token. newSpecPage() resets custom window props on setup, so we drive the
// component instance directly instead: set the global, run the lifecycle hook, then assert
// on the URL it builds and the events it emits.
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
    },
  };
}

function makeComponent(getToken: GetToken | null): { component: any; emitted: Array<{ reason: string; error?: unknown }> } {
  stubWidget(getToken);
  const component = new SsContainerInline() as any;
  const emitted: Array<{ reason: string; error?: unknown }> = [];
  component.authError = { emit: (detail: any) => emitted.push(detail) };
  return { component, emitted };
}

async function buildUrl(getToken: GetToken | null) {
  const { component, emitted } = makeComponent(getToken);
  await component.componentWillLoad();
  return { url: component.getUrl(), token: component.token, emitted };
}

describe('ss-container-inline token pass-through', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  it('builds the Forms iframe URL with no token fragment when getToken is not provided', async () => {
    const { url } = await buildUrl(null);
    expect(url).toContain('widgetTrack=');
    expect(url).not.toContain('#t=');
  });

  it('appends the token as a trailing #t= fragment when getToken returns a token', async () => {
    const { url, token } = await buildUrl(() => 'jwt-abc.def.ghi');
    expect(token).toBe('jwt-abc.def.ghi');
    expect(url).toContain('#t=jwt-abc.def.ghi');
    // Fragment comes after the query so the Forms app reads the token at load.
    expect(url.indexOf('#t=')).toBeGreaterThan(url.indexOf('widgetTrack='));
    // The token must be a URL fragment, never a query param (fragments aren't sent to the server).
    expect(url).not.toMatch(/[?&]t=/);
  });

  it('awaits an async getToken before building the URL', async () => {
    const { url } = await buildUrl(async () => 'async-token');
    expect(url).toContain('#t=async-token');
  });

  it('omits the fragment and emits authError(token-callback-failed) when getToken throws', async () => {
    const boom = new Error('mint failed');
    const { url, token, emitted } = await buildUrl(() => {
      throw boom;
    });
    expect(token).toBeNull();
    expect(url).not.toContain('#t=');
    expect(url).toContain('widgetTrack=');
    expect(emitted).toEqual([{ reason: 'token-callback-failed', error: boom }]);
  });

  it('omits the fragment when getToken resolves to null', async () => {
    const { url, token, emitted } = await buildUrl(() => null);
    expect(token).toBeNull();
    expect(url).not.toContain('#t=');
    expect(emitted).toEqual([]);
  });

  it('refreshes the token on navigation so a late navigation carries a fresh token', async () => {
    let calls = 0;
    const { component } = makeComponent(() => `token-${++calls}`);
    // Stand in for the shadow-root iframe navigateTo writes to (el is a read-only @Element).
    const iframeEl = { src: '' };
    component.iframe = () => iframeEl;

    await component.componentWillLoad();
    expect(component.getUrl()).toContain('#t=token-1');

    await component.navigateTo();
    expect(iframeEl.src).toContain('#t=token-2');
  });

  it('refreshToken posts a fresh token to the Forms origin instead of the URL', async () => {
    let calls = 0;
    const { component } = makeComponent(() => `token-${++calls}`);
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage } });

    await component.componentWillLoad(); // resolves token-1
    await component.refreshToken(); // should resolve token-2 and post it

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { status: 'set-token', token: 'token-2' },
      'http://localhost:3001' // Env.formsUrl origin in spec
    );
  });

  it('refreshToken does not post when no token is available', async () => {
    const { component } = makeComponent(null);
    const postMessage = jest.fn();
    component.iframe = () => ({ contentWindow: { postMessage } });

    await component.refreshToken();

    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('ss-container-inline auth-failed message handling', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  function messageEvent(origin: string, data: unknown): MessageEvent {
    return { origin, data } as MessageEvent;
  }

  it('emits authError(iframe-auth-failed) on a forms-auth-failed message from the Forms origin', () => {
    const { component, emitted } = makeComponent(null);
    // Env.formsUrl in spec is http://localhost:3001/.
    component.handleMessage(messageEvent('http://localhost:3001', JSON.stringify({ status: 'forms-auth-failed' })));
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('accepts an already-parsed message object', () => {
    const { component, emitted } = makeComponent(null);
    component.handleMessage(messageEvent('http://localhost:3001', { status: 'forms-auth-failed' }));
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('ignores messages from a different origin', () => {
    const { component, emitted } = makeComponent(null);
    component.handleMessage(messageEvent('https://evil.example.com', JSON.stringify({ status: 'forms-auth-failed' })));
    expect(emitted).toEqual([]);
  });

  it('ignores unrelated messages and malformed payloads from the Forms origin', () => {
    const { component, emitted } = makeComponent(null);
    component.handleMessage(messageEvent('http://localhost:3001', JSON.stringify({ status: 'forms-user-ready' })));
    component.handleMessage(messageEvent('http://localhost:3001', 'not-json{'));
    expect(emitted).toEqual([]);
  });
});
