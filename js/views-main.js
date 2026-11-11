// Home, person (tasks / rewards / week), meals and lists screens.
import { h, today, addDays, fmtDay, fmtTime, parseYmd, weekStart, celebrate, toast, uid } from './util.js';
import { db, kids, person, tasksFor, completion, toggleTask, streak, balance, isRepeating,
  rewardsFor, redeem, eventsOn, setting, setSettings, put, del, apply, isDue } from './store.js';
import { state, go, render } from './nav.js';
import { confirmDialog, formDialog } from './ui.js';
import { getWeather } from './weather.js';

const eventTime = (e) => (e.allDay ? 'All day' : fmtTime(new Date(e.start)));

function eventRow(e) {
  return h('div', { class: 'event-row', style: { '--c': e.color || '#5b7cfa' } },
    h('span', { class: 'event-time' }, eventTime(e)), h('span', {}, e.title));
}

// ---------------- Home ----------------
export function homeView() {
  const day = today();
  const now = new Date();
  const weather = h('div', { class: 'weather' });
  getWeather().then((w) => {
    if (w) weather.append(h('span', { class: 'weather-icon' }, w.icon),
      h('div', {}, h('strong', {}, w.temp + '°'), h('small', {}, `${w.hi}° / ${w.lo}°`)));
  });

  const todays = eventsOn(day);
  const tomorrow = eventsOn(addDays(day, 1));
  const dinner = db.meals.find((m) => m.id === day);

  return h('div', { class: 'home' },
    h('header', { class: 'home-top' },
      h('div', {},
        h('div', { class: 'clock', id: 'clock' }, fmtTime(now)),
        h('div', { class: 'date' }, fmtDay(day))),
      weather),
    h('div', { class: 'home-grid' },
      h('section', { class: 'card agenda', onclick: () => go('calendar') },
        h('h2', {}, '📅 Today'),
        todays.length ? todays.map(eventRow) : h('p', { class: 'muted' }, 'Nothing on the calendar today'),
        tomorrow.length ? [h('h3', {}, 'Tomorrow'), tomorrow.slice(0, 4).map(eventRow)] : null,
        h('div', { class: 'dinner', onclick: (e) => { e.stopPropagation(); go('meals'); } },
          h('span', {}, '🍽️ Dinner'), h('strong', {}, dinner && dinner.meal ? dinner.meal : 'Not planned yet'))),
      h('section', { class: 'people' }, db.people.map(personCard))));
}

function personCard(p) {
  const tasks = tasksFor(p.id);
  const done = tasks.filter((t) => completion(t, today())).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return h('button', { class: 'person-card', style: { '--c': p.color },
    onclick: () => go('person', { personId: p.id, tab: 'today' }) },
    h('div', { class: 'avatar' }, p.avatar),
    h('div', { class: 'person-name' }, p.name),
    p.role === 'kid' && h('div', { class: 'star-count' }, '⭐ ' + balance(p.id)),
    h('div', { class: 'progress' }, h('div', { style: { width: pct + '%' } })),
    h('div', { class: 'progress-label' },
      !tasks.length ? 'Nothing to do today' : done === tasks.length ? 'All done! 🎉' : `${done} of ${tasks.length} done`));
}

// ---------------- Person ----------------
export function personView() {
  const p = person(state.personId);
  if (!p) return homeView();
  const isKid = p.role === 'kid';
  const tabs = [['today', '✅ Today'], isKid && ['rewards', '🎁 Rewards'], ['week', '📊 My week']].filter(Boolean);
  const tab = state.tab || 'today';
  return h('div', { class: 'person-page', style: { '--c': p.color } },
    h('header', { class: 'person-top' },
      h('button', { class: 'back', onclick: () => go('home'), 'aria-label': 'Back' }, '←'),
      h('div', { class: 'avatar big' }, p.avatar),
      h('h1', {}, p.name),
      isKid && h('div', { class: 'star-big', id: 'star-total' }, '⭐ ' + balance(p.id))),
    h('div', { class: 'tabs' }, tabs.map(([id, label]) =>
      h('button', { class: tab === id ? 'on' : '', onclick: () => go('person', { tab: id }) }, label))),
    tab === 'today' ? todayTab(p) : tab === 'rewards' ? rewardsTab(p) : weekTab(p));
}

function todayTab(p) {
  const tasks = tasksFor(p.id);
  if (!tasks.length) return h('p', { class: 'empty' }, '🌈 Nothing to do today!');
  const groups = [['morning', '☀️ Morning'], ['day', '🌤️ Any time'], ['evening', '🌙 Evening']];
  return h('div', {}, groups.map(([when, label]) => {
    const list = tasks.filter((t) => (t.when || 'day') === when);
    return list.length ? [h('h2', { class: 'group' }, label),
      h('div', { class: 'tiles' }, list.map((t) => taskTile(t, p)))] : null;
  }));
}

function taskTile(t, p) {
  const done = !!completion(t, today());
  const n = streak(t);
  return h('button', { class: 'tile' + (done ? ' done' : ''),
    onclick: (e) => {
      const tile = e.currentTarget;
      const r = toggleTask(t);
      if (r.done) {
        celebrate(document.querySelector(`[data-task="${t.id}"]`) || tile);
        if (r.bonus) toast(`🔥 Streak bonus! +${r.bonus} stars`);
      }
    }, 'data-task': t.id },
    h('div', { class: 'tile-icon' }, t.icon || '⭐'),
    h('div', { class: 'tile-title' }, t.title),
    h('div', { class: 'tile-meta' },
      p.role === 'kid' && t.stars > 0 && h('span', {}, '⭐'.repeat(Math.min(t.stars, 5)) + (t.stars > 5 ? ' ' + t.stars : '')),
      isRepeating(t) && n >= 2 && h('span', { class: 'streak' }, '🔥 ' + n)),
    done && h('div', { class: 'tick' }, '✓'));
}

