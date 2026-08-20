// Import the testing entry so the mock `window` global is installed.
import '@stencil/core/testing';
import { SsContainerInline } from '../ss-container-inline';

// The component reads window.skyslope at render time and its getToken callback in
// componentWillLoad. newSpecPage() resets custom window props on setup, so we drive
// the component instance directly instead: set the global, run the lifecycle hook,
// then assert on the URL it builds.
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

async function buildUrl(getToken: GetToken | null): Promise<{ url: string; token: string | null; emitted: unknown[] }> {
  stubWidget(getToken);
  const component = new SsContainerInline() as any;
  const emitted: unknown[] = [];
  component.authTokenError = { emit: (detail: unknown) => emitted.push(detail) };
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

  it('omits the fragment and emits authTokenError when getToken throws', async () => {
    const boom = new Error('mint failed');
    const { url, token, emitted } = await buildUrl(() => {
      throw boom;
    });
    expect(token).toBeNull();
    expect(url).not.toContain('#t=');
    expect(url).toContain('widgetTrack=');
    expect(emitted).toEqual([{ error: boom }]);
  });

  it('omits the fragment when getToken resolves to null', async () => {
    const { url, token, emitted } = await buildUrl(() => null);
    expect(token).toBeNull();
    expect(url).not.toContain('#t=');
    expect(emitted).toEqual([]);
  });
});
