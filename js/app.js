// App shell: connect screen, first-run family setup, navigation, polling.
import { h, toast, fmtTime, uid, today, load, save } from './util.js';
import { db, conn, setConn, sync, loadCache, onChange, setting, setSettings, apply, kids,
  testConnection, loaded } from './store.js';
import { state, go, render, setRenderer, unlocked, unlock } from './nav.js';
import { homeView, personView, mealsView, listsView } from './views-main.js';
import { calendarView } from './views-calendar.js';
import { parentView, personForm, changePin, openParent } from './views-parent.js';
import { pinPad, avatar } from './ui.js';

const root = document.getElementById('app');

const NAV = [['home', '✅', 'Today'], ['calendar', '📅', 'Calendar'], ['meals', '🍽️', 'Dinner'],
  ['lists', '📝', 'Lists']];

// ---------- full screen ----------
// Browsers only allow full screen after a tap, so it can't switch on by itself at start-up.
// Once someone chooses it, the next tap after a reload puts it back, until they leave it.
const page = document.documentElement;
const canFull = !!(page.requestFullscreen || page.webkitRequestFullscreen);
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function enterFull() {
  const req = page.requestFullscreen || page.webkitRequestFullscreen;
  try {
    const p = req.call(page, { navigationUI: 'hide' });
    if (p && p.catch) p.catch(refused);
  } catch (e) { refused(); }
}
function refused() {
  save('fh-full', false);   // stop asking on every tap
  toast('This browser won’t go full screen here.');
}
function toggleFull() {
  if (isFull()) {
    save('fh-full', false);
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    save('fh-full', true);
    enterFull();
  }
}
['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => document.addEventListener(ev, () => {
  if (!isFull()) save('fh-full', false);   // left by the system (back, swipe): don't force it back
  render();
}));
document.addEventListener('pointerup', (e) => {
  if (canFull && load('fh-full') && !isFull() && !e.target.closest('.nav-full')) enterFull();
}, true);
const FULL_ICON = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
const EXIT_ICON = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';

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
        avatar(p, 'small'),
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
  // Panels that scroll on their own (task columns, the week grid) keep their place across re-renders.
  const keep = {};
  document.querySelectorAll('[data-scroll]').forEach((el) => (keep[el.dataset.scroll] = [el.scrollTop, el.scrollLeft]));
  if (!conn) return root.replaceChildren(connectScreen());
  if (!loaded) return root.replaceChildren(h('div', { class: 'welcome' }, h('div', { class: 'welcome-logo spin' }, '⭐'), h('p', {}, 'Loading…')));
  if (!setting('setupDone')) return root.replaceChildren(setupScreen());
  const active = state.view === 'person' ? 'home' : state.view;
  const view = mainView();
  const main = h('main', { class: view.classList.contains('fill') ? 'fill' : '' }, view);
  root.replaceChildren(
    h('nav', { class: 'nav' },
      NAV.map(([id, icon, label]) =>
        h('button', { class: active === id ? 'on' : '', onclick: () => go(id) },
          h('span', { class: 'nav-icon' }, icon), h('span', {}, label))),
      canFull && h('button', { class: 'nav-push nav-full', onclick: toggleFull, 'aria-pressed': String(isFull()) },
        h('span', { class: 'nav-icon', innerHTML: isFull() ? EXIT_ICON : FULL_ICON }),
        h('span', {}, isFull() ? 'Exit full' : 'Full screen')),
      h('button', { class: (active === 'parent' ? 'on' : '') + (canFull ? '' : ' nav-push'), onclick: () => openParent() },
        h('span', { class: 'nav-icon' }, '🔒'), h('span', {}, 'Parents'))),
    main);
  main.scrollTop = keepScroll;
  main.querySelectorAll('[data-scroll]').forEach((el) => {
    const k = keep[el.dataset.scroll];
    if (k) [el.scrollTop, el.scrollLeft] = k;
    else if (el.dataset.scrollTo) el.scrollTop = Number(el.dataset.scrollTo);
  });
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
    if (document.querySelector('.modal-layer')) return resetIdle();
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
