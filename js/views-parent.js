// Parent area (behind the PIN): stars, tasks, rewards, family, settings.
import { h, uid, today, toast } from './util.js';
import { db, conn, setConn, kids, person, balance, adjustStars, put, del, apply, setting,
  setSettings, cancelRedemption, sync } from './store.js';
import { state, go, render, unlocked, unlock } from './nav.js';
import { formDialog, confirmDialog, pinPad, COLORS, avatar } from './ui.js';
import { searchPlace } from './weather.js';

const REPEAT = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'School days (Mon–Fri)' },
  { value: 'weekly', label: 'Certain days each week' },
  { value: 'once', label: 'Just once' },
];
const WHEN = [
  { value: 'morning', label: '☀️ Morning' },
  { value: 'day', label: '🌤️ Any time' },
  { value: 'evening', label: '🌙 Evening' },
];
const repeatLabel = (t) => t.repeat === 'weekly'
  ? String(t.days || '').split(',').filter(Boolean).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(' ')
  : t.repeat === 'once' ? 'Once' + (t.date ? ' · ' + t.date : '') : REPEAT.find((r) => r.value === t.repeat).label;

// Ask for the PIN (if one is set), then open the parent area. Resolves true once it is open.
export async function openParent(extra = {}) {
  const pin = setting('pin');
  if (pin && !unlocked()) {
    const entered = await pinPad();
    if (entered == null) return false;
    if (entered !== pin) return toast('Wrong PIN'), false;
    unlock();
  }
  go('parent', extra);
  return true;
}

// From the home screen's "Set up weather" button.
export async function setUpWeather() {
  if (await openParent({ parentTab: 'settings' })) weatherForm();
}

export function parentView() {
  const tab = state.parentTab || 'stars';
  const tabs = [['stars', '⭐ Stars'], ['tasks', '✅ Tasks'], ['rewards', '🎁 Rewards'],
    ['family', '👨‍👩‍👧‍👧 Family'], ['settings', '⚙️ Settings']];
  const body = { stars: starsTab, tasks: tasksTab, rewards: rewardsTab, family: familyTab, settings: settingsTab }[tab];
  return h('div', { class: 'page' },
    h('header', { class: 'page-top' }, h('h1', {}, '🔒 Parents'),
      h('button', { class: 'btn', onclick: () => { state.unlockedUntil = 0; go('home'); } }, 'Lock')),
    h('div', { class: 'tabs' }, tabs.map(([id, label]) =>
      h('button', { class: tab === id ? 'on' : '', onclick: () => go('parent', { parentTab: id }) }, label))),
    body());
}

// ---------- Stars ----------
function starForm(p, sign) {
  formDialog({
    title: (sign > 0 ? 'Give stars to ' : 'Take stars from ') + p.name,
    saveLabel: sign > 0 ? 'Give' : 'Take away',
    fields: [
      { name: 'n', label: 'How many stars', type: 'number', value: 1, min: 1 },
      { name: 'reason', label: 'Why', placeholder: sign > 0 ? 'Being kind to your sister' : 'Not listening' },
    ],
    onSave: (v) => {
      if (v.n <= 0) return false;
      adjustStars(p.id, sign * v.n, v.reason || (sign > 0 ? 'Bonus stars' : 'Stars taken away'));
    },
  });
}

function starsTab() {
  const pending = db.redemptions.filter((r) => r.status === 'pending');
  const log = [...db.starlog].sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 40);
  return h('div', {},
    h('div', { class: 'kid-cards' }, kids().map((p) =>
      h('div', { class: 'card kid-card', style: { '--c': p.color } },
        avatar(p), h('strong', {}, p.name),
        h('div', { class: 'star-count' }, '⭐ ' + balance(p.id)),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => starForm(p, 1) }, '+ Give'),
          h('button', { class: 'btn danger', onclick: () => starForm(p, -1) }, '− Take away'))))),
    pending.length ? h('div', { class: 'card' }, h('h2', {}, 'Rewards to hand out'),
      pending.map((r) => h('div', { class: 'row' },
        h('span', { class: 'grow' }, `${(person(r.personId) || {}).name || '?'}: ${r.title} (${r.cost} ⭐)`),
        h('button', { class: 'btn primary', onclick: () => put('redemptions', { ...r, status: 'given' }) }, 'Given ✓'),
        h('button', { class: 'btn', onclick: () => cancelRedemption(r) }, 'Refund')))) : null,
    h('div', { class: 'card' }, h('h2', {}, 'Recent star activity'),
      log.length ? log.map((s) => h('div', { class: 'row' },
        h('span', { class: 'delta ' + (s.delta < 0 ? 'neg' : 'pos') }, (s.delta > 0 ? '+' : '') + s.delta),
        h('span', { class: 'grow' }, `${(person(s.personId) || {}).name || '?'} · ${s.reason}`),
        h('small', { class: 'muted' }, new Date(s.ts).toLocaleDateString([], { month: 'short', day: 'numeric' })),
        h('button', { class: 'btn small', onclick: async () => {
          if (await confirmDialog('Undo this star entry?', 'Undo', 'Keep')) del('starlog', s.id);
        } }, 'Undo'))) : h('p', { class: 'muted' }, 'No stars yet')));
}

