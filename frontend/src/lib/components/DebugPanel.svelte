<script>
  /**
   * DebugPanel.svelte — the "test RNG" / force-result QA controls, exposed
   * for real use (not a throwaway stub) per the frontend task brief. Wires
   * straight into mockRgs's play({ debugForce }) via the controller.
   */
  import { FORCEABLE_SCATTER_COUNTS } from '../mockRgs/rng.js';

  /** @type {{ controller: import('../gameController.svelte.js').GameController }} */
  let { controller } = $props();
</script>

<div class="debug-panel">
  <button type="button" class="toggle" onclick={() => (controller.debugPanelOpen = !controller.debugPanelOpen)}>
    {controller.debugPanelOpen ? '▾' : '▸'} QA / Debug 面板（test RNG）
  </button>

  {#if controller.debugPanelOpen}
    <div class="body">
      <label>
        強制 Scatter 數量 (debugForce.scatterCount)
        <select bind:value={controller.debugForceScatterCount} disabled={controller.isSpinning}>
          <option value="off">不強制（正常隨機）</option>
          {#each FORCEABLE_SCATTER_COUNTS as n (n)}
            <option value={n}>{n}{n === 0 ? '（不觸發）' : '（觸發獎金遊戲）'}</option>
          {/each}
        </select>
      </label>

      <label>
        強制 RNG seed (debugForce.seed)
        <input
          type="text"
          placeholder="留空 = 隨機"
          bind:value={controller.debugSeed}
          disabled={controller.isSpinning}
        />
      </label>

      <label>
        強制每球判定結果 (debugForce.pitchOutcomes)
        <input
          type="text"
          placeholder="例：1,1,0,1,1 或 s,s,f,s,s（1/s=成功, 0/f=失敗，依序套用；用完後恢復隨機）"
          bind:value={controller.debugPitchOutcomesText}
          disabled={controller.isSpinning}
        />
      </label>

      <p class="hint">
        這組參數只在下一次按下 SPIN 時套用一次。保底額度造成的強制成功（投手模式）不受這裡覆寫——那是機制本身的判定，不是「隨機抽」。
      </p>

      {#if controller.lastRoundSummary}
        <p class="echo">
          上一局實際套用的 debugForce：
          <code>{JSON.stringify(controller.lastRoundSummary.debugForceApplied)}</code>
        </p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .debug-panel {
    border: 1px dashed #456;
    border-radius: 10px;
    padding: 8px 12px;
    background: #0e1a14;
  }
  .toggle {
    background: none;
    border: none;
    color: #cfe8db;
    cursor: pointer;
    font-size: 13px;
    padding: 2px 0;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #9bb6a8;
  }
  select,
  input {
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid #345;
    background: #152921;
    color: #cfe8db;
    font-size: 13px;
  }
  .hint {
    font-size: 11px;
    color: #7a9389;
    margin: 0;
  }
  .echo {
    font-size: 11px;
    color: #7a9389;
    margin: 0;
    word-break: break-all;
  }
  code {
    color: #ffe08a;
  }
</style>
