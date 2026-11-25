// Import the testing entry so the mock `window` global is installed.
import { newSpecPage } from '@stencil/core/testing';
import { Env } from '@stencil/core';
import { SsContainerInline } from '../ss-container-inline';
import { SkySlopeWidget } from '../../../globalScript';
import { GetTokenCallback as GetToken } from '../../../window';

// Forced token authentication: initialize({ forceTokenAuth: true, getToken }).
// Contract with Forms (files-ui): every frame load carries ?tokenOnly=1 next to frameOrigin AND
// #t=<token>, and the widget never loads Forms without a token. In tokenOnly mode Forms posts
// forms-auth-failed instead of signing in from the SkySlope cookie; the widget answers with a
// fresh getToken and a reload.

Env.formsUrl = Env.formsUrl ?? 'http://localhost:3001/';
Env.digisignUrl = Env.digisignUrl ?? 'http://localhost:3000/';
const FORMS_ORIGIN = new URL(Env.formsUrl).origin;
const DIGISIGN_ORIGIN = new URL(Env.digisignUrl).origin;

type FakeFrame = { src: string; loads: string[]; contentWindow: any };

function newFrame(): FakeFrame {
  const frame: FakeFrame = { src: '', loads: [], contentWindow: null };
  frame.contentWindow = { postMessage: jest.fn(), location: { replace: (url: string) => frame.loads.push(url) } };
  return frame;
}

// A component instance driven directly, with a fake iframe. Stencil's re-render after frameKey
// changes is played by render(): a new blank frame, then componentDidRender. With autoRender on
// it runs on the next microtask after each replacement, as a real render would.
function forced(getToken: GetToken | null, { force = true } = {}) {
  const widget = new SkySlopeWidget();
  widget.initialize({ getToken, forceTokenAuth: force });
  (window as any).skyslope = { widget };
  const component = new SsContainerInline() as any;
  const emitted: Array<{ reason: string; error?: unknown }> = [];
  component.authError = { emit: (detail: any) => emitted.push(detail) };
  const frames: FakeFrame[] = [newFrame()];
  component.iframe = () => frames[frames.length - 1];
  const harness = {
    component,
    emitted,
    frames,
    autoRender: true,
    frame: () => frames[frames.length - 1],
    render: () => {
      if (component.frameReplaced != null) frames.push(newFrame());
      component.componentDidRender();
    },
  };
  const replace = component.replaceFrame.bind(component);
  component.replaceFrame = () => {
    const pending = replace();
    if (harness.autoRender) void Promise.resolve().then(harness.render);
    return pending;
  };
  component.componentWillLoad();
  return harness;
}

// Every forced load: the Forms URL with tokenOnly=1 beside frameOrigin, and the token in #t=.
function expectTokenLoad(url: string | undefined, token: string) {
  expect(url).toBeDefined();
  const parsed = new URL(url);
  expect(parsed.searchParams.get('tokenOnly')).toBe('1');
  expect(parsed.searchParams.get('frameOrigin')).toBe(window.location.origin);
  expect(parsed.hash).toBe(`#t=${encodeURIComponent(token)}`);
  // The token never reaches the server or the query.
  expect(parsed.search).not.toContain(token);
}

function message(frame: FakeFrame, data: unknown, origin = FORMS_ORIGIN) {
  return { source: frame.contentWindow, origin, data } as any;
}

async function settle(rounds = 10) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

afterEach(() => {
  delete (window as any).skyslope;
  jest.useRealTimers();
});

