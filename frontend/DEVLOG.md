# DEVLOG — frontend/ (棒球貓 BASEBALL CAT)

Running dev log for the `frontend/` project (Svelte 5 + Vite + PixiJS 8, mock
RGS game-logic layer). Newest entry at the top. Written so a different
engineer picking this up cold has everything they need — exact commands,
every placeholder value, what was deliberately deferred.

---

## 2026-11-19 — 企劃驗收 review of Step 3 (PASS) + 1 cosmetic fix

Independent reviewer checked the UI layer against GDD §1–§4 terminology/
labeling rules (獎金遊戲 not 免費遊戲; pitcher-only 保底額度 vs batter-only
生命值, mutually exclusive by data shape; "stays on same opponent" copy on
`failure_life_used`; Wild expand never implying a bigger win; Scatter never
implying a payout; base-score/multiplier breakdown kept separate) and
against the mock-RGS event contract (every event type has a real handler
with a tested unhandled-event fallback; `endRound()` zero-win skip is a real
conditional, not just a devlog claim; debug-force controls are genuinely
wired end-to-end). **Verdict: all MATCH, no deviations.**

One low-severity cosmetic nit was flagged and fixed: the scrolling pitch-log
line (`GameCanvas.svelte`, below the large call-out text) was printing the
raw `outcome` event field untranslated (e.g. `failure_life_used`) even
though the large call-out above it already used a Chinese label map. Fixed
by hoisting that map to a module-level `PITCH_OUTCOME_LABEL` constant and
using it in both places, so the raw English/snake_case value can never leak
into player-facing copy. Verified live in a browser (forced `batter` mode,
`scatterCount: 4`, `pitchOutcomes: [0,1,1,1,1,1,1]`): the log now reads
"#1 對手1：失敗（扣1生命值，留在原地）" instead of the raw event string.
Full suite re-run after the fix: `6 passed (6 files), 58 passed (58 tests)`;
`pnpm run build` unaffected (883 modules, no warnings).

---

## 2026-11-19 — Step 3: playable UI (Svelte 5 + PixiJS 8) on top of the mock RGS

Built the actual playable front-end that calls `mockRgs` and plays back its
`events` array visually. Placeholder art only (colored rectangles + text
labels) — no final art, per the task brief. **No logic bugs found in
`mockRgs/*` while building this** — the files under `src/lib/mockRgs/` were
read but not modified, as instructed.

### Files added

- `src/lib/player/roundPlayer.svelte.js` — **the event-stepping state
  machine**. A plain class (`RoundPlayer`) using Svelte 5 runes (`$state` /
  `$state.raw`) so it's reactive without being a component. Owns "what event
  are we on, when do we advance" and exposes derived display state (grid,
  wildCells, highlighted winning symbols, duel/feature state — opponents
  array, pitch log, guaranteed-slots/lives counters, feature-end summary,
  round result). Deliberately has **zero PixiJS/DOM code** — this is the
  seam the task brief asked for, so a future reskin only touches the
  renderer. Every event type in the documented contract
  (`spin_result`/`base_game_win`/`scatter_trigger`/`pitch`/
  `opponent_cleared`/`feature_end`/`round_result`) has a real `case` in
  `_applyEvent`; anything else hits a `default` branch that `console.warn`s
  and records into `unhandledEvents` rather than silently dropping it.
  Also exposes `skipToEnd()` (process every remaining event synchronously,
  no animation) — used both as a QA "fast forward" button in the UI and as
  the backbone of the automated test below.
- `src/lib/gameController.svelte.js` — top-level game state (`GameController`
  class). The **only** place that imports and calls into `mockRgs`
  (`authenticate()` once on `init()`, `play()` on spin, `endRound()` after
  playback finishes). Converts the fixed-point integer money mockRgs returns
  into human display units at this boundary — nothing downstream ever sees
  the ×1,000,000 integers. Owns balance/bet/mode selection, builds the
  `debugForce` object from the debug panel's fields, and enforces the
  endRound rule for real: `endRound()` is only called when
  `totalWinMultiplier > 0`, wired against the actual round result, not
  skipped because the mock is a no-op.
