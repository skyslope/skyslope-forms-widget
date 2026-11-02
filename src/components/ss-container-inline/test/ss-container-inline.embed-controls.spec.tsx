// Import the testing entry so the mock `window` global is installed.
import '@stencil/core/testing';
import { Env } from '@stencil/core';
import { SkySlopeWidget } from '../../../globalScript';
import { SsContainerInline } from '../ss-container-inline';

// `stencil test` injects Env from stencil.config; under raw jest it is empty, so set a formsUrl here.
Env.formsUrl = Env.formsUrl ?? 'http://localhost:3001/';

function frameUrlFor(config: Parameters<SkySlopeWidget['initialize']>[0]) {
  const widget = new SkySlopeWidget();
  widget.initialize(config);
  (window as any).skyslope = { widget };
  return new URL((new SsContainerInline() as any).getUrl());
}

describe('ss-container-inline embed controls (AP-4147)', () => {
  afterEach(() => {
    delete (window as any).skyslope;
  });

  it('adds nothing when the host passes no embed controls', () => {
    const url = frameUrlFor({ openInline: true });
    expect(url.searchParams.has('hide')).toBe(false);
    expect(url.searchParams.has('logoClickable')).toBe(false);
  });

  it('sends hidden elements as one comma-separated hide param', () => {
    const url = frameUrlFor({ openInline: true, hide: ['breadcrumb', 'add-forms'] });
    expect(url.searchParams.get('hide')).toBe('breadcrumb,add-forms');
  });

  it('drops values Forms does not know', () => {
    const url = frameUrlFor({ openInline: true, hide: ['breadcrumb', 'left-nav' as any, 'add-forms'] });
    expect(url.searchParams.get('hide')).toBe('breadcrumb,add-forms');
  });

  it('omits hide when no known values remain', () => {
    const url = frameUrlFor({ openInline: true, hide: ['nope' as any] });
    expect(url.searchParams.has('hide')).toBe(false);
  });

  it('ignores a hide that is not an array', () => {
    const url = frameUrlFor({ openInline: true, hide: 'breadcrumb' as any });
    expect(url.searchParams.has('hide')).toBe(false);
  });

  it('sends logoClickable=false only when the host turns the link off', () => {
    expect(frameUrlFor({ openInline: true, logoClickable: false }).searchParams.get('logoClickable')).toBe('false');
    expect(frameUrlFor({ openInline: true, logoClickable: true }).searchParams.has('logoClickable')).toBe(false);
    expect(frameUrlFor({ openInline: true, logoClickable: null }).searchParams.has('logoClickable')).toBe(false);
  });

  it('keeps headerVariant alongside the new params', () => {
    const url = frameUrlFor({ openInline: true, headerVariant: 'focused', hide: ['breadcrumb'], logoClickable: false });
    expect(url.searchParams.get('headerVariant')).toBe('focused');
    expect(url.searchParams.get('hide')).toBe('breadcrumb');
    expect(url.searchParams.get('logoClickable')).toBe('false');
  });
});
