// Import the testing entry so the mock `window` global is installed.
import { newSpecPage } from '@stencil/core/testing';
import { Env } from '@stencil/core';
import { SsContainerInline } from '../ss-container-inline';
import { SkySlopeWidget, resetForceTokenAuthForTests } from '../../../globalScript';
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
  resetForceTokenAuthForTests();
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
    // Every forced load goes into a fresh frame, so collect the loads across all of them.
    allLoads: () => frames.flatMap(f => f.loads),
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
  resetForceTokenAuthForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
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
    const { component, frames, frame } = forced(getToken);
    await component.componentDidLoad();
    const first = frame();
    await component.reloadIframe();
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(first.contentWindow.postMessage).not.toHaveBeenCalledWith('reload', expect.anything());
    // A fresh frame, so Forms boots again even if only the fragment changed.
    expect(frames).toHaveLength(2);
    expect(first.loads).toHaveLength(1);
    expectTokenLoad(frame().loads[0], 'token-a2');
  });

  it('navigateTo() fetches a fresh token and loads the new path with it', async () => {
    const getToken = jest.fn().mockReturnValueOnce('token-a').mockReturnValue('token-a2');
    const { component, frame } = forced(getToken);
    component.connectedCallback();
    await component.componentDidLoad();
    await (window as any).skyslope.widget.navigateTo('files#section');
    await settle();
    expect(getToken).toHaveBeenCalledTimes(2);
    const url = new URL(frame().loads[0]);
    expect(url.pathname.endsWith('/files')).toBe(true);
    // The token owns the whole fragment, even when the path brought its own.
    expectTokenLoad(frame().loads[0], 'token-a2');
    component.disconnectedCallback();
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

  it('stays forced for the page when initialize() later drops forceTokenAuth', async () => {
    const getToken = jest.fn(() => 'jwt-a');
    const { component, frame } = forced(getToken);
    (window as any).skyslope.widget.initialize({ getToken });
    // Sticky for the page: a later initialize() without it does not switch back to the cookie.
    expect((window as any).skyslope.widget.forceTokenAuth).toBe(true);
    await component.componentDidLoad();
    expectTokenLoad(frame().loads[0], 'jwt-a');
  });
});