// ---------- Tasks ----------
function taskForm(t) {
  const isNew = !t;
  t = t || { title: '', icon: '⭐', personId: (kids()[0] || db.people[0] || {}).id, stars: 1,
    repeat: 'daily', days: '', date: today(), when: 'day', active: true };
  formDialog({
    title: isNew ? 'New task or habit' : 'Edit task',
    fields: [
      { name: 'title', label: 'What', value: t.title, placeholder: 'Feed the dog' },
      { name: 'icon', label: 'Picture', type: 'emoji', value: t.icon,
        show: (v) => v.personId === '*' || (person(v.personId) || {}).role === 'kid' },   // adults' tasks are text only
      { name: 'personId', label: 'Who', type: 'select', value: t.personId,
        options: [...db.people.map((p) => ({ value: p.id, label: `${p.avatar} ${p.name}` })),
          ...(isNew && kids().length > 1 ? [{ value: '*', label: '👧👧 All kids' }] : [])] },
      { name: 'stars', label: 'Stars earned (kids only)', type: 'number', value: t.stars, min: 0 },
      { name: 'repeat', label: 'How often', type: 'select', value: t.repeat, options: REPEAT },
      { name: 'days', label: 'Which days', type: 'days', value: t.days, show: (v) => v.repeat === 'weekly' },
      { name: 'date', label: 'Do it on', type: 'date', value: t.date || today(), show: (v) => v.repeat === 'once' },
      { name: 'when', label: 'Time of day', type: 'select', value: t.when || 'day', options: WHEN },
      !isNew && { name: 'active', label: 'Active', type: 'checkbox', value: t.active },
    ].filter(Boolean),
    onDelete: isNew ? null : () => del('tasks', t.id),
    onSave: (v) => {
      if (!v.title) return false;
      if (v.repeat === 'weekly' && !v.days) return toast('Pick at least one day'), false;
      const who = v.personId === '*' ? kids().map((k) => k.id) : [v.personId];
      apply(who.map((personId) => ({ t: 'put', table: 'tasks',
        row: { ...v, active: isNew ? true : v.active, personId, id: isNew ? uid() : t.id } })));
    },
  });
}

// Quick add from a person's column on the main screen. No PIN needed, so a task
// added this way only earns stars when the parent area is unlocked (or has no PIN).
export function quickTaskForm(p) {
  const kid = p.role === 'kid';
  const canStar = kid && (!setting('pin') || unlocked());
  const hr = new Date().getHours();
  formDialog({
    title: 'New task for ' + p.name,
    saveLabel: 'Add',
    fields: [
      { name: 'title', label: 'What', placeholder: kid ? 'Feed the dog' : 'Book the dentist' },
      kid && { name: 'icon', label: 'Picture', type: 'emoji', value: '⭐' },
      { name: 'when', label: 'Time of day', type: 'select', value: hr < 12 ? 'morning' : hr < 17 ? 'day' : 'evening', options: WHEN },
      { name: 'repeat', label: 'How often', type: 'select', value: 'once', options: REPEAT.filter((r) => r.value !== 'weekly') },
      canStar && { name: 'stars', label: 'Stars earned', type: 'number', value: 1, min: 0 },
    ].filter(Boolean),
    onSave: (v) => {
      if (!v.title) return false;
      put('tasks', { id: uid(), title: v.title, icon: v.icon || '⭐', personId: p.id, stars: canStar ? v.stars : 0,
        repeat: v.repeat, days: '', date: today(), when: v.when, active: true });
    },
  });
}

function tasksTab() {
  return h('div', {},
    h('button', { class: 'btn primary', onclick: () => taskForm() }, '+ New task or habit'),
    db.people.map((p) => {
      const list = db.tasks.filter((t) => t.personId === p.id);
      return h('div', { class: 'card', style: { '--c': p.color } },
        h('h2', {}, `${p.avatar} ${p.name}`),
        list.length ? list.map((t) => h('button', { class: 'row link' + (t.active ? '' : ' inactive'),
          onclick: () => taskForm(t) },
          p.role === 'kid' && h('span', { class: 'row-icon' }, t.icon), h('span', { class: 'grow' }, t.title),
          h('small', { class: 'muted' }, repeatLabel(t) + (t.active ? '' : ' · paused')),
          p.role === 'kid' && h('span', {}, '⭐ ' + t.stars))) : h('p', { class: 'muted' }, 'No tasks yet'));
    }));
}

