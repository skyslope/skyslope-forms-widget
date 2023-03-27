<svelte:options tag="skyslope-modal" />
<script>
    import Modal from "svelte-simple-modal";
    import CloseButton from "$lib/CloseButton.svelte";
    import ModalContent from "$lib/ModalContent.svelte";
</script>

<Modal styleWindow={{width: '100%'}} closeButton={CloseButton}><ModalContent/></Modal>

