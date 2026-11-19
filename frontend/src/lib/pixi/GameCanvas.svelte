<script>
  /**
   * GameCanvas.svelte — PixiJS rendering layer. Reads `controller.roundPlayer`
   * (a RoundPlayer instance, see ../player/roundPlayer.svelte.js) and draws
   * whatever its current state says; it never advances the state machine or
   * calls mockRgs itself. All placeholder art: colored rectangles + text
   * labels, per the task brief.
   */
  import { onMount, onDestroy } from 'svelte';
  import * as PIXI from 'pixi.js';
  import { getSymbolDisplay } from './symbolDisplay.js';

  /** @type {{ controller: import('../gameController.svelte.js').GameController }} */
  let { controller } = $props();
  // Derived (not a plain const) so Svelte tracks that this always points at
  // the current controller's player, silencing the "only captures initial
  // value" warning — in practice `controller` is a stable singleton handed
  // down from App.svelte, but this is the correct idiom regardless.
  let player = $derived(controller.roundPlayer);

  const WIDTH = 960;
  const HEIGHT = 700; // extra headroom vs. the grid's status/win text so the
  // bottom round-result banner never overlaps it (see DEVLOG.md note).

  // Shared by both the large pitch call-out and the scrolling pitch log, so
  // the raw event-field value never leaks into player-facing copy anywhere
  // (企劃驗收 2026-11-19 follow-up: the scrolling log was printing the raw
  // `outcome` string untranslated even though the call-out above it wasn't).
  const PITCH_OUTCOME_LABEL = {
    forced_success: '保底成功（直接過）',
    success: '成功！',
    failure: '失敗',
    failure_life_used: '失敗（扣 1 生命值，留在原地）',
  };

  let canvasHost;
  /** @type {PIXI.Application|null} */
  let app = null;
  let gridLayer, duelLayer, bannerLayer;
  let ready = $state(false);

  onMount(() => {
    let destroyed = false;
    (async () => {
      const instance = new PIXI.Application();
      await instance.init({
        width: WIDTH,
        height: HEIGHT,
        background: 0x0b1f17,
        antialias: true,
      });
      if (destroyed) {
        instance.destroy(true, { children: true });
        return;
      }
      app = instance;
      canvasHost.appendChild(app.canvas);

      gridLayer = new PIXI.Container();
      duelLayer = new PIXI.Container();
      bannerLayer = new PIXI.Container();
      app.stage.addChild(gridLayer, duelLayer, bannerLayer);

      ready = true;
    })();

    return () => {
      destroyed = true;
    };
  });

  onDestroy(() => {
    if (app) {
      app.destroy(true, { children: true });
      app = null;
    }
  });

  function clear(container) {
    container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  function makeText(text, { size = 16, fill = 0xffffff, weight = 'normal', align = 'left' } = {}) {
    return new PIXI.Text({
      text,
      style: { fontFamily: 'sans-serif', fontSize: size, fill, fontWeight: weight, align },
    });
  }

  function rect(x, y, w, h, color, { alpha = 1, strokeColor = null, strokeWidth = 0, radius = 8 } = {}) {
    const g = new PIXI.Graphics();
    g.roundRect(x, y, w, h, radius);
    g.fill({ color, alpha });
    if (strokeColor !== null && strokeWidth > 0) {
      g.roundRect(x, y, w, h, radius);
      g.stroke({ color: strokeColor, width: strokeWidth });
    }
    return g;
  }

  // --- base game grid ---------------------------------------------------
  const CELL = 76;
  const GAP = 6;
  const GRID_W = 5 * CELL + 4 * GAP;
  const GRID_X = (WIDTH - GRID_W) / 2;
  const GRID_Y = 90;

  function drawGrid() {
    clear(gridLayer);
    gridLayer.visible = !player.featureActive;
    if (!gridLayer.visible) return;

    const title = makeText('基礎遊戲 Base Game', { size: 18, weight: 'bold' });
    title.x = GRID_X;
    title.y = 50;
    gridLayer.addChild(title);

    if (!player.grid) {
      const hint = makeText('按下 SPIN 開始', { size: 20, fill: 0xaad4bd });
      hint.x = WIDTH / 2 - hint.width / 2;
      hint.y = HEIGHT / 2 - 10;
      gridLayer.addChild(hint);
      return;
    }

    const wildFormByCell = new Map(player.wildCells.map((w) => [`${w.reel},${w.row}`, w.form]));

    for (let reel = 0; reel < player.grid.length; reel++) {
      for (let row = 0; row < player.grid[reel].length; row++) {
        const symbolId = player.grid[reel][row];
        const display = getSymbolDisplay(symbolId);
        const x = GRID_X + reel * (CELL + GAP);
        const y = GRID_Y + row * (CELL + GAP);
        const isWinning = player.highlightedSymbols.has(symbolId);
        const isWild = symbolId === 'WILD';
        const wildForm = isWild ? wildFormByCell.get(`${reel},${row}`) : null;

        const cell = rect(x, y, CELL, CELL, display.fill, {
          strokeColor: isWinning ? 0xffffff : isWild && wildForm === 'expand' ? 0xffffff : null,
          strokeWidth: isWinning ? 4 : isWild && wildForm === 'expand' ? 3 : 0,
          radius: isWild ? 14 : 8,
        });
        gridLayer.addChild(cell);

        const label = makeText(display.label, { size: 13, fill: display.textColor, weight: 'bold' });
        label.x = x + CELL / 2 - label.width / 2;
        label.y = y + CELL / 2 - label.height / 2 - (isWild ? 8 : 0);
        gridLayer.addChild(label);

        if (isWild) {
          const formTag = makeText(wildForm === 'expand' ? '整軸' : '單格', { size: 10, fill: display.textColor });
          formTag.x = x + CELL / 2 - formTag.width / 2;
          formTag.y = y + CELL / 2 + 10;
          gridLayer.addChild(formTag);
        }
      }
    }

    const statusY = GRID_Y + GRID_W + 14;
    const scatterText = makeText(`Scatter: ${player.scatterCount} / 5`, { size: 16, fill: 0xffe08a });
    scatterText.x = GRID_X;
    scatterText.y = statusY;
    gridLayer.addChild(scatterText);

    if (player.baseWins.length > 0) {
      const winLines = player.baseWins
        .map((w) => `${getSymbolDisplay(w.symbol).label} x${w.length} (${w.ways} ways) = ${w.winMultiplier.toFixed(2)}x`)
        .join('   ');
      const winText = makeText(`贏分: ${winLines}`, { size: 14, fill: 0x9cffb0 });
      winText.x = GRID_X;
      winText.y = statusY + 24;
      gridLayer.addChild(winText);
    }
  }

  // --- duel / bonus game overlay ----------------------------------------
  const OPP_LABELS_PITCHER = ['第一棒打者', '第二棒打者', '第三棒打者'];
  const OPP_LABELS_BATTER = ['第一位投手', '第二位投手', '第三位投手'];

  function opponentStatusColor(status) {
    switch (status) {
      case 'cleared':
        return 0x4caf50;
      case 'failed':
        return 0xe53935;
      case 'current':
        return 0xffd54a;
      default:
        return 0x3a4a42;
    }
  }

  function drawDuel() {
    clear(duelLayer);
    duelLayer.visible = player.featureActive;
    if (!duelLayer.visible) return;

    const modeLabel = player.featureMode === 'pitcher' ? '投手模式 Pitcher' : '打手模式 Batter';
    const title = makeText(`獎金遊戲 Bonus Game — ${modeLabel}`, { size: 22, weight: 'bold', fill: 0xffe08a });
    title.x = WIDTH / 2 - title.width / 2;
    title.y = 30;
    duelLayer.addChild(title);

    const paramLabel =
      player.featureParam && 'guaranteedSlots' in player.featureParam
        ? `保底額度：${player.guaranteedSlotsRemaining} 剩餘（觸發時 ${player.featureParam.guaranteedSlots}）`
        : player.featureParam
          ? `生命值：${player.livesRemaining} 剩餘（觸發時 ${player.featureParam.lives}）`
          : '';
    const paramText = makeText(paramLabel, { size: 15, fill: 0xcbe8d6 });
    paramText.x = WIDTH / 2 - paramText.width / 2;
    paramText.y = 62;
    duelLayer.addChild(paramText);

    const oppLabels = player.featureMode === 'pitcher' ? OPP_LABELS_PITCHER : OPP_LABELS_BATTER;
    const boxW = 260, boxH = 130, boxGap = 24;
    const totalW = boxW * 3 + boxGap * 2;
    const startX = (WIDTH - totalW) / 2;
    const boxY = 100;

    player.opponents.forEach((opp, i) => {
      const x = startX + i * (boxW + boxGap);
      const box = rect(x, boxY, boxW, boxH, opponentStatusColor(opp.status), { alpha: opp.status === 'pending' ? 0.5 : 0.9 });
      duelLayer.addChild(box);

      const label = makeText(`對手 ${i + 1}：${oppLabels[i] ?? ''}`, { size: 14, weight: 'bold', fill: 0x0c1a12 });
      label.x = x + 12;
      label.y = boxY + 10;
      duelLayer.addChild(label);

      const statusText = makeText(
        {
          pending: '尚未對戰',
          current: '對戰中…',
          cleared: '已過關',
          failed: '未過關（淘汰）',
        }[opp.status],
        { size: 14, fill: 0x0c1a12 }
      );
      statusText.x = x + 12;
      statusText.y = boxY + 36;
      duelLayer.addChild(statusText);

      if (opp.status === 'current' && player.featureMode === 'batter') {
        const hitText = makeText(`命中數：${player.currentHitCount} / 2`, { size: 14, fill: 0x0c1a12 });
        hitText.x = x + 12;
        hitText.y = boxY + 60;
        duelLayer.addChild(hitText);
      }

      if (opp.status === 'cleared') {
        const resultText = makeText(
          `底分 +${opp.baseScoreAdded} ｜ 倍數 x${opp.drawnMultiplier}`,
          { size: 14, fill: 0x0c1a12, weight: 'bold' }
        );
        resultText.x = x + 12;
        resultText.y = boxY + 60;
        duelLayer.addChild(resultText);
      }
    });

    // Latest pitch, called out large and clearly.
    const pitchY = boxY + boxH + 24;
    if (player.lastPitch) {
      const p = player.lastPitch;
      const pitchText = makeText(
        `第 ${p.pitchNumberGlobal} 球 ｜ 對手 ${p.opponentIndex + 1} ｜ ${PITCH_OUTCOME_LABEL[p.outcome] ?? p.outcome}`,
        { size: 18, weight: 'bold', fill: p.outcome.startsWith('failure') ? 0xff8a80 : 0x9cffb0 }
      );
      pitchText.x = WIDTH / 2 - pitchText.width / 2;
      pitchText.y = pitchY;
      duelLayer.addChild(pitchText);
    }

    // Scrolling pitch log (last few).
    const logY = pitchY + 34;
    const recent = player.pitchLog.slice(-6);
    recent.forEach((p, i) => {
      const line = makeText(
        `#${p.pitchNumberGlobal} 對手${p.opponentIndex + 1}：${PITCH_OUTCOME_LABEL[p.outcome] ?? p.outcome}`,
        { size: 12, fill: 0x9bb6a8 }
      );
      line.x = WIDTH / 2 - 160;
      line.y = logY + i * 16;
      duelLayer.addChild(line);
    });

    // Feature-end summary panel.
    if (player.featureEndSummary) {
      const s = player.featureEndSummary;
      const summaryY = logY + recent.length * 16 + 20;
      const panel = rect(WIDTH / 2 - 320, summaryY, 640, 110, 0x16291f, { alpha: 0.9, strokeColor: 0xffe08a, strokeWidth: 2, radius: 10 });
      duelLayer.addChild(panel);

      const endReasonLabel = s.endReason === 'full_clear' ? '全通關 Full Clear' : '中途淘汰 Early Termination';
      const l1 = makeText(`獎金遊戲結束：${endReasonLabel}`, { size: 16, weight: 'bold', fill: 0xffe08a });
      l1.x = WIDTH / 2 - 300;
      l1.y = summaryY + 10;
      duelLayer.addChild(l1);

      const l2 = makeText(
        `累積底分：${s.bankedBaseTotal} ｜ 抽到倍數：${s.drawnMultipliers.map((m) => `x${m}`).join(' , ') || '（無）'}`,
        { size: 14, fill: 0xcbe8d6 }
      );
      l2.x = WIDTH / 2 - 300;
      l2.y = summaryY + 38;
      duelLayer.addChild(l2);

      const l3 = makeText(
        `最終倍數 = ${s.finalWinMultiplier.toFixed(2)}x`,
        { size: 20, weight: 'bold', fill: 0xffffff }
      );
      l3.x = WIDTH / 2 - 300;
      l3.y = summaryY + 64;
      duelLayer.addChild(l3);
    }
  }

  // --- round result banner ------------------------------------------
  function drawBanner() {
    clear(bannerLayer);
    if (!player.roundResult) {
      bannerLayer.visible = false;
      return;
    }
    bannerLayer.visible = true;
    const r = player.roundResult;

    const panel = rect(WIDTH / 2 - 260, HEIGHT - 110, 520, 80, 0x000000, { alpha: 0.72, radius: 14 });
    bannerLayer.addChild(panel);

    const title = makeText(
      r.totalWinMultiplier > 0 ? '總贏分 Total Win' : '本局無贏分',
      { size: 14, fill: 0xcbe8d6 }
    );
    title.x = WIDTH / 2 - title.width / 2;
    title.y = HEIGHT - 102;
    bannerLayer.addChild(title);

    const amountText = makeText(
      `${r.totalWinMultiplier.toFixed(2)}x  (${r.totalWinAmount.toFixed(2)} ${controller.currency})`,
      { size: 28, weight: 'bold', fill: 0xffe08a }
    );
    amountText.x = WIDTH / 2 - amountText.width / 2;
    amountText.y = HEIGHT - 80;
    bannerLayer.addChild(amountText);
  }

  $effect(() => {
    if (!ready) return;
    // Touch every field we want this effect to re-run on.
    void player.grid;
    void player.wildCells;
    void player.highlightedSymbols;
    void player.scatterCount;
    void player.baseWins;
    void player.featureActive;
    drawGrid();
  });

  $effect(() => {
    if (!ready) return;
    void player.featureActive;
    void player.featureMode;
    void player.featureParam;
    void player.opponents;
    void player.pitchLog;
    void player.lastPitch;
    void player.currentHitCount;
    void player.guaranteedSlotsRemaining;
    void player.livesRemaining;
    void player.featureEndSummary;
    drawDuel();
  });

  $effect(() => {
    if (!ready) return;
    void player.roundResult;
    drawBanner();
  });
</script>

<div class="canvas-host" bind:this={canvasHost}></div>

<style>
  .canvas-host {
    display: flex;
    justify-content: center;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
</style>