- `src/lib/pixi/symbolDisplay.js` — symbol id → {label, fill color, text
  color} lookup. All ten symbols (`WILD`/`SCATTER`/`HIGH_OPP3`/`HIGH_OPP2`/
  `HIGH_OPP1`/`HIGH_BAT`/`LOW_JERSEY`/`LOW_GLOVE`/`LOW_BASE`/`LOW_CAP`) get a
  distinct color + short label. Swap this file wholesale once real art
  exists.
- `src/lib/pixi/GameCanvas.svelte` — the PixiJS rendering layer. One
  `PIXI.Application` (v8 async `init()` pattern), three stacked containers
  (grid / duel-feature / round-result-banner), each rebuilt from scratch on
  the relevant slice of `roundPlayer` state via `$effect`. Covers:
  - 5×5 base-game grid: colored cell per symbol, winning symbols (from
    `base_game_win` events) get a white highlight border, Wild cells get a
    rounded border plus a "單格"/"整軸" tag under the label so `form` is
    visually distinguishable (cosmetic only, per spec — never implies a
    scoring difference).
  - On `scatter_trigger`: the grid is replaced (not overlaid) by a duel
    scene — mode banner (投手/打手), the scatter-count-derived parameter
    (保底額度 / 生命值) with its live remaining count, and 3 opponent boxes
    labeled per the GDD's "對手貓" framing, color-coded pending/current
    (yellow)/cleared (green)/failed (red).
  - `pitch` events: a large call-out line for the latest pitch (which
    opponent, outcome in plain language — 保底成功/成功/失敗/失敗＋扣生命值)
    plus a scrolling log of the last 6 pitches; batter mode also shows the
    current opponent's running hit count (X/2).
  - `opponent_cleared`: that opponent's box flips to green and shows its
    banked base score + drawn multiplier directly in the box.
  - `feature_end`: a bordered summary panel — endReason (full clear /
    early termination, in Chinese + English), banked base total, every
    drawn multiplier, and the resulting final multiplier.
  - `round_result`: a prominent banner at the bottom of the canvas — total
    win as both multiplier and amount (or "本局無贏分" when it's a 0x
    round).
- `src/lib/components/ModeSwitch.svelte`, `BetPanel.svelte`,
  `DebugPanel.svelte` — the Svelte chrome. `ModeSwitch` reads `authenticate()`'s
  `modes` array (never hardcoded) and disables switching mid-round.
  `BetPanel` reads `betLevels` the same way, shows balance, the Spin/Skip
  buttons, and the last round's result. `DebugPanel` is the "test RNG" QA
  panel — collapsible, exposes `debugForce.scatterCount` (0/3/4/5 dropdown),
  `debugForce.seed` (free text), and `debugForce.pitchOutcomes` (comma list,
  `1/0` or `s/f`), and echoes back the `debugForceApplied` actually used on
  the last round for sanity-checking.
- `src/App.svelte` — replaced the untouched create-vite starter page.
  Wires everything together, adds the `window` keydown listener for
  spacebar-spin (platform guide §4.3), and a mute-all-sound toggle.
- `frontend/tests/roundPlayer.test.js` — new vitest suite for the player
  state machine (see "Testing" below).
