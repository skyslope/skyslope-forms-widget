export default function() {
  const openModal = () => {
    const skyslopeForms = document.createElement('ss-container-modal');
    // @ts-ignore
    skyslopeForms.open = true;

    document.body.appendChild(skyslopeForms);
  };

  const closeModal = () => {
    const skyslopeForms = document.querySelector('ss-container-modal');

    if (skyslopeForms) {
      skyslopeForms.remove();
    }
  };

// Define the `skyslope` object on the global `window` object
  window.skyslope = {
    openModal,
    closeModal,
    reload: () => {},
    navigateTo: () => {},
  };
}