// ---------- Rewards ----------
function rewardForm(r) {
  const isNew = !r;
  r = r || { title: '', icon: '🎁', cost: 20, personId: '', active: true };
  formDialog({
    title: isNew ? 'New reward' : 'Edit reward',
    fields: [
      { name: 'title', label: 'Reward', value: r.title, placeholder: 'Movie night' },
      { name: 'icon', label: 'Picture', type: 'emoji', value: r.icon },
      { name: 'cost', label: 'Stars needed', type: 'number', value: r.cost, min: 1 },
      { name: 'personId', label: 'For', type: 'select', value: r.personId,
        options: [{ value: '', label: 'All kids' }, ...kids().map((p) => ({ value: p.id, label: p.name }))] },
      !isNew && { name: 'active', label: 'Active', type: 'checkbox', value: r.active },
    ].filter(Boolean),
    onDelete: isNew ? null : () => del('rewards', r.id),
    onSave: (v) => {
      if (!v.title || v.cost <= 0) return false;
      put('rewards', { ...v, active: isNew ? true : v.active, id: isNew ? uid() : r.id });
    },
  });
}

function rewardsTab() {
  const list = [...db.rewards].sort((a, b) => a.cost - b.cost);
  return h('div', {},
    h('button', { class: 'btn primary', onclick: () => rewardForm() }, '+ New reward'),
    h('div', { class: 'card' },
      list.length ? list.map((r) => h('button', { class: 'row link' + (r.active ? '' : ' inactive'),
        onclick: () => rewardForm(r) },
        h('span', { class: 'row-icon' }, r.icon), h('span', { class: 'grow' }, r.title),
        h('small', { class: 'muted' }, r.personId ? (person(r.personId) || {}).name : 'All kids'),
        h('span', {}, '⭐ ' + r.cost))) : h('p', { class: 'muted' }, 'No rewards yet')));
}

// ---------- Family ----------
export function personForm(p, onDone) {
  const isNew = !p;
  p = p || { name: '', role: 'kid', avatar: '👧', color: COLORS[db.people.length % COLORS.length] };
  formDialog({
    title: isNew ? 'Add family member' : 'Edit ' + p.name,
    fields: [
      { name: 'name', label: 'Name', value: p.name },
      { name: 'role', label: 'Role', type: 'select', value: p.role,
        options: [{ value: 'kid', label: 'Kid (earns stars)' }, { value: 'parent', label: 'Parent' }] },
      { name: 'photo', label: 'Photo', type: 'photo', value: p.photo || '' },
      { name: 'avatar', label: 'Or pick a picture', type: 'emoji', value: p.avatar, show: (v) => !v.photo },
      { name: 'color', label: 'Colour', type: 'color', value: p.color },
      !conn.demo && db.calendars.length && { name: 'calendarId', label: 'Their Google calendar', type: 'select',
        value: p.calendarId || '',
        options: [{ value: '', label: 'None' }, ...db.calendars.map((c) => ({ value: c.id, label: c.name }))] },
    ].filter(Boolean),
    onDelete: isNew ? null : () => apply([
      { t: 'del', table: 'people', id: p.id },
      ...db.tasks.filter((t) => t.personId === p.id).map((t) => ({ t: 'del', table: 'tasks', id: t.id })),
    ]),
    onSave: async (v) => {
      if (!v.name) return false;
      await put('people', { ...v, id: isNew ? uid() : p.id });
      if (v.calendarId) {   // make sure that calendar is one of the ones being fetched
        const primary = (db.calendars.find((c) => c.primary) || {}).id;
        const ids = setting('calendarIds', primary || '').split(',').filter(Boolean);
        if (!ids.includes(v.calendarId)) {
          await setSettings({ calendarIds: [...ids, v.calendarId].join(',') });
          sync().catch(() => {});
        }
      }
      if (onDone) onDone();
    },
  });
}

function familyTab() {
  return h('div', {},
    h('button', { class: 'btn primary', onclick: () => personForm() }, '+ Add family member'),
    h('div', { class: 'card' }, db.people.map((p) =>
      h('button', { class: 'row link', onclick: () => personForm(p) },
        avatar(p, 'small'),
        h('span', { class: 'grow' }, p.name),
        h('small', { class: 'muted' }, p.role === 'kid' ? 'Kid' : 'Parent')))));
}

// ---------- Settings ----------
export async function changePin() {
  const a = await pinPad('Choose a 4-digit parent PIN');
  if (!a) return false;
  const b = await pinPad('Type it once more');
  if (a !== b) return toast('Those didn’t match. PIN not changed.'), false;
  await setSettings({ pin: a });
  toast('PIN saved');
  return true;
}