- `frontend/.claude/launch.json` was **not** created inside `frontend/` or
  `baseball-cat/` — the Claude Code preview tool in this session resolved
  its config one directory level up, at `遊戲企劃/.claude/launch.json`
  (outside this project's own folder). Noting this here since it's an odd
  location or a side-effect of the agent environment's project context,
  not a standard web project file; a human engineer just running
  `pnpm --dir frontend run dev` directly won't need it at all.

### Judgment calls

- **PixiJS owns all of the game-state visuals, not just the grid.** The task
  brief lists the duel/feature playback under the "Game canvas (PixiJS)"
  header, so the opponent boxes, pitch log, feature-end summary, and
  round-result banner are all drawn as PixiJS Graphics/Text inside the
  canvas rather than as a separate DOM/HTML overlay. This is more code than
  a DOM overlay would have been, but keeps everything "the canvas" in one
  place and matches what was asked.
- **Full-scene rebuild on each relevant state change**, not incremental
  diffing or a continuous animation loop. Each of the three `$effect`s
  clears its container's children and redraws from the current
  `roundPlayer` state. This is simple and correct for a prototype at this
  event volume (at most ~15 events/round); a real polish pass would almost
  certainly want persistent sprites with actual tweened transitions instead
  of rebuild-on-every-event.
- **Grid is hidden (not dimmed/overlaid) during the duel feature** — a
  clean scene swap felt like a clearer "you're now in a different mode"
  signal than layering the duel UI on top of the 5×5 grid, which would be
  visually busy and isn't how the GDD describes the transition anyway
  ("獎金遊戲" is a distinct phase, not a reel modifier).
- **Optimistic balance deduction**: the bet is subtracted from `balance`
  the instant `spin()` is called (before any animation plays), and any win
  is credited only after the full event log finishes playing + `endRound()`
  fires. This mirrors "final win must accumulate to the final amount" from
  the platform guide applied at the whole-round granularity, since mockRgs
  hands back the complete pre-computed result up front rather than
  streaming partial wins.
- **`skipToEnd()` / the "快轉 Skip" button**: not asked for explicitly, but
  added because manually waiting through a full pitcher full-clear (9
  pitches × 700ms + banners) during QA/iteration was slow; it's also what
  the automated test below uses to avoid relying on real timers.
- **Mute toggle has no audio to mute** — there's no audio engine in this
  project yet at all. Added the toggle + `muted` state in `App.svelte` as a
  structural placeholder only, per the brief's "structure for one" guidance,
  so wiring up real sound later doesn't require a UI change.
- **Autoplay was not built.** The brief says "if you add it" — decided not
  to, to keep this pass focused; the platform guide's "autoplay needs a
  confirm step" rule is noted here for whoever adds it later.
- **`app.css` (the original create-vite stylesheet) was left in place
  as-is**, not deleted or rewritten. It still sets `body { display: flex;
  place-items: center; min-height: 100vh }` and `#app { max-width: 1280px;
  padding: 2rem; text-align: center }`, which do interact with
  `App.svelte`'s own layout (that's part of why the app renders centered
  with some outer padding in the screenshots). It didn't visibly break
  anything so it was left alone rather than risk an unrelated regression,
  but a real polish pass should probably replace it with a clean reset.
