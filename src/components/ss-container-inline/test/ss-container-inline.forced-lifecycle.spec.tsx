import { newSpecPage } from '@stencil/core/testing';
import { Env } from '@stencil/core';
import { SsContainerInline } from '../ss-container-inline';
import { SkySlopeWidget } from '../../../globalScript';

Env.formsUrl = Env.formsUrl ?? 'http://localhost:3001/';
Env.digisignUrl = Env.digisignUrl ?? 'http://localhost:3000/';

it('replaces the iframe on confirmed forced clear and rejects messages from the old frame', async () => {
  const page = await newSpecPage({ components: [SsContainerInline], html: '' });
  const widget = new SkySlopeWidget();
  widget.initialize({ forceTokenAuth: true, getToken: () => null });
  (window as any).skyslope = { widget };
  await page.setContent('<ss-container-inline></ss-container-inline>');
  const component = page.rootInstance as any;
  const oldFrame = page.root.shadowRoot.querySelector('iframe');
  expect(oldFrame.hasAttribute('src')).toBe(false);
  const oldWindow = {};
  Object.defineProperty(oldFrame, 'contentWindow', { value: oldWindow, configurable: true });
  component.askFrameToClear = async () => 'forms';
  const clearing = component.clearToken();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await page.waitForChanges();
  await clearing;
  const newFrame = page.root.shadowRoot.querySelector('iframe');
  expect(newFrame).not.toBe(oldFrame);
  expect(newFrame.hasAttribute('src')).toBe(false);
  const newWindow = {};
  Object.defineProperty(newFrame, 'contentWindow', { value: newWindow, configurable: true });
  const handler = jest.spyOn(component, 'handleAuthFailed');
  component.handleMessage({ source: oldWindow, origin: new URL(Env.formsUrl).origin, data: { status: 'forms-auth-failed' } });
  expect(handler).not.toHaveBeenCalled();
  component.handleMessage({ source: newWindow, origin: new URL(Env.formsUrl).origin, data: { status: 'forms-auth-failed' } });
  expect(handler).toHaveBeenCalledTimes(1);
  await page.setContent('');
});
