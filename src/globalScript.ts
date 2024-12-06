/* eslint-disable @stencil-community/strict-boolean-conditions */

import { ModalProps, SkyslopeConfig } from './window';
import { SkyslopePaths } from './components/ss-container-inline/types';

export class SkySlopeWidget {
  private _path: string;
  private _idp: string | null;
  private _openInline: boolean;
  private _headerVariant: string | null;
  private _reloadCallback: () => void;
  private _navigateCallback: (path: string) => void;

  constructor() {
    this._path = '';
  }

  initialize = ({ idp, openInline, headerVariant }: SkyslopeConfig = { idp: null, openInline: false, headerVariant: null }) => {
    this._idp = idp ?? null;
    this._openInline = openInline ?? false;
    this._headerVariant = headerVariant ?? null;
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
  if (!window.skyslope) window.skyslope = {};
  const onLoad = window.skyslope?.onLoad;
  window.skyslope.widget = new SkySlopeWidget();
  onLoad?.();
}
