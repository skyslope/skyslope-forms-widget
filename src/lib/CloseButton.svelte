<script>
	// This property is used by Modal.svelte to pass down the close function
	export let onClose;
</script>

<div style="position: absolute; top: -3rem; right: 0;">
	<button class="material-icons close-button" on:click={onClose} style="">X</button>
</div>
