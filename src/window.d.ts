import {SkySlopeWidget} from "./globalScript";

export interface ModalProps {
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

export interface SkyslopeConfig {
  idp: string;
  openInline?: boolean;
}

declare global {
  interface Window {
    skyslope?: {
      widget?: SkySlopeWidget;
      onLoad?: () => void
    }
    // skyslopeOnLoad: () => void;
    // skyslope: {
    //   initialize: (config: SkyslopeConfig) => void;
    //   openModal: (modalProps?: ModalProps) => void;
    //   closeModal: () => void;
    //   reload: () => void;
    //   navigateTo: (path: string) => void;
    //   navigateToCreateListing: () => void;
    //   navigateToCreateTransaction: () => void;
    //   navigateToBrowseLibraries: () => void;
    //   navigateToViewAllFiles: () => void;
    // };
  }
}

export default Window;
