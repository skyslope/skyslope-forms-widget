<script>
	import IconButton, { Icon } from '@smui/icon-button';
	// This property is used by Modal.svelte to pass down the close function
	export let onClose;
</script>

<div style="position: absolute; top: -3rem; right: 0;">
	<IconButton class="material-icons close-button" on:click={onClose} style="">
		close
	</IconButton>
</div>
