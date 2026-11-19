<script>
  import { onMount, onDestroy } from 'svelte';
  import { GameController } from './lib/gameController.svelte.js';
  import GameCanvas from './lib/pixi/GameCanvas.svelte';
  import ModeSwitch from './lib/components/ModeSwitch.svelte';
  import BetPanel from './lib/components/BetPanel.svelte';
  import DebugPanel from './lib/components/DebugPanel.svelte';

  const controller = new GameController();
  controller.init();

  // Structural placeholder for the platform guide's "mute all sound" rule —
  // there is no audio engine yet (out of scope for this pass), but the
  // toggle + state exist now so wiring up real audio later is a drop-in,
  // not a UI redesign. See DEVLOG.md.
  let muted = $state(false);

  function handleSpin() {
    controller.spin();
  }

  function handleKeydown(e) {
    if (e.code === 'Space' && !e.repeat) {
      // Platform guide §4.3: space bar = spin.
      e.preventDefault();
      handleSpin();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<main>
  <header>
    <h1>棒球貓 BASEBALL CAT</h1>
    <button type="button" class="mute-btn" onclick={() => (muted = !muted)} aria-pressed={muted}>
      {muted ? '🔇 靜音中' : '🔊 聲音'}
    </button>
  </header>

  {#if controller.authError}
    <p class="auth-error">authenticate() 失敗：{controller.authError}</p>
  {:else if !controller.authReady}
    <p>連線中…</p>
  {:else}
    <section class="chrome">
      <ModeSwitch {controller} />
      <BetPanel {controller} onSpin={handleSpin} />
    </section>

    <section class="canvas-wrap">
      <GameCanvas {controller} />
    </section>

    <section class="debug-wrap">
      <DebugPanel {controller} />
    </section>
  {/if}
</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    overflow: hidden; /* 整頁不可捲動 — platform guide §4.3 */
    background: #081510;
    color: #e4f3ea;
    font-family: 'Segoe UI', 'Noto Sans TC', sans-serif;
  }
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 16px;
    height: 100vh;
    box-sizing: border-box;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 960px;
    max-width: 100%;
  }
  h1 {
    font-size: 20px;
    margin: 0;
    color: #ffe08a;
  }
  .mute-btn {
    background: #1c3327;
    border: none;
    border-radius: 8px;
    color: #cfe8db;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
  }
  .chrome {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 960px;
    max-width: 100%;
    background: #0e1a14;
    border-radius: 12px;
    padding: 12px 16px;
  }
  .canvas-wrap {
    width: 960px;
    max-width: 100%;
  }
  .debug-wrap {
    width: 960px;
    max-width: 100%;
  }
  .auth-error {
    color: #ff8a80;
  }
</style>
