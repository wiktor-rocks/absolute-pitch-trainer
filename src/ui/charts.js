// Minimal SVG charts: multi-series line chart with hover tooltip, and a confusion heatmap.
import { h, s } from './dom.js';
import { pcName, pcParts, PC_SHARP } from '../data/notes.js';

/**
 * @param {object} o
 * @param {Array<{name:string, color:string, points:Array<{x:number,y:number,label?:string}>}>} o.series
 * @param {[number,number]} [o.yDomain]
 * @param {(y:number)=>string} [o.yFmt]
 * @param {(x:number)=>string} [o.xFmt]
 */
export function lineChart({ series, yDomain, yFmt = (y) => String(y), xFmt = (x) => String(x), height = 220, yLabel }) {
  const W = 640, H = height, m = { l: 48, r: 16, t: 12, b: 28 };
  const all = series.flatMap((s) => s.points);
  if (!all.length) return h('div', { class: 'empty' }, 'No data yet');
  const xs = all.map((p) => p.x);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  let [y0, y1] = yDomain || [Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y))];
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const X = (x) => m.l + ((x - x0) / (x1 - x0)) * (W - m.l - m.r);
  const Y = (y) => H - m.b - ((y - y0) / (y1 - y0)) * (H - m.t - m.b);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': yLabel || 'chart' });
  // grid + y ticks
  for (let i = 0; i <= 4; i++) {
    const yv = y0 + ((y1 - y0) * i) / 4;
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(yv), y2: Y(yv), class: i === 0 ? 'axis' : 'grid' }));
    svg.append(s('text', { x: m.l - 8, y: Y(yv), class: 'tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, yFmt(yv)));
  }
  // x ticks: unique x values, thinned
  const ux = [...new Set(xs)].sort((a, b) => a - b);
  const step = Math.ceil(ux.length / 8);
  ux.filter((_, i) => i % step === 0).forEach((xv) =>
    svg.append(s('text', { x: X(xv), y: H - 8, class: 'tick', 'text-anchor': 'middle' }, xFmt(xv))));

  for (const se of series) {
    if (!se.points.length) continue;
    const d = se.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${Y(p.y)}`).join(' ');
    svg.append(s('path', { d, class: 'series-line', style: `stroke:${se.color}` }));
    for (const p of se.points) svg.append(s('circle', { cx: X(p.x), cy: Y(p.y), r: 4, style: `fill:${se.color}`, class: 'series-dot' }));
  }

  // hover: crosshair + tooltip at nearest x
  const cross = s('line', { y1: m.t, y2: H - m.b, class: 'crosshair', visibility: 'hidden' });
  svg.append(cross);
  const tip = h('div', { class: 'tooltip', hidden: true });
  const wrap = h('div', { class: 'chart-wrap' }, svg, tip);
  const hit = s('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' });
  svg.append(hit);
  hit.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = ux[0];
    for (const xv of ux) if (Math.abs(X(xv) - px) < Math.abs(X(best) - px)) best = xv;
    cross.setAttribute('x1', X(best)); cross.setAttribute('x2', X(best)); cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.replaceChildren(h('div', { class: 'tip-title' }, xFmt(best)),
      ...series.map((se) => {
        const p = se.points.find((q) => q.x === best);
        return p ? h('div', { class: 'tip-row' }, h('span', { class: 'swatch', style: { background: se.color } }), `${se.name}: `, h('b', {}, yFmt(p.y)), p.label ? h('span', { class: 'muted' }, ` · ${p.label}`) : null) : null;
      }));
    const left = (X(best) / W) * r.width;
    tip.style.left = `${Math.min(r.width - 180, Math.max(0, left + 12))}px`;
    tip.style.top = `8px`;
  });
  hit.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });

  const legend = series.length > 1
    ? h('div', { class: 'legend' }, series.map((se) => h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: { background: se.color } }), se.name)))
    : null;
  return h('div', {}, legend, wrap);
}

/** 12×12 confusion matrix (rows = presented, cols = answered), sequential blue. */
export function confusionHeatmap(matrix) {
  const both = !!pcParts(0).sub;
  const cell = 26, pad = both ? 56 : 34;
  const W = pad + 12 * cell, H = pad + 12 * cell;
  const svg = s('svg', { viewBox: `0 0 ${W + 4} ${H + 4}`, class: 'heatmap', role: 'img', 'aria-label': 'Confusion matrix' });
  const max = Math.max(1, ...matrix.flat());
  const tip = h('div', { class: 'tooltip', hidden: true });
  for (let i = 0; i < 12; i++) {
    const main = pcParts(i).main;
    svg.append(s('text', { x: pad - 6, y: pad + i * cell + cell / 2, class: 'tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, both ? `${main} ${PC_SHARP[i]}` : main));
    const cx = pad + i * cell + cell / 2;
    svg.append(both
      ? s('text', { x: cx, y: pad - 22, class: 'tick', 'text-anchor': 'middle' }, s('tspan', { x: cx }, main), s('tspan', { x: cx, dy: '1.2em' }, PC_SHARP[i]))
      : s('text', { x: cx, y: pad - 8, class: 'tick', 'text-anchor': 'middle' }, main));
    for (let j = 0; j < 12; j++) {
      const v = matrix[i][j];
      const r = s('rect', {
        x: pad + j * cell + 1, y: pad + i * cell + 1, width: cell - 2, height: cell - 2, rx: 3,
        class: 'hm-cell' + (i === j ? ' diag' : ''),
        style: `fill-opacity:${v ? 0.15 + 0.85 * (v / max) : 1}`,
        'data-empty': v ? null : '1',
      });
      r.addEventListener('mouseenter', () => { tip.hidden = false; tip.textContent = `Heard ${pcName(i)}, answered ${pcName(j)}: ${v}`; });
      r.addEventListener('mouseleave', () => { tip.hidden = true; });
      svg.append(r);
    }
  }
  return h('div', { class: 'chart-wrap' }, svg, tip,
    h('div', { class: 'hint' }, 'Rows: note played · Columns: your answer · Diagonal = correct'));
}
