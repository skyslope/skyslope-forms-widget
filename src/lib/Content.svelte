<!--<svelte:options tag="skyslope-modal" />-->

<script>
	import Modal from 'svelte-simple-modal';
	import CloseButton from './CloseButton.svelte';
	import ModalContent from './ModalContent.svelte';
</script>

<Modal styleWindow={{ width: '100%' }} closeButton={CloseButton}><ModalContent /></Modal>
