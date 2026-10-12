import { SkySlopeWidget } from './globalScript';

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
  headerVariant?: string | null;
  /**
   * Optional callback that returns a SkySlope access token for the current user.
   * When provided, the widget passes the token to the embedded Forms app (in the iframe URL
   * fragment for the first sign-in, by postMessage for renewals and for DigiSign) so it can
   * authenticate without third-party cookies. This is what lets the widget work in Safari (and
   * other cookie-blocking browsers). Called only after the Forms app reports that its cookie
   * sign-in failed. May be sync or async. Returning null on the first sign-in raises authError on
   * the container; during a renewal it is retried once before authError. Passing null
   * here is the same as leaving getToken out.
   */
  getToken?: (() => string | null | Promise<string | null>) | null;
}

declare global {
  interface Window {
    skyslope?: {
      widget?: SkySlopeWidget;
      onLoad?: () => void;
    };
  }
}

export default Window;
