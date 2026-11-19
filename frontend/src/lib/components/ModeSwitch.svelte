<script>
  /** @type {{ controller: import('../gameController.svelte.js').GameController }} */
  let { controller } = $props();
</script>

<div class="mode-switch" role="group" aria-label="遊戲模式">
  {#each controller.modes as m (m.name)}
    <button
      type="button"
      class:active={controller.mode === m.name}
      disabled={controller.isSpinning}
      onclick={() => controller.setMode(m.name)}
    >
      <span class="name">{m.name === 'pitcher' ? '投手 Pitcher' : m.name === 'batter' ? '打手 Batter' : m.name}</span>
      <span class="cost">成本 {(m.costMultiplier / 100).toFixed(1)}x</span>
    </button>
  {/each}
</div>

<style>
  .mode-switch {
    display: flex;
    gap: 8px;
  }
  button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 14px;
    border-radius: 10px;
    border: 2px solid transparent;
    background: #1c3327;
    color: #cfe8db;
    cursor: pointer;
    font-size: 13px;
  }
  button.active {
    border-color: #ffe08a;
    background: #26432f;
    color: #ffe08a;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .name {
    font-weight: bold;
  }
  .cost {
    font-size: 11px;
    opacity: 0.75;
  }
</style>
