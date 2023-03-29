
declare global {
  interface Window {
    skyslope: {
      openModal: () => void;
      closeModal: () => void;
      refreshIframe: () => void;
    }
  }
}

export default Window;