describe('forced mode: every load carries tokenOnly=1 and #t=', () => {
  it('starts blank and loads the first token through the frame window, never src', async () => {
    const getToken = jest.fn(async () => 'token-a');
    const { component, frame, emitted } = forced(getToken);
    expect(component.render().$children$[0].$attrs$.src).toBeUndefined();
    await component.componentDidLoad();
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(frame().loads).toHaveLength(1);
    expectTokenLoad(frame().loads[0], 'token-a');
    expect(frame().src).toBe('');
    expect(emitted).toEqual([]);
  });

  it('reload() fetches a fresh token and loads it, instead of asking Forms to reload itself', async () => {
    const getToken = jest.fn().mockReturnValueOnce('token-a').mockReturnValue('token-a2');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    await component.reloadIframe();
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(frame().contentWindow.postMessage).not.toHaveBeenCalledWith('reload', expect.anything());
    expectTokenLoad(frame().loads[1], 'token-a2');
  });

  it('navigateTo() fetches a fresh token and loads the new path with it', async () => {
    const getToken = jest.fn().mockReturnValueOnce('token-a').mockReturnValue('token-a2');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    await component.navigateTo();
    expect(getToken).toHaveBeenCalledTimes(2);
    expectTokenLoad(frame().loads[1], 'token-a2');
  });

  it('URL-encodes the token in the fragment', async () => {
    const { component, frame } = forced(() => 'a+b/c=');
    await component.componentDidLoad();
    expect(frame().loads[0].endsWith('#t=a%2Bb%2Fc%3D')).toBe(true);
  });

  it('leaves the default URL without tokenOnly', () => {
    const { component } = forced(() => 'token', { force: false });
    const url = new URL(component.getUrl());
    expect(url.searchParams.has('tokenOnly')).toBe(false);
  });
});