- **`src/lib/Counter.svelte`** (the create-vite starter's demo component) is
  now unused — `App.svelte` no longer imports it — but was left in the repo
  rather than deleted, since removing files wasn't necessary for this task.

### What was skipped / deferred (platform-guide compliance gaps, flagged per the brief)

Per the brief, chased "cheap to do now" items (mode switch via authenticate,
bet levels via authenticate, spacebar spin, balance display, mute toggle
structure) but explicitly did **not** chase:
- Popout sizing (400×225 / 800×450) and the 1024×576 laptop target — canvas
  is a fixed 960×700 placeholder size, not responsive/scaled to those
  targets yet.
- Multi-currency formatting (JPY 0-decimals, BTC 6-decimals, sub-$0.01
  display) — `toFixed(2)` everywhere regardless of `currency`.
- Social mode (`social=true`) word-filter compliance — UI copy freely uses
  "Bonus Game" etc. without checking the restricted-word list; the GDD
  already confirms "bonus" alone is fine, but no systematic check was done.
- Replay (`replay=true`) support.
- Full rules/info page (payout tables, RTP, max win, per-button
  instructions, disclaimers) — none of that page exists yet.
- "成本 > 2× 的模式必須先確認" — moot right now since both modes are 1.0×,
  but noting the rule exists for whenever that changes.
- Loading-time / bundle-size optimization — not measured.

### Testing

- `pnpm run build` — **succeeds**, 883 modules transformed, no warnings, no
  errors (confirmed twice: once before the canvas-height tweak below, once
  after).
- `pnpm test` — **58/58 passing** (the pre-existing 54 mockRgs-layer tests,
  untouched and still green, plus **4 new tests** in
  `tests/roundPlayer.test.js` covering: a non-triggering round, a
  pitcher-mode forced full-clear, a batter-mode forced early-termination,
  and an explicit assertion that every event type documented in
  `mockRgs/index.js`'s header contract actually appears in a `play()` result
  and gets consumed by `RoundPlayer` with zero entries landing in
  `unhandledEvents`. These tests use `skipToEnd()` (synchronous), not
  `start()`, specifically to avoid depending on real timers.
- **Visually confirmed, not just reasoned through** — ran the actual dev
  server (`pnpm --dir frontend run dev`, Vite default port 5173) in this
  session's browser pane and drove it directly:
  - Forced `scatterCount=5` + 7 forced successful pitch outcomes in pitcher
    mode → watched the scatter-trigger transition, all 3 opponent boxes
    clear green with correct base-score/multiplier text, the feature-end
    summary panel (banked base 4, multipliers ×1.2/×1/×1.5, final 7.20×),
    and the round-result banner (7.50× / 7.50 USD) all render correctly;
    balance updated 1000.00 → 999.00 (bet) → 1006.50 (bet + win credited
    after playback finished).
  - Spacebar-triggered a normal (non-forced) spin in base game — grid
    rendered with per-symbol colors/labels, a real ways-win highlighted and
    reported (`BASE x5 (4 ways) = 1.60x`), round-result banner showed
    correctly below it with no overlap (see canvas-height fix below).
  - Forced `scatterCount=4` + two forced failures in **batter** mode →
    watched opponent 1 take a `failure_life_used` (life 1→0) then a
    `failure` (life pool exhausted) → correctly shown as red "未過關（淘汰）",
    opponents 2/3 stayed pending/gray, feature-end summary showed
    `early_termination` with 0 banked base and no multipliers.
  - Confirmed the debug panel's scatterCount/seed/pitchOutcomes fields are
    real `<select>`/`<input>` elements wired to `controller`, not stubs.
- **One cosmetic bug found and fixed during this same visual pass**: the
  round-result banner (anchored near the bottom of the fixed-height canvas)
  could overlap the base game's win-summary text line when a base-game win
  text was long enough. Fixed by increasing `GameCanvas.svelte`'s `HEIGHT`
  constant from 640 to 700 (the banner's Y positions are all
  `HEIGHT`-relative, so this alone gave enough clearance) — reconfirmed
  overlap gone with a follow-up spin in the browser.
- **Not verified**: real mobile/touch layout, popout window sizes, anything
  under multi-currency formatting, or long-run visual stability across many
  consecutive spins (only did a handful of manual spins in one session).

### How to run it

```bash
cd frontend
pnpm run dev      # Vite dev server, http://localhost:5173/ by default
pnpm run build    # production build -> frontend/dist/
pnpm test         # vitest, mockRgs tests + roundPlayer tests
```

No new dependencies were added — still just `pixi.js` (already present) and
Svelte 5's built-in runes (used in a `.svelte.js` module for the player
state machine and the game controller; `vite-plugin-svelte` already
compiles `.svelte.js`/`.svelte.ts` files, confirmed by a clean `pnpm run
build`).

---

## 2026-11-19 — PM decision on the review's 2 open risk items, both now fixed structurally

The PM decided both open items from the review below, as permanent GDD rules
(not just implementation workarounds) — see GDD §3 "Wild 行為規格" /
"Scatter 落點規格", 2026-11-19 addendum:

1. **Scatter: at most 1 per reel strip, so at most 5 total, one per axis.**
   `STRIP_SYMBOL_WEIGHTS`'s Scatter weight dropped from `2` to `1` in
   `paytable.js`. This makes the earlier runtime clamp
   (`getScatterTriggerParams`) a defense-in-depth backstop rather than the
   only thing preventing a 6+ scatter grid — a natural spin can no longer
   produce one at all, full stop. Kept the clamp anyway since `forceGrid` can
   still hand-construct a 6+ grid for testing, and it costs nothing to leave
   it in.
2. **Reel 0 (leftmost) never contains Wild.** `buildPlaceholderStrip()` now
   takes an `{ excludeWild }` option; `REEL_STRIPS` builds reel 0 with it set
   to `true`, every other reel unchanged. This bounds the number of
   *distinct* symbols that can pay in one spin to at most 5 (reel 0's row
   count) instead of 8, and specifically makes the degenerate "every reel is
   Wild, every symbol pays" case structurally impossible — reel 0 is always
   a concrete real symbol on every row, so only symbols actually *present*
   on reel 0 can ever pay, at most 5 distinct ones (one per row, assuming no
   repeats). `evaluateWays()` itself was NOT changed — the fix is entirely at
   generation time, which keeps the already-reviewed scoring logic untouched.

New tests added in `tests/baseGame.test.js`: strip-content assertions (each
strip has exactly 1 Scatter; reel-0 strip has 0 Wild), 500-seed natural-spin
sweeps confirming both invariants hold at runtime (not just in the strip
definition), and a constructed all-Wild-except-reel-0 grid proving the
5-distinct-symbol bound and that absent-from-reel-0 symbols never pay. Full
suite after these changes: `5 passed (5 files), 54 passed (54 tests)`.

Note for whoever does the D5 math pass: this doesn't fully eliminate
multi-symbol stacking in one spin (reel 0 can still show up to 5 different
symbols across its 5 rows, each independently extending through Wilds on
reels 1-4) — that's normal, expected "ways" behavior, not a bug. It only
removes the *degenerate* 8-symbol case that depended on reel 0 itself being
Wild, which is the specific thing flagged as a risk.

---

## 2026-11-19 — 企劃驗收 review + one fix applied

An independent reviewer compared this layer against GDD §3/§4 line-by-line
(not just against this layer's own tests). **Verdict: faithful to spec, no
logic bugs.** Every explicitly-documented rule matched: high-tier strict
payout order, low-tier tie pairs, Wild-expand payout-neutrality, Scatter
non-payout/anywhere-counted/3-4-5-trigger, the single shared guaranteed-slot
counter, pitcher's zero-life all-or-nothing structure, batter's
non-resetting hit-count on a survived failure, the `6 + lives_at_trigger`
pitch bound, and the scoring formula with no hidden full-clear bonus.

Two things the GDD is silent on were flagged as risk items, not GDD
deviations:

1. **Scatter >5 silently failed to trigger the feature** (see the entry
   below this one, under "Scatter counting is uncapped..."). **Fixed**: added
   `getScatterTriggerParams(scatterCount)` in `paytable.js`, which clamps the
   lookup to `Math.min(scatterCount, 5)` instead of indexing
   `SCATTER_TRIGGER_TABLE` directly. `index.js` and `duelFeature.js` both now
   call this helper instead of touching the raw table. Rationale: landing
   *more* scatters than the 5-tier should never be worse than landing
   exactly 5 — silently not triggering was the opposite of the intended
   "more scatters = stronger trigger" direction. `SCATTER_TRIGGER_TABLE`
   itself is untouched (still only has keys 3/4/5; existing tests that read
   it directly for 0/1/2/3/4/5 are unaffected). New test added in
   `tests/baseGame.test.js` covering 6 and 25 scatters. Full suite re-run
   after the fix: `5 passed (5 files), 49 passed (49 tests)`.
2. **All-Wild runs can pay multiple paytable symbols' values simultaneously**
   (e.g. 3 Wild-only reels pays all 8 symbols' length-3 values, summed) —
   this is a real design choice (most ways/wild games instead cap an
   all-wild combo to the single highest-paying symbol only), not a bug
   relative to anything written in the GDD. **Not fixed yet** — needs an
   explicit PM decision before changing `evaluateWays()`'s aggregation, since
   it meaningfully affects RTP/variance shape. Still open as of this entry.

---

## 2026-11-19 — Step 1 (project scaffold) + Step 2 (mock RGS + tests)

### What was built

**Step 1 — scaffold**
- `frontend/` — Vite + Svelte 5 project, scaffolded via `create-vite`. Default
  starter page left untouched (step 3/4 will replace it with the real game
  UI — explicitly out of scope for this task).
- Added `pixi.js@^8.23.0` as a dependency (not used yet — just proving it
  installs and doesn't break the build) and `vitest@3.2.7` as a dev
  dependency for unit testing.
- `frontend/pnpm-workspace.yaml` — holds pnpm's build-script allowlist (see
  "pnpm/corepack setup" below). This file didn't exist before this task.
- `frontend/package.json` — added a `"test": "vitest run"` script.
- Root `.gitignore` — added `frontend/node_modules/` and `frontend/dist/` as
  a belt-and-suspenders entry (frontend/ already has its own .gitignore from
  create-vite that covers the same paths; nothing else in the repo root was
  touched).

**Step 2 — mock RGS + game logic layer**, all under `frontend/src/lib/mockRgs/`:
- `rng.js` — seedable PRNG (mulberry32) + a forced-outcome-queue helper for
  manual QA / deterministic tests.
- `paytable.js` — all placeholder numeric tables (symbol catalog, ways-pay
  table, reel strips, duel-feature scoring config). Every number in this
  file is explicitly a placeholder — see "Placeholder values" below.
- `baseGame.js` — 5x5 fixed-reel spin + ways-pay evaluation, Scatter
  counting, cosmetic Wild single/expand form resolution.
- `duelFeature.js` — the Bonus Game duel engine (pitcher "全中才過" / batter
  "累計命中2次" rulesets), scoring (banked base scores + drawn multipliers).
- `index.js` — public `authenticate()` / `play()` / `endRound()` API that
  composes the above into one round result. Full JSON event-log contract is
  documented in a large comment at the top of this file — **read that before
  building the PixiJS UI layer or wiring up a real RGS**.
- `frontend/tests/*.test.js` (vitest) — `rng.test.js`, `baseGame.test.js`,
  `duelFeature.test.js`, `scoring.test.js`, `index.test.js`. 48 tests total,
  all passing (see "Test results" below).

### Environment / pnpm / corepack setup — exact commands that worked

Machine: Windows 11, Git Bash, Node v18.12.1 (NOT the officially-recommended
v22.16 — fine, Vite 5 + Svelte 5 support Node ^18.0.0 || >=20.0.0).

1. **corepack did NOT work on this machine** — `corepack enable` succeeded,
   but `corepack prepare pnpm@10.5.0 --activate` failed with:
   ```
   Internal Error: EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpm'
   ```
   (no admin rights to write into `C:\Program Files\nodejs\`). Did not try
   to work around this — fell back to the documented alternative instead:
   ```bash
   npm install -g pnpm
   ```
   This installed **pnpm 12.21.0** (much newer than the "pnpm 10.5" the task
   brief mentioned as Stake's stated version — whatever was latest on npm at
   the time). Nothing in steps 1/2 needed a specific pnpm version, so this
   was not an issue, but a future engineer should know the actual installed
   version may drift from whatever's written in `shared_reference/`.

2. **Scaffolding**: `pnpm create vite@latest frontend -- --template svelte`
   FAILED outright on Node 18.12.1:
   ```
   [WARN] Unsupported engine for create-vite@9.3.4: wanted node ^20.19.0 || >=22.12.0
   ...
   SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
   ```
   (`create-vite@9.x`'s CLI itself uses a Node 20+ API (`util.styleText`) that
   doesn't exist in 18.12.1 — this is a hard crash, not just a warning.)
   Fixed by pinning an older `create-vite` major version that predates that
   dependency, via `pnpm dlx` instead of `pnpm create` (so the version pin
   actually takes effect):
   ```bash
   pnpm dlx create-vite@5 frontend --template svelte
   ```
   This produced Svelte `^5.1.3` + Vite `^5.4.10` + `@sveltejs/vite-plugin-svelte@^4.0.0`
   — resolved on install to Svelte 5.57.3 / Vite 5.4.21 / plugin 4.0.4.

3. **Installing pixi.js / vitest** hit pnpm's (fairly new, in this pnpm
   12.21.0) build-script-approval security gate:
   ```
   Error: ERR_PNPM_IGNORED_BUILDS
     × adding a new package
     ╰─▶ Ignored build scripts: esbuild@0.21.5
     help: Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
   ```
   `pnpm approve-builds` is interactive-only (fails with `IO error: not a
   terminal` in a non-interactive shell). Tried adding
   `onlyBuiltDependencies: [esbuild]` to `pnpm-workspace.yaml` — necessary but
   NOT sufficient on its own; still got the same error on install. What
   actually worked was the `--allow-build` CLI flag:
   ```bash
   pnpm add pixi.js@^8          # (hit the gate here)
   pnpm add -D vitest           # also hit it; see vitest version note below
   pnpm install --allow-build esbuild
   ```
   After that one `--allow-build esbuild` install, pnpm itself persisted the
   decision into `pnpm-workspace.yaml` as:
   ```yaml
   allowBuilds:
     esbuild: true
   onlyBuiltDependencies:
     - esbuild
   ```
   so subsequent `pnpm install` runs no longer prompt. **If `pnpm install`
   ever complains about ignored build scripts again on a fresh clone**, the
   fix is `pnpm install --allow-build <package>` (or just re-approve via
   `pnpm approve-builds` if you have a real TTY).

4. **vitest version pin**: `pnpm add -D vitest` by default resolved to
   `vitest@5.1.0`, which declares `engines.node: "^22.12.0 || ^24.0.0 ||
   >=26.0.0"` — incompatible with this machine's Node 18.12.1 (pnpm installs
   it anyway with just a warning, but it's the wrong call for this project).
   Removed it and pinned explicitly to the newest 3.x line that still
   supports Node 18:
   ```bash
   pnpm remove vitest
   pnpm add -D vitest@3.2.7   # engines.node: "^18.0.0 || ^20.0.0 || >=22.0.0"
   ```

5. **One more pnpm-12-specific wrinkle, informational only**: pnpm printed
   `Agent skills awaiting approval: pixi.js` after installing pixi.js. This
   is pnpm flagging that the `pixi.js` package ships a bundled Claude Skill
   file (`node_modules/pixi.js/skills/pixijs/SKILL.md` — a legitimate,
   MIT-licensed PixiJS v8 API usage/reference doc for AI coding agents, not
   anything suspicious). **This was deliberately left unapproved** — running
   `pnpm approve` / `pnpm approve-builds` to grant it wasn't needed for
   steps 1/2 and is a decision about what an AI agent can load later, which
   felt outside this task's scope. Whoever builds the PixiJS UI in step 3/4
   may actually want to approve it (`pnpm approve pixi.js`, interactive) since
   it's genuinely useful PixiJS reference material — just flagging that it
   exists and is currently sitting unapproved.

**Summary of exact working command sequence, start to finish:**
```bash
npm install -g pnpm                                  # -> pnpm 12.21.0
pnpm dlx create-vite@5 frontend --template svelte
cd frontend
# add `pnpm.onlyBuiltDependencies` workaround was NOT enough by itself —
# create frontend/pnpm-workspace.yaml with onlyBuiltDependencies: [esbuild]
# then:
pnpm add pixi.js@^8
pnpm add -D vitest@3.2.7
pnpm install --allow-build esbuild
pnpm run build     # verifies the toolchain end-to-end
pnpm test          # runs the vitest suite
```

### Deviations from the spec, and why

- **create-vite version pin (v5, not "@latest")** — required to work around
  the Node 18 incompatibility described above. Produces an identical
  Svelte-5-template output to what `@latest` would have given on a newer
  Node; only the CLI tool itself needed pinning, not the scaffolded project.
- **vitest pinned to 3.2.7, not latest** — same reason (Node 18 engine
  compatibility). Vitest 3.x is still a current, actively-maintained major
  version, not a legacy fallback.
- **JS, not TypeScript** — per the task brief's explicit preference
  ("plain JS is fine, this team is not deeply technical, prefer simplicity
  over TypeScript ceremony"). JSDoc comments are used throughout
  `mockRgs/*.js` to document shapes without adding build-time TS ceremony.
- **All 5 reel strips currently share one placeholder strip template**
  (`paytable.js` builds `REEL_STRIPS` by mapping the same generator 5 times).
  A real math pass would very likely tune each reel independently; sharing
  one template is a deliberate simplification for this placeholder layer,
  not an oversight. Flagged in a comment at the `REEL_STRIPS` definition.
- **Ways-pay aggregation convention**: the spec text ("multiplier of total
  bet per matching way... sum across all winning ways this spin") was read
  as: for each of the 8 payable symbols, find the single longest
  reel-0-anchored run (>=3) and pay `ways_count (product of per-reel match
  counts) × table_multiplier[length]`, then sum that across every symbol
  that hits in the same spin. This is the standard "ways" pay convention
  (e.g. 243-ways games) and is what `baseGame.js::evaluateWays` implements.
- **Scatter counting is uncapped at >5 in principle** (any cell can be a
  Scatter), but `SCATTER_TRIGGER_TABLE` only defines 3/4/5 — a spin landing
  6+ scatters (vanishingly unlikely at the documented strip weighting, and
  not reachable at all with the current 25-cell grid and this placeholder
  strip's scatter density, but not mathematically impossible for a
  hand-crafted `forceGrid`) would currently leave `triggeredFeature` logic
  in `index.js` looking the count up in that table and getting `undefined`
  (`Boolean(SCATTER_TRIGGER_TABLE[n])` -> `false`). That means a 6+ scatter
  grid built via `forceGrid` would silently NOT trigger the feature. Not
  fixed because the GDD only specifies 3/4/5 behavior; flagging here so
  whoever does the real math pass (D5) decides whether 6+ should map to the
  5-scatter parameters or be prevented entirely via strip design.
- **Multiplier pool weights** — the GDD/task brief gave pool *values* (e.g.
  pitcher 1st `{1, 1, 1.2}`) but not weights; "choose reasonable placeholder
  weights that make low values more common" was an explicit judgment call
  left to this implementation. Used `{5, 3, 2}` (lowest value heaviest) for
  every pool in `paytable.js::DUEL_SCORING` — same shape for all 6 pools,
  easy to re-tune later.
- **Base success probabilities (0.65 pitcher / 0.5 batter)**: the existing
  GDD (`docs/01_Design/GDD_BASEBALL_CAT_v0.1.md` §6 D6) has an old
  back-of-envelope placeholder of 0.35 for a since-replaced mechanic
  version. This task's brief explicitly specified 0.65 (pitcher) / 0.5
  (batter) for the CURRENT mechanic (guaranteed-slots vs. lives, 2-hit
  batter threshold), so those are what's implemented — flagged here since a
  reader skimming the GDD might expect 0.35 and wonder why it's different.
  Both values are explicitly marked "placeholder (fake, needs
  recalibration)" in `paytable.js`.
- **Reel-strip Scatter weighting is deliberately inflated** for manual-QA
  "see the Bonus Game trigger without clicking spin hundreds of times" — see
  the comment block above `STRIP_SYMBOL_WEIGHTS` in `paytable.js`. This is
  explicitly NOT representative of eventual real math.

### Placeholder values — full inventory (everything here needs D5 math/Rust-optimizer output before ship)

All defined in `frontend/src/lib/mockRgs/paytable.js`:
- Ways-pay table multipliers (6 payout tiers x 3 counts = 18 numbers).
- Reel strip symbol weights / composition (same template on all 5 reels).
- `DUEL_BASE_SUCCESS_PROB`: pitcher 0.65, batter 0.5.
- `DUEL_SCORING` base scores: pitcher `[1.0, 1.3, 1.7]`, batter
  `[1.0, 3.0, 8.0]`.
- `DUEL_SCORING` multiplier pools (6 pools x 3 values x weight `{5,3,2}`).
- `authenticate()`'s fake starting balance (1000.00 units) and bet-level
  ladder (`[0.2, 0.5, 1, 2, 5, 10, 25, 50, 100]`) in `index.js` — these are
  not from any spec at all, just plausible-looking stand-ins.

### Test results

```
pnpm test
 ✓ tests/scoring.test.js      (6 tests)
 ✓ tests/index.test.js        (9 tests)
 ✓ tests/rng.test.js          (8 tests)
 ✓ tests/baseGame.test.js     (17 tests)
 ✓ tests/duelFeature.test.js  (8 tests)

 Test Files  5 passed (5)
      Tests  48 passed (48)
```

`pnpm run build` also succeeds end to end (Vite production build, 114
modules transformed, no errors) — confirmed both right after scaffolding
(before the mockRgs code existed) and again after adding mockRgs + tests
(mockRgs isn't imported from the untouched default Svelte page yet, so the
bundle is unaffected either way; this just proves the build keeps working).

### What's explicitly NOT done (next steps, per the 5-step plan)

- No PixiJS rendering, no Svelte UI beyond the untouched `create-vite`
  starter page. Step 3/4 (separate task) builds the real game UI on top of
  `mockRgs`'s `play()` event log.
- No real math/RTP tuning — every number is a placeholder (see above),
  waiting on the math-SDK workstream (GDD D5).
- `pixi.js`'s bundled Claude Skill is still sitting unapproved in pnpm
  (`pnpm approve pixi.js` to grant it) — see setup notes above.
