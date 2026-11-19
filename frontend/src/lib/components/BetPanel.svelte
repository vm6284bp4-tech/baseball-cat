<script>
  /** @type {{ controller: import('../gameController.svelte.js').GameController, onSpin: () => void }} */
  let { controller, onSpin } = $props();
</script>

<div class="bet-panel">
  <div class="balance">
    <span class="label">餘額 Balance</span>
    <span class="value">{controller.balance.toFixed(2)} {controller.currency}</span>
  </div>

  <div class="bet-amount">
    <span class="label">下注額 Bet</span>
    <select
      value={controller.betAmount}
      disabled={controller.isSpinning}
      onchange={(e) => controller.setBetAmount(Number(e.currentTarget.value))}
    >
      {#each controller.betLevels as level (level)}
        <option value={level}>{level.toFixed(2)}</option>
      {/each}
    </select>
  </div>

  <button
    type="button"
    class="spin-btn"
    disabled={!controller.canSpin()}
    onclick={onSpin}
    title="空白鍵也可觸發 Spin / space bar also spins"
  >
    {controller.isSpinning ? '進行中…' : 'SPIN'}
  </button>

  {#if controller.isSpinning}
    <button type="button" class="skip-btn" onclick={() => controller.skipAnimation()}>
      快轉 Skip
    </button>
  {/if}

  {#if controller.lastRoundSummary}
    <div class="last-result">
      上局：{controller.lastRoundSummary.totalWinMultiplier.toFixed(2)}x
      （{controller.lastRoundSummary.totalWinAmount.toFixed(2)} {controller.currency}）
    </div>
  {/if}

  {#if controller.lastError}
    <div class="error">錯誤：{controller.lastError}</div>
  {/if}
</div>

<style>
  .bet-panel {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .balance,
  .bet-amount {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    font-size: 11px;
    opacity: 0.7;
  }
  .value {
    font-weight: bold;
    font-size: 16px;
    color: #ffe08a;
  }
  select {
    padding: 6px 10px;
    border-radius: 8px;
    border: none;
    background: #1c3327;
    color: #cfe8db;
    font-size: 14px;
  }
  .spin-btn {
    padding: 10px 28px;
    border-radius: 10px;
    border: none;
    background: #ffd54a;
    color: #1a1400;
    font-weight: bold;
    font-size: 16px;
    cursor: pointer;
  }
  .spin-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .skip-btn {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid #456;
    background: transparent;
    color: #cfe8db;
    cursor: pointer;
    font-size: 13px;
  }
  .last-result {
    font-size: 13px;
    color: #9cffb0;
  }
  .error {
    font-size: 13px;
    color: #ff8a80;
  }
</style>