describe('forced mode: forms-auth-failed (C4)', () => {
  it('answers with a fresh getToken and a reload that carries the new token', async () => {
    const getToken = jest.fn().mockReturnValueOnce('token-1').mockReturnValue('token-2');
    const { component, frame, frames, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(frames).toHaveLength(2);
    expectTokenLoad(frame().loads[0], 'token-2');
    expect(emitted).toEqual([]);
  });

  it('reports instead of looping when Forms refuses the reload token too', async () => {
    const getToken = jest.fn(() => 'bad-token');
    const { component, frame, frames, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    // The retry frame reports a live session, then fails again: still inside the window.
    component.handleMessage(message(frame(), { status: 'forms-session-expiry', exp: Math.floor(Date.now() / 1000) + 3600 }));
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
    // Failing closed blanks the frame that had Forms in it.
    expect(frames).toHaveLength(3);
    expect(frame().loads).toEqual([]);
  });

  it('reloads again for a forms-auth-failed more than a minute after the last automatic reload', async () => {
    const getToken = jest.fn().mockReturnValueOnce('t1').mockReturnValueOnce('t2').mockReturnValue('t3');
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    now += 60 * 1000;
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expectTokenLoad(frame().loads[0], 't3');
    expect(emitted).toEqual([]);
  });

  it('ignores a repeat forms-auth-failed from the old page while the retry is pending', async () => {
    let finish: (token: string) => void;
    const getToken = jest
      .fn()
      .mockReturnValueOnce('t1')
      .mockImplementationOnce(() => new Promise(r => (finish = r)));
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    const oldFrame = frame();
    component.handleMessage(message(oldFrame, { status: 'forms-auth-failed' }));
    component.handleMessage(message(oldFrame, { status: 'forms-auth-failed' }));
    finish('t2');
    await settle();
    expectTokenLoad(frame().loads[0], 't2');
    expect(emitted).toEqual([]);
  });

  it('gives a host reload() a fresh automatic retry', async () => {
    const getToken = jest.fn().mockReturnValueOnce('t1').mockReturnValueOnce('t2').mockReturnValueOnce('t3').mockReturnValue('t4');
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    await component.reloadIframe();
    await settle();
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expectTokenLoad(frame().loads[0], 't4');
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

  it('a reload during the clear handshake loads the next user, so the frame is not left blank', async () => {
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

describe('forced mode: review fixes', () => {
  it('a container mounted after a close stays forced even if the host forgot forceTokenAuth', async () => {
    const getToken = jest.fn(() => 'user-b');
    const { component } = forced(getToken);
    component.connectedCallback();
    component.disconnectedCallback();
    // The close reset every setting; the host reopens with getToken only.
    (window as any).skyslope.widget.initialize({ getToken });
    const next = new SsContainerInline() as any;
    next.componentWillLoad();
    expect(next.forceTokenAuth).toBe(true);
    expect(next.render().$children$[0].$attrs$.src).toBeUndefined();
  });

  it.each(['digisign-auth-required', 'forms-session-expiry'])('gives the old page no token during the clear handshake (%s)', async status => {
    let answer: (app: string | null) => void;
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    const oldFrame = frame();
    component.askFrameToClear = () => new Promise(r => (answer = r));
    const clearing = component.clearToken();
    if (status === 'digisign-auth-required') component.handleMessage(message(oldFrame, { status }, DIGISIGN_ORIGIN));
    else component.handleMessage(message(oldFrame, { status, exp: Math.floor(Date.now() / 1000) + 3600, sessionless: true }));
    await settle();
    // A host refreshToken() must not hand the new user's token to the old page either.
    await component.renewNow();
    const sentTokens = oldFrame.contentWindow.postMessage.mock.calls.filter(([m]) => m?.token != null);
    expect(sentTokens).toEqual([]);
    answer('forms');
    await clearing;
    expectTokenLoad(frame().loads[0], 'user-b');
    expect(emitted).toEqual([]);
  });

  it('a reload during the clear handshake replaces the old page at once', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component, frames, frame } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = () => new Promise(() => undefined);
    void component.clearToken();
    await component.reloadIframe();
    expect(frames).toHaveLength(2);
    expectTokenLoad(frame().loads[0], 'user-b');
  });

  it('hides the frame while a clear waits for Forms, and shows the replacement', async () => {
    let answer: (app: string | null) => void;
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = () => new Promise(r => (answer = r));
    const clearing = component.clearToken();
    expect(component.render().$children$[0].$attrs$.style.visibility).toBe('hidden');
    answer('forms');
    await clearing;
    expect(component.render().$children$[0].$attrs$.style.visibility).toBeUndefined();
  });

  it('shows the frame again after a clear cut short by a detach', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    let answer: (app: string | null) => void;
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = () => new Promise(r => (answer = r));
    const clearing = component.clearToken();
    component.disconnectedCallback();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    const reconnect = component.connectedCallback();
    answer(null);
    await Promise.all([clearing, reconnect]);
    expectTokenLoad(frame().loads[frame().loads.length - 1], 'user-b');
    expect(component.render().$children$[0].$attrs$.style.visibility).toBeUndefined();
  });

  it('the default path renders the iframe style unchanged', () => {
    const { component } = forced(() => 'token', { force: false });
    component.componentWillLoad();
    expect(component.render().$children$[0].$attrs$.style).toEqual({ backgroundColor: '#f4f8fc' });
  });

  it('a sign-out clear with no live frame after a session reports token-clear-failed', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue(null);
    const { component, emitted } = forced(getToken);
    await component.componentDidLoad();
    // The frame lost its page (detached), so nobody can confirm the clear.
    component.disconnectedCallback();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    component.askFrameToClear = jest.fn();
    await component.clearToken();
    expect(component.askFrameToClear).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ reason: 'token-clear-failed' }]);
  });

  it('a load superseded while it waits for the replacement frame never lands', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValueOnce('stale').mockReturnValue('latest');
    const harness = forced(getToken);
    const { component, frames } = harness;
    await component.componentDidLoad();
    harness.autoRender = false;
    const first = component.navigateTo();
    await settle();
    expect(getToken).toHaveBeenCalledTimes(2);
    const second = component.navigateTo();
    await settle();
    harness.render();
    await Promise.all([first, second]);
    const loads = harness.allLoads();
    expect(loads.some(url => url.includes('stale'))).toBe(false);
    // Only the latest navigation loads, once.
    expect(frames[frames.length - 1].loads).toHaveLength(1);
    expectTokenLoad(frames[frames.length - 1].loads[0], 'latest');
  });
});

