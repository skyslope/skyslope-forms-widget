
declare global {
  interface Window {
    skyslope: {
      openModal: () => void;
      closeModal: () => void;
      reload: () => void;
      navigateTo: (path: string) => void;
    }
  }
}

export default Window;
