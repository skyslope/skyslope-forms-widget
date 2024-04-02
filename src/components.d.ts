/* eslint-disable */
/* tslint:disable */
/**
 * This is an autogenerated file created by the Stencil compiler.
 * It contains typing information for all components that exist in this project.
 */
import { HTMLStencilElement, JSXBase } from "@stencil/core/internal";
export namespace Components {
    interface SsButtonBrowseLibraries {
        "unstyled": boolean;
    }
    interface SsButtonCreateListing {
        "unstyled": boolean;
    }
    interface SsButtonStartBuyerAgreement {
        "unstyled": boolean;
    }
    interface SsButtonViewAllFiles {
        "unstyled": boolean;
    }
    interface SsButtonWriteOffer {
        "unstyled": boolean;
    }
    interface SsContainedWidget {
    }
    interface SsContainerInline {
    }
    interface SsContainerModal {
        /**
          * Is refresh button shown (default disabled)
         */
        "isRefreshButtonEnabled": boolean;
        /**
          * Should the modal be open
         */
        "open": boolean;
        /**
          * Should the modal have a rounded edges
         */
        "roundedEdges": boolean;
        /**
          * Should the modal have a maximum width
         */
        "shouldConstrainMaxWidth": boolean;
        /**
          * Should the modal have a rounded edges
         */
        "showHeaderButtons": boolean;
        /**
          * Should the modal have an overlay
         */
        "showOverlay": boolean;
        /**
          * Classes override for custom styling
         */
        "styleOverrides"?: {
    modalWrapper?: { [key: string]: string; };
    modalOverlay?: { [key: string]: string; };
    modalHeader?: { [key: string]: string; };
    modalContent?: { [key: string]: string; };
    maxWidthContainer?: { [key: string]: string; };
  };
    }
    interface SsIconButton {
    }
}
export interface SsContainerModalCustomEvent<T> extends CustomEvent<T> {
    detail: T;
    target: HTMLSsContainerModalElement;
}
declare global {
    interface HTMLSsButtonBrowseLibrariesElement extends Components.SsButtonBrowseLibraries, HTMLStencilElement {
    }
    var HTMLSsButtonBrowseLibrariesElement: {
        prototype: HTMLSsButtonBrowseLibrariesElement;
        new (): HTMLSsButtonBrowseLibrariesElement;
    };
    interface HTMLSsButtonCreateListingElement extends Components.SsButtonCreateListing, HTMLStencilElement {
    }
    var HTMLSsButtonCreateListingElement: {
        prototype: HTMLSsButtonCreateListingElement;
        new (): HTMLSsButtonCreateListingElement;
    };
    interface HTMLSsButtonStartBuyerAgreementElement extends Components.SsButtonStartBuyerAgreement, HTMLStencilElement {
    }
    var HTMLSsButtonStartBuyerAgreementElement: {
        prototype: HTMLSsButtonStartBuyerAgreementElement;
        new (): HTMLSsButtonStartBuyerAgreementElement;
    };
    interface HTMLSsButtonViewAllFilesElement extends Components.SsButtonViewAllFiles, HTMLStencilElement {
    }
    var HTMLSsButtonViewAllFilesElement: {
        prototype: HTMLSsButtonViewAllFilesElement;
        new (): HTMLSsButtonViewAllFilesElement;
    };
    interface HTMLSsButtonWriteOfferElement extends Components.SsButtonWriteOffer, HTMLStencilElement {
    }
    var HTMLSsButtonWriteOfferElement: {
        prototype: HTMLSsButtonWriteOfferElement;
        new (): HTMLSsButtonWriteOfferElement;
    };
    interface HTMLSsContainedWidgetElement extends Components.SsContainedWidget, HTMLStencilElement {
    }
    var HTMLSsContainedWidgetElement: {
        prototype: HTMLSsContainedWidgetElement;
        new (): HTMLSsContainedWidgetElement;
    };
    interface HTMLSsContainerInlineElement extends Components.SsContainerInline, HTMLStencilElement {
    }
    var HTMLSsContainerInlineElement: {
        prototype: HTMLSsContainerInlineElement;
        new (): HTMLSsContainerInlineElement;
    };
    interface HTMLSsContainerModalElement extends Components.SsContainerModal, HTMLStencilElement {
    }
    var HTMLSsContainerModalElement: {
        prototype: HTMLSsContainerModalElement;
        new (): HTMLSsContainerModalElement;
    };
    interface HTMLSsIconButtonElement extends Components.SsIconButton, HTMLStencilElement {
    }
    var HTMLSsIconButtonElement: {
        prototype: HTMLSsIconButtonElement;
        new (): HTMLSsIconButtonElement;
    };
    interface HTMLElementTagNameMap {
        "ss-button-browse-libraries": HTMLSsButtonBrowseLibrariesElement;
        "ss-button-create-listing": HTMLSsButtonCreateListingElement;
        "ss-button-start-buyer-agreement": HTMLSsButtonStartBuyerAgreementElement;
        "ss-button-view-all-files": HTMLSsButtonViewAllFilesElement;
        "ss-button-write-offer": HTMLSsButtonWriteOfferElement;
        "ss-contained-widget": HTMLSsContainedWidgetElement;
        "ss-container-inline": HTMLSsContainerInlineElement;
        "ss-container-modal": HTMLSsContainerModalElement;
        "ss-icon-button": HTMLSsIconButtonElement;
    }
}
declare namespace LocalJSX {
    interface SsButtonBrowseLibraries {
        "unstyled"?: boolean;
    }
    interface SsButtonCreateListing {
        "unstyled"?: boolean;
    }
    interface SsButtonStartBuyerAgreement {
        "unstyled"?: boolean;
    }
    interface SsButtonViewAllFiles {
        "unstyled"?: boolean;
    }
    interface SsButtonWriteOffer {
        "unstyled"?: boolean;
    }
    interface SsContainedWidget {
    }
    interface SsContainerInline {
    }
    interface SsContainerModal {
        /**
          * Is refresh button shown (default disabled)
         */
        "isRefreshButtonEnabled"?: boolean;
        /**
          * Callback when close button clicked  Closing of the modal should happen automatically, but this event will also be called  Call with onCloseClicked (if your app uses JSX) or ```const ssContainerModal = document.querySelector('ss-container-modal'); ssContainerModal.addEventListener('closeClicked', event => {  your listener })```
         */
        "onCloseClicked"?: (event: SsContainerModalCustomEvent<void>) => void;
        /**
          * Callback when refresh button clicked  Refresh will be handled automatically, but this event will also be called  Call with onCloseClicked (if your app uses JSX) or ```const ssContainerModal = document.querySelector('ss-container-modal'); ssContainerModal.addEventListener('refreshClicked', event => {  your listener })```
         */
        "onRefreshClicked"?: (event: SsContainerModalCustomEvent<void>) => void;
        /**
          * Should the modal be open
         */
        "open"?: boolean;
        /**
          * Should the modal have a rounded edges
         */
        "roundedEdges"?: boolean;
        /**
          * Should the modal have a maximum width
         */
        "shouldConstrainMaxWidth"?: boolean;
        /**
          * Should the modal have a rounded edges
         */
        "showHeaderButtons"?: boolean;
        /**
          * Should the modal have an overlay
         */
        "showOverlay"?: boolean;
        /**
          * Classes override for custom styling
         */
        "styleOverrides"?: {
    modalWrapper?: { [key: string]: string; };
    modalOverlay?: { [key: string]: string; };
    modalHeader?: { [key: string]: string; };
    modalContent?: { [key: string]: string; };
    maxWidthContainer?: { [key: string]: string; };
  };
    }
    interface SsIconButton {
    }
    interface IntrinsicElements {
        "ss-button-browse-libraries": SsButtonBrowseLibraries;
        "ss-button-create-listing": SsButtonCreateListing;
        "ss-button-start-buyer-agreement": SsButtonStartBuyerAgreement;
        "ss-button-view-all-files": SsButtonViewAllFiles;
        "ss-button-write-offer": SsButtonWriteOffer;
        "ss-contained-widget": SsContainedWidget;
        "ss-container-inline": SsContainerInline;
        "ss-container-modal": SsContainerModal;
        "ss-icon-button": SsIconButton;
    }
}
export { LocalJSX as JSX };
declare module "@stencil/core" {
    export namespace JSX {
        interface IntrinsicElements {
            "ss-button-browse-libraries": LocalJSX.SsButtonBrowseLibraries & JSXBase.HTMLAttributes<HTMLSsButtonBrowseLibrariesElement>;
            "ss-button-create-listing": LocalJSX.SsButtonCreateListing & JSXBase.HTMLAttributes<HTMLSsButtonCreateListingElement>;
            "ss-button-start-buyer-agreement": LocalJSX.SsButtonStartBuyerAgreement & JSXBase.HTMLAttributes<HTMLSsButtonStartBuyerAgreementElement>;
            "ss-button-view-all-files": LocalJSX.SsButtonViewAllFiles & JSXBase.HTMLAttributes<HTMLSsButtonViewAllFilesElement>;
            "ss-button-write-offer": LocalJSX.SsButtonWriteOffer & JSXBase.HTMLAttributes<HTMLSsButtonWriteOfferElement>;
            "ss-contained-widget": LocalJSX.SsContainedWidget & JSXBase.HTMLAttributes<HTMLSsContainedWidgetElement>;
            "ss-container-inline": LocalJSX.SsContainerInline & JSXBase.HTMLAttributes<HTMLSsContainerInlineElement>;
            "ss-container-modal": LocalJSX.SsContainerModal & JSXBase.HTMLAttributes<HTMLSsContainerModalElement>;
            "ss-icon-button": LocalJSX.SsIconButton & JSXBase.HTMLAttributes<HTMLSsIconButtonElement>;
        }
    }
}