describe('forced mode: Forms is never loaded without a token', () => {
  it.each([
    ['no getToken', null],
    ['getToken returns null', () => null],
    ['getToken resolves null', async () => null],
  ])('stays blank and reports iframe-auth-failed: %s', async (_label, getToken) => {
    const { component, frame, emitted } = forced(getToken as GetToken | null);
    await component.componentDidLoad();
    expect(frame().loads).toEqual([]);
    expect(frame().src).toBe('');
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it.each(['throw', 'timeout'])('reports token-callback-failed then iframe-auth-failed once when getToken fails by %s', async failure => {
    jest.useFakeTimers();
    const { component, frame, emitted } = forced(() => {
      if (failure === 'throw') throw new Error('mint failed');
      return new Promise<string>(() => undefined);
    });
    const loading = component.componentDidLoad();
    if (failure === 'timeout') jest.advanceTimersByTime(30 * 1000);
    await loading;
    expect(frame().loads).toEqual([]);
    expect(emitted.map(e => e.reason)).toEqual(['token-callback-failed', 'iframe-auth-failed']);
    expect(emitted[0].error).toBeInstanceOf(Error);
  });

  it('refuses a tokenless loadFrame() and never writes src', () => {
    const { component, frame } = forced(() => 'token');
    expect(component.loadFrame()).toBe(false);
    expect(frame().src).toBe('');
    expect(frame().loads).toEqual([]);
  });

  it.each(['missing iframe', 'missing window', 'navigation throws'])('reports %s as iframe-auth-failed and keeps no token', async failure => {
    const { component, frame, emitted } = forced(() => 'token');
    if (failure === 'missing iframe') component.iframe = () => null;
    if (failure === 'missing window') frame().contentWindow = null;
    if (failure === 'navigation throws')
      frame().contentWindow.location.replace = () => {
        throw new Error('blocked');
      };
    await component.componentDidLoad();
    expect(emitted.map(e => e.reason)).toEqual(['iframe-auth-failed']);
    expect(component.token).toBeNull();
    expect(component.tokenMode).toBe(false);
  });

  it('reload() retries after a failed start', async () => {
    const getToken = jest.fn().mockReturnValueOnce(null).mockReturnValue('recovered');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    await component.reloadIframe();
    expectTokenLoad(frame().loads[0], 'recovered');
  });

  it('keeps the policy it mounted with when initialize() later drops forceTokenAuth', async () => {
    const getToken = jest.fn(() => 'jwt-a');
    const { component, frame } = forced(getToken);
    (window as any).skyslope.widget.initialize({ getToken });
    expect((window as any).skyslope.widget.forceTokenAuth).toBe(false);
    await component.componentDidLoad();
    expectTokenLoad(frame().loads[0], 'jwt-a');
  });
});

describe('forced mode: forms-auth-failed (C4)', () => {
  it('answers with a fresh getToken and a reload that carries the new token', async () => {
    const getToken = jest.fn().mockReturnValueOnce('token-1').mockReturnValue('token-2');
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expect(getToken).toHaveBeenCalledTimes(2);
    expectTokenLoad(frame().loads[1], 'token-2');
    expect(emitted).toEqual([]);
  });

  it('reports instead of looping when Forms refuses the reload token too', async () => {
    const getToken = jest.fn(() => 'bad-token');
    const { component, frame, frames, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    const usedFrame = frame();
    component.handleMessage(message(usedFrame, { status: 'forms-auth-failed' }));
    await settle();
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
    // Failing closed blanks the frame that had Forms in it.
    expect(frames).toHaveLength(2);
    expect(frame().loads).toEqual([]);
  });

  it('reloads again for a later forms-auth-failed once Forms reported a live session', async () => {
    const getToken = jest.fn().mockReturnValueOnce('t1').mockReturnValueOnce('t2').mockReturnValue('t3');
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    component.handleMessage(message(frame(), { status: 'forms-session-expiry', exp: Math.floor(Date.now() / 1000) + 3600 }));
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expectTokenLoad(frame().loads[2], 't3');
    expect(emitted).toEqual([]);
  });

  it('reloads again after a successful token install answer', async () => {
    const getToken = jest.fn().mockReturnValueOnce('t1').mockReturnValueOnce('t2').mockReturnValue('t3');
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    component.handleMessage(message(frame(), { status: 'forms-token-installed', ok: true, exp: Math.floor(Date.now() / 1000) + 3600 }));
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expectTokenLoad(frame().loads[2], 't3');
    expect(emitted).toEqual([]);
  });

  it('gives a host reload() a fresh automatic retry', async () => {
    const getToken = jest.fn().mockReturnValueOnce('t1').mockReturnValueOnce('t2').mockReturnValueOnce('t3').mockReturnValue('t4');
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    await component.reloadIframe();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expectTokenLoad(frame().loads[3], 't4');
    expect(emitted).toEqual([]);
  });

  it('lets the clear decide the outcome when the old page asks for a token mid-clear', async () => {
    let answer: (app: string | null) => void;
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue(null);
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = () => new Promise(r => (answer = r));
    const clearing = component.clearToken();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    answer(null);
    await clearing;
    await settle();
    expect(emitted).toEqual([{ reason: 'token-clear-failed' }]);
  });

  it('blanks the frame and reports when getToken has no token for the reload', async () => {
    const getToken = jest.fn().mockReturnValueOnce('t1').mockReturnValue(null);
    const { component, frame, frames, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
    expect(frames).toHaveLength(2);
    expect(frame().loads).toEqual([]);
    expect(frame().src).toBe('');
  });

  it('ignores forms-auth-failed from the old page while a clear is running', async () => {
    let answer: (app: string | null) => void;
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = () => new Promise(r => (answer = r));
    const clearing = component.clearToken();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expect(getToken).toHaveBeenCalledTimes(1);
    answer('forms');
    await clearing;
    expect(getToken).toHaveBeenCalledTimes(2);
  });
});

describe('forced mode: clearToken() and user switch', () => {
  it('asks Forms to clear at its exact origin, swaps in a blank frame, then loads the new user', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frames, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    const oldFrame = frame();
    const clearing = component.clearToken();
    await settle();
    expect(oldFrame.contentWindow.postMessage).toHaveBeenCalledWith({ status: 'forms-clear-token' }, FORMS_ORIGIN);
    expect(oldFrame.contentWindow.postMessage).toHaveBeenCalledWith({ status: 'digisign-clear-token' }, DIGISIGN_ORIGIN);
    component.handleMessage(message(oldFrame, { status: 'forms-token-cleared', ok: true }));
    await clearing;
    expect(frames).toHaveLength(2);
    expect(oldFrame.loads).toHaveLength(1);
    expect(frame().loads).toHaveLength(1);
    expectTokenLoad(frame().loads[0], 'user-b');
    expect(emitted).toEqual([]);
  });

  it('ignores messages from the old frame after the switch', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    const oldFrame = frame();
    component.askFrameToClear = async () => 'forms';
    await component.clearToken();
    component.handleMessage(message(oldFrame, { status: 'forms-auth-failed' }));
    await settle();
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it.each(['digisign', null])('still loads the new user when %p answered instead of Forms (the new token replaces the stored session)', async answer => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = async () => answer;
    await component.clearToken();
    expectTokenLoad(frame().loads[0], 'user-b');
    expect(emitted).toEqual([]);
  });

  it('after a sign-out Forms confirmed, stays blank and reports iframe-auth-failed', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue(null);
    const { component, frames, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = async () => 'forms';
    await component.clearToken();
    expect(frames).toHaveLength(2);
    expect(frame().loads).toEqual([]);
    expect(frame().src).toBe('');
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('after a sign-out Forms did not confirm, stays blank and reports token-clear-failed', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue(null);
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = async () => null;
    await component.clearToken();
    expect(frame().loads).toEqual([]);
    expect(emitted).toEqual([{ reason: 'token-clear-failed' }]);
  });

  it('switching before the first token cancels it, skips the handshake and loads the new user', async () => {
    let finishOld: (token: string) => void;
    const getToken = jest
      .fn()
      .mockImplementationOnce(() => new Promise(r => (finishOld = r)))
      .mockReturnValue('user-b');
    const { component, frame, emitted } = forced(getToken);
    component.askFrameToClear = jest.fn();
    const initial = component.componentDidLoad();
    await component.clearToken();
    finishOld('user-a');
    await initial;
    expect(component.askFrameToClear).not.toHaveBeenCalled();
    expect(frame().loads).toHaveLength(1);
    expectTokenLoad(frame().loads[0], 'user-b');
    expect(emitted).toEqual([]);
  });

  it('a second clear during the first one getToken drops the stale token', async () => {
    let finishStale: (token: string) => void;
    const getToken = jest
      .fn()
      .mockReturnValueOnce('user-a')
      .mockImplementationOnce(() => new Promise(r => (finishStale = r)))
      .mockReturnValue('user-c');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = async () => 'forms';
    const first = component.clearToken();
    await settle(20);
    expect(getToken).toHaveBeenCalledTimes(2);
    const second = component.clearToken();
    finishStale('user-b');
    await Promise.all([first, second]);
    expect(frame().loads.some(url => url.includes('user-b'))).toBe(false);
    expectTokenLoad(frame().loads[frame().loads.length - 1], 'user-c');
  });

  it('overlapping clears share one handshake and fetch one token', async () => {
    let answer: (app: string) => void;
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = jest.fn(() => new Promise(r => (answer = r)));
    const first = component.clearToken();
    const second = component.clearToken();
    answer('forms');
    await Promise.all([first, second]);
    expect(component.askFrameToClear).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(frame().loads).toHaveLength(1);
  });

  it('a reload during the clear handshake loads after it, so the frame is not left blank', async () => {
    let answer: (app: string) => void;
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = () => new Promise(r => (answer = r));
    const clearing = component.clearToken();
    const reloading = component.reloadIframe();
    await settle();
    answer('forms');
    await Promise.all([clearing, reloading]);
    expect(frame().loads).toHaveLength(1);
    expectTokenLoad(frame().loads[0], 'user-b');
  });
});

describe('forced mode: sign-out inside the frame', () => {
  it('blanks the frame, reports signed-out, and does not sign the user back in', async () => {
    const getToken = jest.fn(() => 'user-a');
    const { component, frame, frames, emitted } = forced(getToken);
    await component.componentDidLoad();
    const oldFrame = frame();
    component.handleMessage(message(oldFrame, { status: 'forms-signed-out' }));
    component.handleMessage(message(oldFrame, { status: 'forms-auth-failed' }));
    await settle();
    expect(emitted).toEqual([{ reason: 'signed-out' }]);
    expect(frames).toHaveLength(2);
    expect(frame().loads).toEqual([]);
    expect(getToken).toHaveBeenCalledTimes(1);
  });
});

describe('forced mode: detach and reattach (bot findings on #44)', () => {
  it('a clear interrupted by detach does not block a clear after reattach (cursor 4492244414)', async () => {
    let answerOld: (app: string | null) => void;
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = () => new Promise(r => (answerOld = r));
    const oldClear = component.clearToken();
    component.disconnectedCallback();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    const reconnect = component.connectedCallback();
    const newClear = component.clearToken();
    answerOld(null);
    await Promise.all([oldClear, reconnect, newClear]);
    expectTokenLoad(frame().loads[frame().loads.length - 1], 'user-b');
    expect(component.forcedClearing).toBeNull();
  });

  it('does not ask a detached frame to clear', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    component.disconnectedCallback();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    component.askFrameToClear = jest.fn(async () => 'forms');
    await component.clearToken();
    expect(component.askFrameToClear).not.toHaveBeenCalled();
    expectTokenLoad(frame().loads[frame().loads.length - 1], 'user-b');
  });

  it('a reload after a detached clear handshake still lands in a frame (no stuck clear)', async () => {
    jest.useFakeTimers();
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    const clearing = component.clearToken();
    component.disconnectedCallback();
    jest.advanceTimersByTime(3000);
    await clearing;
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    await component.connectedCallback();
    expectTokenLoad(frame().loads[frame().loads.length - 1], 'user-b');
  });

  it('waits for a frame replacement queued before detach, then loads into the new frame (codex 4492282265)', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValueOnce(null).mockReturnValue('user-b');
    const harness = forced(getToken);
    const { component, frames } = harness;
    await component.componentDidLoad();
    harness.autoRender = false;
    // A failed navigation blanks the frame; detach before Stencil renders the replacement.
    await component.navigateTo();
    expect(component.frameReplaced).not.toBeNull();
    component.disconnectedCallback();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    const reconnect = component.connectedCallback();
    await settle();
    // Nothing loads into the frame that is about to be replaced.
    expect(frames[0].loads).toHaveLength(1);
    harness.render();
    await reconnect;
    expect(frames).toHaveLength(2);
    expectTokenLoad(frames[1].loads[0], 'user-b');
  });
});

describe('forced mode: DigiSign hand-off keeps using host tokens', () => {
  it('answers digisign-auth-required with a host token at the DigiSign origin', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-a2');
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'digisign-auth-required' }, DIGISIGN_ORIGIN));
    await settle();
    expect(frame().contentWindow.postMessage).toHaveBeenCalledWith({ status: 'digisign-set-token', token: 'user-a2' }, DIGISIGN_ORIGIN);
  });
});