function rewardsTab(p) {
  const bal = balance(p.id);
  const list = rewardsFor(p.id);
  const waiting = db.redemptions.filter((r) => r.personId === p.id && r.status === 'pending');
  return h('div', {},
    waiting.length ? h('div', { class: 'card waiting' }, h('h3', {}, '🎉 Coming soon'),
      waiting.map((r) => h('div', {}, r.title))) : null,
    list.length ? h('div', { class: 'tiles' }, list.map((r) => {
      const can = bal >= r.cost;
      return h('button', { class: 'tile reward' + (can ? ' can' : ''),
        onclick: async (e) => {
          const tile = e.currentTarget;
          if (!can) return toast(`${r.cost - bal} more stars to go!`);
          if (await confirmDialog(`Spend ${r.cost} ⭐ on ${r.icon} ${r.title}?`, 'Yes!', 'Not yet')) {
            redeem(r, p.id);
            celebrate(null, '🎉');
          }
        } },
        h('div', { class: 'tile-icon' }, r.icon || '🎁'),
        h('div', { class: 'tile-title' }, r.title),
        h('div', { class: 'progress' }, h('div', { style: { width: Math.min(100, (bal / r.cost) * 100) + '%' } })),
        h('div', { class: 'tile-meta' }, h('span', {}, can ? `⭐ ${r.cost}` : `⭐ ${bal} / ${r.cost}`)));
    })) : h('p', { class: 'empty' }, 'No rewards yet. Ask mum or dad to add some!'));
}

function weekTab(p) {
  const start = weekStart(today());
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
  const habits = db.tasks.filter((t) => t.personId === p.id && t.active && isRepeating(t));
  if (!habits.length) return h('p', { class: 'empty' }, 'No habits yet.');
  return h('div', { class: 'card week' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th'), days.map((d) =>
      h('th', { class: d === today() ? 'now' : '' }, fmtDay(d, { weekday: 'short' }))), h('th', {}, '🔥'))),
    h('tbody', {}, habits.map((t) => h('tr', {},
      h('td', { class: 'habit-name' }, h('span', {}, t.icon), ' ', t.title),
      days.map((d) => {
        const due = isDue(t, d);
        const done = completion(t, d);
        return h('td', { class: d === today() ? 'now' : '' },
          !due ? h('span', { class: 'dot off' }) : done ? h('span', { class: 'dot yes' }, '✓')
            : h('span', { class: 'dot' + (d < today() ? ' missed' : '') }));
      }),
      h('td', { class: 'streak' }, streak(t) || ''))))));
}

// ---------------- Meals ----------------
export function mealsView() {
  const start = state.mealWeek || weekStart(today());
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
  return h('div', { class: 'page' },
    h('header', { class: 'page-top' }, h('h1', {}, '🍽️ Dinner plan'),
      h('div', { class: 'pager' },
        h('button', { class: 'btn', onclick: () => go('meals', { mealWeek: addDays(start, -7) }) }, '‹'),
        h('button', { class: 'btn', onclick: () => go('meals', { mealWeek: weekStart(today()) }) }, 'This week'),
        h('button', { class: 'btn', onclick: () => go('meals', { mealWeek: addDays(start, 7) }) }, '›'))),
    h('div', { class: 'meals' }, days.map((d) => {
      const m = db.meals.find((x) => x.id === d);
      return h('label', { class: 'card meal' + (d === today() ? ' now' : '') },
        h('span', {}, fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' })),
        h('input', { type: 'text', value: m ? m.meal : '', placeholder: 'What’s for dinner?',
          onchange: (e) => put('meals', { id: d, meal: e.target.value.trim() }) }));
    })));
}

// ---------------- Lists ----------------
export function listsView() {
  const names = setting('lists', 'Shopping,To-do').split(',').filter(Boolean);
  const current = names.includes(state.list) ? state.list : names[0];
  const items = db.lists.filter((i) => i.list === current)
    .sort((a, b) => a.done - b.done || String(a.ts).localeCompare(String(b.ts)));
  const input = h('input', { type: 'text', placeholder: 'Add to ' + current + '…' });
  const add = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    put('lists', { id: uid(), list: current, text, done: false, ts: new Date().toISOString() });
  };
  return h('div', { class: 'page' },
    h('header', { class: 'page-top' }, h('h1', {}, '📝 Lists'),
      h('button', { class: 'btn', onclick: () => formDialog({ title: 'New list',
        fields: [{ name: 'name', label: 'List name', placeholder: 'Packing' }],
        onSave: (v) => {
          const name = v.name.replace(/,/g, ' ');
          if (!name || names.includes(name)) return false;
          setSettings({ lists: [...names, name].join(',') });
          go('lists', { list: name });
        } }) }, '+ New list')),
    h('div', { class: 'tabs' }, names.map((n) =>
      h('button', { class: n === current ? 'on' : '', onclick: () => go('lists', { list: n }) }, n))),
    h('form', { class: 'add-row', onsubmit: add }, input, h('button', { class: 'btn primary' }, 'Add')),
    h('div', { class: 'card list' },
      items.length ? items.map((i) => h('label', { class: 'list-item' + (i.done ? ' done' : '') },
        h('input', { type: 'checkbox', checked: i.done,
          onchange: () => put('lists', { ...i, done: !i.done }) }),
        h('span', {}, i.text))) : h('p', { class: 'muted' }, 'Nothing here yet')),
    items.some((i) => i.done) && h('button', { class: 'btn', onclick: () =>
      apply(items.filter((i) => i.done).map((i) => ({ t: 'del', table: 'lists', id: i.id }))) }, 'Clear ticked items'));
}
