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
  idp?: string | null;
  openInline?: boolean;
}

declare global {
  interface Window {
    skyslope?: {
      widget?: SkySlopeWidget;
      onLoad?: () => void
    }
  }
}

export default Window;
