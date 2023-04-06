export interface OpenModalProps {
  /**
   * Should the modal be open
   */
  open: boolean;
  /**
   * Should the modal have a rounded edges
   */
  roundedEdges: boolean;
  /**
   * Should the modal have a maximum width
   */
  shouldConstrainMaxWidth: boolean;
  /**
   * Should the modal have a rounded edges
   */
  showHeaderButtons: boolean;
  /**
   * Should the modal have an overlay
   */
  showOverlay: boolean;
  /**
   * Classes override for custom styling
   */
  styleOverrides?: {
    modalWrapper?: { [key: string]: string };
    modalOverlay?: { [key: string]: string };
    modalHeader?: { [key: string]: string };
    modalContent?: { [key: string]: string };
    maxWidthContainer?: { [key: string]: string };
  };
}

declare global {
  interface Window {
    skyslope: {
      openModal: (config?: OpenModalProps) => void;
      closeModal: () => void;
      reload: () => void;
      path: string;
      navigateTo: (path: string) => void;
      navigateToCreateListing: () => void;
      navigateToCreateTransaction: () => void;
      navigateToBrowseLibraries: () => void;
      navigateToViewAllFiles: () => void;
    };
  }
}

export default Window;
