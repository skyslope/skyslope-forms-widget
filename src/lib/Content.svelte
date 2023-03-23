<script>
    import { getContext } from 'svelte';
    import Popup from './Popup.svelte';
    const { open } = getContext('simple-modal');
    const showSurprise = () => open(Popup, { message: "It's a modal!" });
</script>

<p><button on:click={showSurprise}>Open Widget</button></p>