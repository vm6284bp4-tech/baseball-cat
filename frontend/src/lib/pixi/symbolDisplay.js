/**
 * symbolDisplay.js — placeholder-art lookup: symbol id -> {label, fill, textColor}.
 *
 * Deliberately just colored rectangles + short text labels (see frontend
 * task brief: "placeholder art is fine... this is about proving the FLOW
 * and FEEL work, not final art"). Swap this file out wholesale once real
 * art exists; nothing else should need to change.
 *
 * Symbol ids come from `../mockRgs/paytable.js`'s SYMBOLS catalog.
 */

export const SYMBOL_DISPLAY = {
  WILD: { label: 'WILD', fill: 0xffd54a, textColor: 0x3a2d00 },
  SCATTER: { label: 'SCAT', fill: 0xff7043, textColor: 0x2a0f00 },
  HIGH_OPP3: { label: 'OPP3', fill: 0xe53e5e, textColor: 0xffffff },
  HIGH_OPP2: { label: 'OPP2', fill: 0xf06292, textColor: 0x2a0012 },
  HIGH_OPP1: { label: 'OPP1', fill: 0xf8a5c2, textColor: 0x2a0012 },
  HIGH_BAT: { label: 'BAT', fill: 0x8d6e63, textColor: 0xffffff },
  LOW_JERSEY: { label: 'JERSY', fill: 0x4fc3f7, textColor: 0x002733 },
  LOW_GLOVE: { label: 'GLOVE', fill: 0x4dd0e1, textColor: 0x00282b },
  LOW_BASE: { label: 'BASE', fill: 0xaed581, textColor: 0x1a2900 },
  LOW_CAP: { label: 'CAP', fill: 0xc5e1a5, textColor: 0x1a2900 },
};

export function getSymbolDisplay(symbolId) {
  return SYMBOL_DISPLAY[symbolId] ?? { label: String(symbolId).slice(0, 5), fill: 0x999999, textColor: 0x000000 };
}