const here = () => new Promise((resolve, reject) =>
  navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, maximumAge: 10 * 60 * 1000 }));

function useWeatherPlace(lat, lon, place, tempUnit) {
  localStorage.removeItem('fh-weather');
  return setSettings({ lat, lon, place, tempUnit });
}

function weatherForm() {
  const canLocate = 'geolocation' in navigator && window.isSecureContext;
  formDialog({
    title: 'Weather location', saveLabel: 'Save',
    fields: [
      canLocate && { name: 'how', label: 'Where', type: 'select', value: 'search',
        options: [{ value: 'search', label: 'Search for a town' }, { value: 'here', label: 'Use this tablet’s location' }] },
      { name: 'place', label: 'Town or city', placeholder: 'Charlotte', show: (v) => v.how !== 'here' },
      { name: 'unit', label: 'Temperature', type: 'select', value: setting('tempUnit', 'fahrenheit'),
        options: [{ value: 'fahrenheit', label: '°F' }, { value: 'celsius', label: '°C' }] },
    ].filter(Boolean),
    onSave: async (v) => {
      if (v.how === 'here') {
        try {
          const pos = await here();
          await useWeatherPlace(pos.coords.latitude.toFixed(3), pos.coords.longitude.toFixed(3), 'This tablet’s location', v.unit);
          return;
        } catch (e) {
          return toast('Couldn’t get this tablet’s location. Search for your town instead.'), false;
        }
      }
      if (!v.place) {
        if (!setting('lat')) return toast('Type your town or city'), false;
        return setSettings({ tempUnit: v.unit });
      }
      let found = [];
      try { found = await searchPlace(v.place); } catch (e) { /* offline */ }
      if (!found.length) return toast('Couldn’t find that place'), false;
      if (found.length === 1) return useWeatherPlace(found[0].lat, found[0].lon, found[0].label, v.unit);
      setTimeout(() => formDialog({
        title: 'Which one?', saveLabel: 'Use this',
        fields: [{ name: 'i', label: 'Place', type: 'select', value: 0,
          options: found.map((p, i) => ({ value: i, label: p.label })) }],
        onSave: (x) => {
          const p = found[Number(x.i)];
          useWeatherPlace(p.lat, p.lon, p.label, v.unit);
        },
      }));
    },
  });
}

function calendarsForm() {
  const chosen = setting('calendarIds').split(',').filter(Boolean);
  formDialog({
    title: 'Calendars to show',
    fields: db.calendars.map((c, i) => ({ name: 'c' + i, label: c.name, type: 'checkbox',
      value: chosen.length ? chosen.includes(c.id) : c.primary })),
    onSave: async (v) => {
      const ids = db.calendars.filter((c, i) => v['c' + i]).map((c) => c.id);
      await setSettings({ calendarIds: ids.join(',') });
      sync().catch(() => {});
    },
  });
}

function settingsTab() {
  const link = conn.demo ? '' : location.origin + location.pathname + '#c=' +
    btoa(JSON.stringify({ url: conn.url, key: conn.key }));
  const row = (label, value, btn, fn) => h('div', { class: 'row' },
    h('span', { class: 'grow' }, h('strong', {}, label), h('br'), h('small', { class: 'muted' }, value)),
    h('button', { class: 'btn', onclick: fn }, btn));
  return h('div', { class: 'card' },
    row('Parent PIN', setting('pin') ? 'A PIN is set' : 'No PIN yet: anyone can open this area', 'Change', changePin),
    row('Weather', setting('place', 'Not set'), 'Change', weatherForm),
    row('Streak bonus', `${setting('streakBonus', 5)} bonus stars every ${setting('streakEvery', 7)} days in a row`, 'Change',
      () => formDialog({ title: 'Streak bonus',
        fields: [
          { name: 'streakEvery', label: 'Every how many days in a row', type: 'number', value: setting('streakEvery', 7), min: 1 },
          { name: 'streakBonus', label: 'Bonus stars (0 = off)', type: 'number', value: setting('streakBonus', 5), min: 0 }],
        onSave: (v) => { setSettings(v); } })),
    !conn.demo && row('Google calendars', 'Choose which calendars appear', 'Choose', calendarsForm),
    !conn.demo && row('Add another device', 'Open this link on a phone or tablet to connect it', 'Copy link',
      () => navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => prompt('Copy this link', link))),
    row('Connection', conn.demo ? 'Demo mode: data stays on this device only' : 'Connected to your Google Sheet', 'Disconnect',
      async () => {
        if (await confirmDialog('Disconnect this device?' + (conn.demo ? ' Demo data stays saved here.' : ''), 'Disconnect', 'Cancel')) {
          setConn(null);
          location.hash = '';
          location.reload();
        }
      }));
}
