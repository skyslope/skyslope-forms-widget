/* eslint-disable @stencil-community/strict-boolean-conditions */

import { GetTokenCallback, ModalProps, SkyslopeConfig } from './window';
import { SkyslopePaths } from './components/ss-container-inline/types';

// Kept in module scope so embedding pages get no well-known global to call (see threat model FW-08).
let storedGetToken: GetTokenCallback | null = null;

export function readGetToken(): GetTokenCallback | null {
  return storedGetToken;
}

export class SkySlopeWidget {
  private _path: string;
  private _idp: string | null;
  private _openInline: boolean;
  private _headerVariant: string | null;
  private _reloadCallback: () => void;
  private _navigateCallback: (path: string) => void;
  private _refreshCallback: () => Promise<void>;
  private _clearTokenCallback: () => Promise<void>;

  constructor() {
    this._path = '';
  }

  initialize = ({ idp, openInline, headerVariant, getToken }: SkyslopeConfig = { idp: null, openInline: false, headerVariant: null, getToken: null }) => {
    this._idp = idp ?? null;
    this._openInline = openInline ?? false;
    this._headerVariant = headerVariant ?? null;
    storedGetToken = getToken ?? null;
  };

  openModal = (
    { open, shouldConstrainMaxWidth, showHeaderButtons, showOverlay, styleOverrides, roundedEdges }: ModalProps = {
      open: true,
      shouldConstrainMaxWidth: true,
      roundedEdges: true,
      styleOverrides: {},
      showOverlay: true,
      showHeaderButtons: true,
    },
  ) => {
    const skyslopeForms = document.createElement('ss-container-modal');
    skyslopeForms.open = open;
    skyslopeForms.shouldConstrainMaxWidth = shouldConstrainMaxWidth;
    skyslopeForms.showHeaderButtons = showHeaderButtons;
    skyslopeForms.showOverlay = showOverlay;
    skyslopeForms.styleOverrides = styleOverrides;
    skyslopeForms.roundedEdges = roundedEdges;

    document.body.appendChild(skyslopeForms);
  };

  closeModal = () => {
    const skyslopeForms = document.querySelector('ss-container-modal');

    if (skyslopeForms) {
      skyslopeForms.remove();
    }
  };

  navigateTo = path => {
    this._path = path;
    this._navigateCallback?.(path);
  };
  reload = () => {
    this._reloadCallback?.();
  };
  // Push a fresh token to the app in the frame (Forms, or DigiSign when it is there) by postMessage,
  // not the URL, so it renews in place without a reload. Hosts call this when their token rotates.
  // Does nothing until an inline container is mounted, or on the cookie path.
  refreshToken = async (): Promise<void> => {
    await this._refreshCallback?.();
  };
  // Make the frame forget the user (host sign-out or user switch). Resolves once the reload without
  // a token has started. Does nothing until an inline container is mounted.
  clearToken = async (): Promise<void> => {
    await this._clearTokenCallback?.();
  };
  navigateToCreateTransaction = () => this.navigateTo(SkyslopePaths.CreateTransaction);
  navigateToCreateListing = () => this.navigateTo(SkyslopePaths.CreateListing);
  navigateToBrowseLibraries = () => this.navigateTo(SkyslopePaths.BrowseLibraries);
  navigateToStartBuyerAgreement = () => this.navigateTo(SkyslopePaths.QuickCreateBuyerAgreement);
  navigateToViewAllFiles = () => this.navigateTo(SkyslopePaths.ViewFiles);
  navigateToEnvelope = envelopeId => this.navigateTo(`envelopes/${envelopeId}/fill`);

  registerReload = (reloadCallback: () => void) => {
    if (this._reloadCallback) {
      throw new Error('Reload Callback is already defined. Is more than one inline container running?');
    }
    this._reloadCallback = reloadCallback;
  };

  registerNavigateTo = (navigateCallback: (path: string) => void) => {
    if (this._navigateCallback) {
      throw new Error('Navigate Callback is already defined. Is more than one inline container running?');
    }
    this._navigateCallback = navigateCallback;
  };

  registerRefresh = (refreshCallback: () => Promise<void>) => {
    if (this._refreshCallback) {
      throw new Error('Refresh Callback is already defined. Is more than one inline container running?');
    }
    this._refreshCallback = refreshCallback;
  };

  registerClearToken = (clearTokenCallback: () => Promise<void>) => {
    if (this._clearTokenCallback) {
      throw new Error('Clear Token Callback is already defined. Is more than one inline container running?');
    }
    this._clearTokenCallback = clearTokenCallback;
  };

  get openInline(): boolean {
    return this._openInline;
  }

  get idp(): string {
    return this._idp;
  }

  get path(): string {
    return this._path;
  }

  get headerVariant(): string {
    return this._headerVariant;
  }
}

export default function () {
  storedGetToken = null;
  if (!window.skyslope) window.skyslope = {};
  const onLoad = window.skyslope?.onLoad;
  window.skyslope.widget = new SkySlopeWidget();
  onLoad?.();
}
