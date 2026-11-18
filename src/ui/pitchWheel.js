// The 12-category pitch wheel used for responses (C at 12 o'clock, clockwise chromatic).
import { s } from './dom.js';
import { pcNames, pcParts, isBlackPc } from '../data/notes.js';

/** @param {object} o  `allowed`: pitch classes that can be picked (others are greyed out); default all 12 */
export function createPitchWheel({ onPick, size = 420, allowed = null } = {}) {
  const R = 200, r = 92, cx = 210, cy = 210;
  const svg = s('svg', { viewBox: '0 0 420 420', width: size, height: size, class: 'wheel', role: 'group', 'aria-label': 'Pitch wheel' });
  const segs = [];
  let enabled = false;

  for (let i = 0; i < 12; i++) {
    const a0 = ((i - 0.5) / 12) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 0.5) / 12) * 2 * Math.PI - Math.PI / 2;
    const gap = 0.012;
    const p = (rad, a) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
    const d = `M ${p(R, a0 + gap)} A ${R} ${R} 0 0 1 ${p(R, a1 - gap)} L ${p(r, a1 - gap)} A ${r} ${r} 0 0 0 ${p(r, a0 + gap)} Z`;
    const am = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const black = isBlackPc(i);
    const off = allowed ? !allowed.includes(i) : false;
    const names = pcNames(i);
    const tx = cx + ((R + r) / 2) * Math.cos(am), ty = cy + ((R + r) / 2) * Math.sin(am);
    const parts = pcParts(i);
    const label = parts.sub
      ? s('text', { x: tx, y: ty, class: 'wheel-label', 'text-anchor': 'middle', 'dominant-baseline': 'middle' },
          s('tspan', { x: tx, dy: '-0.3em' }, parts.main), s('tspan', { x: tx, dy: '1.25em', class: 'wheel-sub' }, parts.sub))
      : names.length > 1
      ? s('text', { x: tx, y: ty, class: 'wheel-label small', 'text-anchor': 'middle', 'dominant-baseline': 'middle' },
          s('tspan', { x: tx, dy: '-0.55em' }, names[0]), s('tspan', { x: tx, dy: '1.15em' }, names[1]))
      : s('text', { x: tx, y: ty, class: 'wheel-label', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, names[0]);
    const g = s('g', {
      class: `wheel-seg ${black ? 'black' : 'white'}${off ? ' off' : ''}`, role: 'button', 'aria-label': names.join(' / '), 'aria-disabled': off ? 'true' : null,
      onclick: (e) => { if (enabled && !off) onPick?.(i, e); },
      onkeydown: (e) => { if (enabled && !off && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick?.(i, e); } },
    }, s('path', { d }), label);
    segs.push(g);
    svg.append(g);
  }
  const centerText = s('text', { x: cx, y: cy, class: 'wheel-center', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '');
  svg.append(centerText);

  return {
    el: svg,
    enable(on = true) { enabled = on; svg.classList.toggle('disabled', !on); },
    reset() { segs.forEach((g) => g.classList.remove('correct', 'wrong', 'chosen')); centerText.textContent = ''; },
    mark(pc, cls) { segs[pc].classList.add(cls); },
    center(text) { centerText.textContent = text; },
  };
}
