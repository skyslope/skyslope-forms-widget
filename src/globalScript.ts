import {OpenModalProps} from "./window";
import {SkyslopePaths} from "./components/ss-container-inline/types";

export default function () {
  const openModal = ({
                       open,
                       shouldConstrainMaxWidth,
                       showHeaderButtons,
                       showOverlay,
                       styleOverrides,
                       roundedEdges
                     }: OpenModalProps = {
    open: true,
    shouldConstrainMaxWidth: true,
    roundedEdges: true,
    styleOverrides: {},
    showOverlay: true,
    showHeaderButtons: true
  }) => {
    const skyslopeForms = document.createElement('ss-container-modal');
    skyslopeForms.open = open;
    skyslopeForms.shouldConstrainMaxWidth = shouldConstrainMaxWidth;
    skyslopeForms.showHeaderButtons = showHeaderButtons;
    skyslopeForms.showOverlay = showOverlay;
    skyslopeForms.styleOverrides = styleOverrides;
    skyslopeForms.roundedEdges = roundedEdges;

    document.body.appendChild(skyslopeForms);
  };

  const closeModal = () => {
    const skyslopeForms = document.querySelector('ss-container-modal');

    if (skyslopeForms) {
      skyslopeForms.remove();
    }
  };

  const navigateTo = (path) => {
    console.log('navigateTo 1')

    window.skyslope.path = path;
  }

  window.skyslope = {
    openModal,
    closeModal,
    path: window?.skyslope?.path ?? '',
    // If skyslope-container-inline is rendered, the below functions are overwritten
    reload: () => {
    },
    navigateTo,
    navigateToCreateTransaction: () => navigateTo(SkyslopePaths.CreateTransaction),
    navigateToCreateListing: () => navigateTo(SkyslopePaths.CreateListing),
    navigateToBrowseLibraries: () => navigateTo(SkyslopePaths.BrowseLibraries),
    navigateToViewAllFiles: () => navigateTo(SkyslopePaths.ViewFiles),
  };
}