// Mounted through Stencil, so the iframe really is replaced by a keyed re-render.
describe('forced mode: real render', () => {
  it('renders a blank iframe and replaces the element on a clear', async () => {
    const page = await newSpecPage({ components: [SsContainerInline], html: '' });
    const widget = new SkySlopeWidget();
    widget.initialize({ forceTokenAuth: true, getToken: () => null });
    (window as any).skyslope = { widget };
    await page.setContent('<ss-container-inline></ss-container-inline>');
    const component = page.rootInstance as any;
    const oldFrame = page.root.shadowRoot.querySelector('iframe');
    expect(oldFrame.hasAttribute('src')).toBe(false);
    component.frameUsed = true;
    component.askFrameToClear = async () => 'forms';
    const clearing = component.clearToken();
    await settle();
    await page.waitForChanges();
    await clearing;
    const newFrame = page.root.shadowRoot.querySelector('iframe');
    expect(newFrame).not.toBe(oldFrame);
    expect(newFrame.hasAttribute('src')).toBe(false);
    await page.setContent('');
  });

  it('starts sign-in again when the same element is detached and reattached', async () => {
    const page = await newSpecPage({ components: [SsContainerInline], html: '' });
    const getToken = jest.fn(() => null);
    const widget = new SkySlopeWidget();
    widget.initialize({ forceTokenAuth: true, getToken });
    (window as any).skyslope = { widget };
    await page.setContent('<ss-container-inline></ss-container-inline>');
    const element = page.root;
    await settle();
    expect(getToken).toHaveBeenCalledTimes(1);
    element.remove();
    await page.waitForChanges();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    page.body.appendChild(element);
    await page.waitForChanges();
    await settle();
    expect(getToken).toHaveBeenCalledTimes(2);
    element.remove();
    await page.waitForChanges();
  });
});
