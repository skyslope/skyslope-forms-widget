import {ModalProps, SkyslopeConfig} from "./window";
import {SkyslopePaths} from "./components/ss-container-inline/types";

export class SkySlopeWidget {
  private _path: string;
  private _idp: string;
  private _openInline: boolean;

  constructor() {
    this._path = '';
  }

  initialize = ({idp, openInline}: SkyslopeConfig) => {
    this._idp = idp;
    this._openInline = openInline;
  };

  openModal = ({
              open,
              shouldConstrainMaxWidth,
              showHeaderButtons,
              showOverlay,
              styleOverrides,
              roundedEdges
            }: ModalProps = {
    open: true,
    shouldConstrainMaxWidth: true,
    roundedEdges: true,
    styleOverrides: {},
    showOverlay: true,
    showHeaderButtons: true
  }) => {
    if(this._idp == null) {
      throw new Error('idp not set')
    }

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

  navigateTo = (path) => {
    console.log('navigateTo 1')

    this._path = path;
  }
  reload= () => {
    // searches for any rendered inline containers, calls refresh() on them
    // const inlineContainer = document.querySelector('ss-container-inline');
  };
  navigateToCreateTransaction= () => this.navigateTo(SkyslopePaths.CreateTransaction);
  navigateToCreateListing= () => this.navigateTo(SkyslopePaths.CreateListing);
  navigateToBrowseLibraries= () => this.navigateTo(SkyslopePaths.BrowseLibraries);
  navigateToViewAllFiles= () =>this. navigateTo(SkyslopePaths.ViewFiles);

  get openInline(): boolean {
    return this._openInline;
  }

  get idp(): string {
    return this._idp;
  }

  get path(): string {
    return this._path;
  }
}


export default function () {
  window.skyslope = new SkySlopeWidget();
  window.skyslopeOnLoad?.();
}