describe('forced mode: review round 2 fixes', () => {
  // A second component on the same page, sharing the module state of the first.
  function secondContainer(getToken: GetToken | null) {
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    const component = new SsContainerInline() as any;
    const emitted: Array<{ reason: string; error?: unknown }> = [];
    component.authError = { emit: (detail: any) => emitted.push(detail) };
    const frame = newFrame();
    component.iframe = () => frame;
    component.componentWillLoad();
    return { component, emitted, frame };
  }

  it('a default container reattached after the page turned on forceTokenAuth reloads in forced mode', async () => {
    const getToken = jest.fn(() => 'user-b');
    const { component, frames, frame } = forced(getToken, { force: false });
    component.connectedCallback();
    await component.componentDidLoad();
    expect(component.forceTokenAuth).toBe(false);
    component.disconnectedCallback();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    await component.connectedCallback();
    await settle();
    expect(component.forceTokenAuth).toBe(true);
    // The cookie page's frame is swapped out, and the new one loads with a token.
    expect(frames).toHaveLength(2);
    expectTokenLoad(frame().loads[0], 'user-b');
    expect(component.render().$children$[0].$attrs$.src).toBeUndefined();
  });

  it.each(['reloadIframe', 'navigateTo'])('a default container switches to forced mode on %s once the page turned it on', async method => {
    const getToken = jest.fn(() => 'user-b');
    const { component, frames, frame } = forced(getToken, { force: false });
    await component.componentDidLoad();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    await component[method]();
    await settle();
    expect(frames).toHaveLength(2);
    expectTokenLoad(frame().loads[0], 'user-b');
  });

  it('a default container switches to the forced clear once the page turned on forceTokenAuth', async () => {
    const getToken = jest.fn(() => 'user-b');
    const { component, frames, frame } = forced(getToken, { force: false });
    await component.componentDidLoad();
    const cookieFrame = frame();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    component.askFrameToClear = jest.fn(async () => 'forms');
    await component.clearToken();
    expect(component.askFrameToClear).toHaveBeenCalledTimes(1);
    expect(cookieFrame.src).toBe('');
    expect(frames).toHaveLength(2);
    expectTokenLoad(frame().loads[0], 'user-b');
  });

  it('a detach ends the clear handshake, so the reattached frame still gets its C4 reload', async () => {
    jest.useFakeTimers();
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValueOnce('user-b').mockReturnValue('user-b2');
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    let cleared = false;
    const clearing = component.clearToken().then(() => (cleared = true));
    component.disconnectedCallback();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    await component.connectedCallback();
    await settle(30);
    // No waiting out the 3 s timeout: the frame that was asked is gone.
    expect(cleared).toBe(true);
    await clearing;
    expect(component.forcedClearing).toBeNull();
    const calls = getToken.mock.calls.length;
    component.handleMessage(message(frame(), { status: 'forms-auth-failed' }));
    await settle();
    expect(getToken.mock.calls.length).toBe(calls + 1);
    expect(emitted).toEqual([]);
  });

  it('a reload during the clear handshake ends the wait at once', async () => {
    jest.useFakeTimers();
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue('user-b');
    const { component } = forced(getToken);
    await component.componentDidLoad();
    let done = false;
    const clearing = component.clearToken().then(() => (done = true));
    await component.reloadIframe();
    await settle(30);
    expect(done).toBe(true);
    await clearing;
  });

  it('an earlier clearToken() resolves only after the latest one has loaded the next user', async () => {
    let answer: (app: string) => void;
    let finish: (token: string) => void;
    const getToken = jest
      .fn()
      .mockReturnValueOnce('user-a')
      .mockImplementation(() => new Promise(r => (finish = r)));
    const { component, frame } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = () => new Promise(r => (answer = r));
    let firstDone = false;
    const first = component.clearToken().then(() => (firstDone = true));
    const second = component.clearToken();
    answer('forms');
    await settle(30);
    expect(firstDone).toBe(false);
    finish('user-c');
    await Promise.all([first, second]);
    expectTokenLoad(frame().loads[0], 'user-c');
  });

  it('a new container knows an earlier one left a session nobody cleared', async () => {
    const { component } = forced(() => 'user-a');
    await component.componentDidLoad();
    component.disconnectedCallback();
    const next = secondContainer(() => null);
    await next.component.clearToken();
    expect(next.emitted).toEqual([{ reason: 'token-clear-failed' }]);
  });

  it('after an in-frame sign-out, a sign-out clear reports iframe-auth-failed, not token-clear-failed', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue(null);
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.handleMessage(message(frame(), { status: 'forms-signed-out' }));
    await settle();
    await component.clearToken();
    expect(emitted).toEqual([{ reason: 'signed-out' }, { reason: 'iframe-auth-failed' }]);
  });

  it('a second sign-out clear after a confirmed one still reports iframe-auth-failed', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue(null);
    const { component, emitted } = forced(getToken);
    await component.componentDidLoad();
    component.askFrameToClear = async () => 'forms';
    await component.clearToken();
    await component.clearToken();
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }, { reason: 'iframe-auth-failed' }]);
  });

  it('counts a clear answer without ok:true as unconfirmed', async () => {
    const getToken = jest.fn().mockReturnValueOnce('user-a').mockReturnValue(null);
    const { component, frame, emitted } = forced(getToken);
    await component.componentDidLoad();
    const clearing = component.clearToken();
    await settle();
    component.handleMessage(message(frame(), { status: 'forms-token-cleared' }));
    await clearing;
    expect(emitted).toEqual([{ reason: 'token-clear-failed' }]);
  });

  it('treats an empty token as no token', async () => {
    const { component, frame, emitted } = forced(() => '');
    await component.componentDidLoad();
    expect(frame().loads).toEqual([]);
    expect(emitted).toEqual([{ reason: 'iframe-auth-failed' }]);
  });

  it('a moved container reopens at the path it was on', async () => {
    const getToken = jest.fn(() => 'user-a');
    const { component, frame } = forced(getToken);
    component.connectedCallback();
    await component.componentDidLoad();
    await (window as any).skyslope.widget.navigateTo('envelopes/1/fill');
    await settle();
    component.disconnectedCallback();
    (window as any).skyslope.widget.initialize({ forceTokenAuth: true, getToken });
    component.connectedCallback();
    await settle(30);
    const url = new URL(frame().loads[frame().loads.length - 1]);
    expect(url.pathname.endsWith('/envelopes/1/fill')).toBe(true);
    expectTokenLoad(url.toString(), 'user-a');
    component.disconnectedCallback();
  });
});
