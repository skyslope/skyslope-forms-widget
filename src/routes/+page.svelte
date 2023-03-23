<script>
	import Modal from 'svelte-simple-modal';
	import Content from '$lib/Content.svelte';
	import CloseButton from '$lib/CloseButton.svelte';
</script>

<h1>SkySlope widget demo</h1>

<Modal styleWindow={{width: '100%'}} closeButton={CloseButton}><Content /></Modal>

<style>
    .window {
        width: 100%;
    }
</style>