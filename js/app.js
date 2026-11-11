// App shell: connect screen, first-run family setup, navigation, polling.
import { h, toast, fmtTime, uid, today } from './util.js';
import { db, conn, setConn, sync, loadCache, onChange, setting, setSettings, apply, kids,
  testConnection, loaded } from './store.js';
import { state, go, render, setRenderer, unlocked, unlock } from './nav.js';
import { homeView, personView, mealsView, listsView } from './views-main.js';
import { calendarView } from './views-calendar.js';
import { parentView, personForm, changePin } from './views-parent.js';
import { pinPad } from './ui.js';

const root = document.getElementById('app');

const NAV = [['home', '✅', 'Today'], ['calendar', '📅', 'Calendar'], ['meals', '🍽️', 'Dinner'],
  ['lists', '📝', 'Lists'], ['parent', '🔒', 'Parents']];

async function openParent() {
  const pin = setting('pin');
  if (!pin || unlocked()) return go('parent');
  const entered = await pinPad();
  if (entered == null) return;
  if (entered !== pin) return toast('Wrong PIN');
  unlock();
  go('parent');
}

// ---------- screens before the main app ----------
function connectScreen() {
  const url = h('input', { type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec' });
  const key = h('input', { type: 'text', placeholder: 'Family key' });
  const msg = h('p', { class: 'muted' });
  return h('div', { class: 'welcome' },
    h('div', { class: 'welcome-logo' }, '🏡'),
    h('h1', {}, 'Family Hub'),
    h('p', {}, 'Calendar, chores and stars for the whole family.'),
    h('div', { class: 'card' },
      h('h2', {}, 'Connect to your Google Sheet'),
      h('p', { class: 'muted' }, 'Paste the web app address and family key from the setup guide (README).'),
      h('label', { class: 'field' }, h('span', {}, 'Web app address'), url),
      h('label', { class: 'field' }, h('span', {}, 'Family key'), key),
      msg,
      h('button', { class: 'btn primary', onclick: async () => {
        msg.textContent = 'Checking…';
        try {
          await testConnection(url.value.trim(), key.value.trim());
          setConn({ url: url.value.trim(), key: key.value.trim() });
          start();
        } catch (e) {
          msg.textContent = 'That didn’t work: ' + e.message;
        }
      } }, 'Connect')),
    h('button', { class: 'btn', onclick: () => { setConn({ demo: true }); start(); } },
      'Just try it on this device (demo)'));
}

const draft = { starter: true };
function setupScreen() {
  return h('div', { class: 'welcome' },
    h('div', { class: 'welcome-logo' }, '👨‍👩‍👧‍👧'),
    h('h1', {}, 'Who’s in the family?'),
    h('div', { class: 'card' },
      db.people.map((p) => h('button', { class: 'row link', onclick: () => personForm(p) },
        h('span', { class: 'avatar small', style: { '--c': p.color } }, p.avatar),
        h('span', { class: 'grow' }, p.name), h('small', { class: 'muted' }, p.role === 'kid' ? 'Kid' : 'Parent'))),
      h('button', { class: 'btn', onclick: () => personForm() }, '+ Add family member')),
    h('label', { class: 'field inline' }, h('span', {}, 'Start the kids off with example chores and rewards'),
      h('input', { type: 'checkbox', checked: draft.starter, onchange: (e) => (draft.starter = e.target.checked) })),
    h('button', { class: 'btn primary big', disabled: !db.people.length, onclick: finishSetup }, 'All set →'));
}

async function finishSetup() {
  if (!(await changePin())) return;
  const ops = [];
  const add = (table, row) => ops.push({ t: 'put', table, row: { id: uid(), active: true, ...row } });
  if (draft.starter) {
    for (const k of kids()) {
      const t = (title, icon, when, stars) =>
        add('tasks', { title, icon, when, stars, personId: k.id, repeat: 'daily', days: '', date: '' });
      t('Get dressed', '👗', 'morning', 1);
      t('Brush teeth', '🪥', 'morning', 1);
      t('Make my bed', '🛏️', 'morning', 1);
      t('Tidy up toys', '🧸', 'evening', 2);
      t('Read a book', '📚', 'evening', 2);
      t('Brush teeth', '🦷', 'evening', 1);
    }
    [['Ice cream trip', '🍦', 20], ['Stay up 15 minutes', '🌙', 15], ['Pick dinner', '🍕', 25],
      ['Movie night', '🎬', 40]].forEach(([title, icon, cost]) => add('rewards', { title, icon, cost, personId: '' }));
  }
  ops.push({ t: 'put', table: 'settings', row: { id: 'setupDone', value: '1' } });
  await apply(ops);
}

// ---------- main render ----------
function mainView() {
  switch (state.view) {
    case 'person': return personView();
    case 'calendar': return calendarView();
    case 'meals': return mealsView();
    case 'lists': return listsView();
    case 'parent': return setting('pin') && !unlocked() ? homeView() : parentView();
    default: return homeView();
  }
}

setRenderer(() => {
  const keepScroll = document.querySelector('main') ? document.querySelector('main').scrollTop : 0;
  if (!conn) return root.replaceChildren(connectScreen());
  if (!loaded) return root.replaceChildren(h('div', { class: 'welcome' }, h('div', { class: 'welcome-logo spin' }, '⭐'), h('p', {}, 'Loading…')));
  if (!setting('setupDone')) return root.replaceChildren(setupScreen());
  const active = state.view === 'person' ? 'home' : state.view;
  const main = h('main', {}, mainView());
  root.replaceChildren(
    h('nav', { class: 'nav' }, NAV.map(([id, icon, label]) =>
      h('button', { class: active === id ? 'on' : '',
        onclick: () => (id === 'parent' ? openParent() : go(id)) },
        h('span', { class: 'nav-icon' }, icon), h('span', {}, label)))),
    main);
  main.scrollTop = keepScroll;
});

// Re-render on data change, but never under someone who is typing.
let deferred = false;
onChange(() => {
  const a = document.activeElement;
  if (a && root.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox') {
    deferred = true;
    return;
  }
  render();
});
document.addEventListener('focusout', () => setTimeout(() => {
  if (deferred) { deferred = false; render(); }
}, 50));

async function start() {
  render();
  if (!conn) return;
  loadCache();
  render();
  try {
    await sync();
  } catch (e) {
    toast('Can’t reach Google right now. Showing the last saved copy.');
  }
  render();
}

// One-tap device setup: a link ending in #c=<connection>.
if (location.hash.startsWith('#c=')) {
  try {
    const c = JSON.parse(atob(location.hash.slice(3)));
    if (c.url && c.key) setConn({ url: c.url, key: c.key });
  } catch (e) { /* ignore a broken link */ }
  history.replaceState(null, '', location.pathname);
}

// Keep fresh: poll Google, tick the clock, roll over at midnight.
let lastDay = today();
setInterval(() => {
  const c = document.getElementById('clock');
  if (c) c.textContent = fmtTime(new Date());
  if (today() !== lastDay) { lastDay = today(); render(); }
}, 15000);
setInterval(() => { if (conn && !document.hidden) sync().catch(() => {}); }, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && conn) sync().catch(() => {});
});

// Wall-tablet behaviour: after 3 idle minutes, lock parents and go home.
let idle;
const resetIdle = () => {
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (document.querySelector('dialog[open]')) return resetIdle();
    state.unlockedUntil = 0;
    if (conn && setting('setupDone') && state.view !== 'home') go('home');
  }, 3 * 60 * 1000);
};
['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, resetIdle, true));
resetIdle();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
