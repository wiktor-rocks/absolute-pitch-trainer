// Practice tab: every task, any time. These sessions never count toward the protocol.
import { h, clear } from './dom.js';
import { TASK_LIST } from '../tasks/configs.js';
import { normalizeOverrides } from '../tasks/customize.js';

/** @param {object} overrides  saved Practice customizations, by task id */
export function renderPractice(stage, overrides = {}) {
  const custom = (t) => Object.keys(normalizeOverrides(t, overrides[t.id])).length > 0;
  const group = (title, list) => h('div', {},
    h('h3', {}, title),
    h('div', { class: 'task-grid' }, list.map((t) => h('a', { class: 'task-card', href: `#/task/${t.id}` },
      h('div', { class: 'task-card-top' }, h('span', { class: 'badge' }, t.short), custom(t) ? h('span', { class: 'badge custom', title: 'Runs with your customized settings — change them on the task’s start screen' }, 'customized') : null),
      h('div', { class: 'task-card-name' }, t.name),
      h('div', { class: 'task-card-blurb' }, t.blurb)))));
  clear(stage).append(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', {}, 'Practice'),
      h('p', { class: 'lead' }, 'Run any task whenever you like. Practice results appear in Results, but they don’t count toward the protocol or unlock its tests. Open a task and use Customize on its start screen to change its notes, instruments, timing and feedback.')),
    h('section', { class: 'card' },
      group('Training', TASK_LIST.filter((t) => !t.test)),
      group('Tests', TASK_LIST.filter((t) => t.test)))));
}
