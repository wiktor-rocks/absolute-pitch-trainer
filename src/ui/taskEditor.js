// Practice-tab "Customize" panel, generated from the schema in tasks/customize.js.
import { h } from './dom.js';
import { pcName, WHITE_PCS, ALL_PCS } from '../data/notes.js';
import { FIELDS, BLOCK_FIELDS, OCTAVES, schemaKind, valuesFor, normalizeOverrides } from '../tasks/customize.js';

/**
 * @param {object} base                 the built-in task config
 * @param {object} overrides            saved overrides to start from
 * @param {object} o
 * @param {(t:string)=>string} o.timbreLabel
 * @param {(t:string)=>boolean} o.timbreAvailable
 * @param {(overrides:object)=>void} o.onChange
 */
export function createTaskEditor(base, overrides, { timbreLabel, timbreAvailable, onChange }) {
  let values = valuesFor(base, overrides);
  const body = h('div', { class: 'editor-body' });
  const count = h('span', { class: 'editor-count' });
  const reset = h('button', { class: 'btn small', type: 'button' }, 'Reset to the study’s settings');
  const el = h('details', { class: 'task-editor' },
    h('summary', {}, 'Customize', count),
    body,
    h('div', { class: 'editor-foot' }, reset));

  const emit = () => {
    const o = normalizeOverrides(base, values);
    const n = Object.keys(o).length;
    count.textContent = n ? ' · changed' : '';
    el.classList.toggle('changed', !!n);
    onChange(o);
  };
  reset.onclick = () => { values = valuesFor(base, {}); render(); emit(); };

  function control(f, get, set) {
    const v = get();
    switch (f.type) {
      case 'pcs': {
        const chips = ALL_PCS.map((p) => {
          const on = v.includes(p);
          return h('button', { type: 'button', class: `chip-toggle${on ? ' on' : ''}${WHITE_PCS.includes(p) ? '' : ' black'}`, 'aria-pressed': String(on),
            onclick: () => { const cur = get(); set(cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p].sort((a, b) => a - b)); render(); } }, pcName(p));
        });
        const preset = (label, pcs) => h('button', { type: 'button', class: 'btn ghost small', onclick: () => { set([...pcs]); render(); } }, label);
        return [h('div', { class: 'chip-row' }, chips), h('div', { class: 'chip-row presets' }, preset('White keys', WHITE_PCS), preset('All 12', ALL_PCS), preset('None', []))];
      }
      case 'timbres':
      case 'enumset': {
        const opts = f.type === 'timbres' ? f.options.filter(timbreAvailable).map((t) => [t, timbreLabel(t)]) : Object.entries(f.options);
        return h('div', { class: 'chip-row' }, opts.map(([k, label]) => {
          const on = v.includes(k);
          return h('button', { type: 'button', class: `chip-toggle${on ? ' on' : ''}`, 'aria-pressed': String(on),
            onclick: () => { const cur = get(); set(cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]); render(); } }, label);
        }));
      }
      case 'octaves': {
        const sel = (i) => {
          const s = h('select', {}, OCTAVES.map((o) => h('option', { value: o, selected: o === v[i] }, String(o))));
          s.onchange = () => { const n = [...get()]; n[i] = Number(s.value); if (n[0] > n[1]) n[1 - i] = n[i]; set(n); render(); };
          return s;
        };
        return h('div', { class: 'inline' }, 'from octave ', sel(0), ' to ', sel(1));
      }
      case 'int': {
        const inp = h('input', { type: 'number', min: f.min, max: f.max, step: f.step, value: v });
        inp.onchange = () => { const n = Math.min(f.max, Math.max(f.min, Number(inp.value) || f.min)); inp.value = n; set(n); emit(); };
        return h('div', { class: 'inline' }, inp, f.unit ? ` ${f.unit}` : null);
      }
      case 'bool': {
        const cb = h('input', { type: 'checkbox', checked: v });
        cb.onchange = () => { set(cb.checked); render(); };
        return cb;
      }
      case 'enum': {
        const s = h('select', {}, Object.entries(f.options).map(([k, label]) => h('option', { value: k, selected: k === v }, label)));
        s.onchange = () => { set(s.value); render(); };
        return s;
      }
    }
  }

  function row(f, get, set) {
    const c = control(f, get, set);
    if (f.type === 'bool') return h('label', { class: 'field bool' }, c, h('span', {}, f.label, f.hint ? h('span', { class: 'muted' }, ` ${f.hint}`) : null));
    return h('div', { class: 'field' }, h('div', { class: 'field-label' }, f.label), c);
  }

  function render() {
    const open = el.open;
    body.replaceChildren(...FIELDS[schemaKind(base)].map((g) => h('fieldset', {}, h('legend', {}, g.group),
      g.fields.map((f) => row(f, () => values[f.key], (x) => { values = { ...values, [f.key]: x }; })))));
    if (values.blocks) {
      values.blocks.forEach((b, i) => {
        const setB = (k) => (x) => { values = { ...values, blocks: values.blocks.map((bb, j) => (j === i ? { ...bb, [k]: x } : bb)) }; };
        const fields = BLOCK_FIELDS.filter((f) => f.key === 'enabled' || (b.enabled && (f.key !== 'n' || b.mode === 'sample')));
        body.append(h('fieldset', { class: b.enabled ? '' : 'off' }, h('legend', {}, `Block ${i + 1}`),
          fields.map((f) => row(f, () => values.blocks[i][f.key], setB(f.key)))));
      });
    }
    el.open = open;
    emit();
  }
  render();
  return { el };
}
