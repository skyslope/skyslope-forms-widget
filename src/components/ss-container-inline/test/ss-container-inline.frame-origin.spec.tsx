// Import the testing entry so the mock `window` global is installed.
import '@stencil/core/testing';
import { Env } from '@stencil/core';
import { SsContainerInline } from '../ss-container-inline';

// `stencil test` injects Env from stencil.config; under raw jest it is empty, so set a formsUrl here.
Env.formsUrl = Env.formsUrl ?? 'http://localhost:3001/';
// Run locally with: npx jest ss-container-inline.frame-origin.spec --preset @stencil/core/testing --testRunner jest-jasmine2

function stubWidget(path = '') {
  (window as any).skyslope = {
    widget: {
      path,
      idp: null,
      headerVariant: null,
      registerReload: () => undefined,
      registerNavigateTo: () => undefined,
    },
  };
}

describe('ss-container-inline frameOrigin (AP-3436)', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  it('adds ?frameOrigin=<this page origin> to the iframe src', () => {
    stubWidget();
    const url = new URL((new SsContainerInline() as any).getUrl());
    expect(url.searchParams.get('frameOrigin')).toBe(window.location.origin);
  });

  it('sends the same origin it already reports in widgetTrack.widgetOrigin', () => {
    stubWidget('/create');
    const url = new URL((new SsContainerInline() as any).getUrl());
    const widgetTrack = JSON.parse(url.searchParams.get('widgetTrack'));
    expect(url.searchParams.get('frameOrigin')).toBe(widgetTrack.widgetOrigin);
  });

  it('is a query param (reaches the server), not a fragment', () => {
    stubWidget();
    const raw = (new SsContainerInline() as any).getUrl();
    expect(raw).toMatch(/[?&]frameOrigin=/);
    expect(raw).not.toContain('#');
  });

  it('omits frameOrigin when the page has an opaque origin ("null")', () => {
    stubWidget();
    const original = window.location;
    delete (window as any).location;
    (window as any).location = { ...original, origin: 'null' };
    try {
      const url = new URL((new SsContainerInline() as any).getUrl());
      expect(url.searchParams.has('frameOrigin')).toBe(false);
      expect(url.searchParams.has('widgetTrack')).toBe(true);
    } finally {
      (window as any).location = original;
    }
  });

  it('keeps the widget path and the other params intact', () => {
    stubWidget('/create');
    (window as any).skyslope.widget.headerVariant = 'focused';
    const url = new URL((new SsContainerInline() as any).getUrl());
    // Env.formsUrl in this harness ends with '/', so only assert the path suffix
    expect(url.pathname.endsWith('/create')).toBe(true);
    expect(url.searchParams.get('headerVariant')).toBe('focused');
    expect(url.searchParams.has('widgetTrack')).toBe(true);
  });
});
