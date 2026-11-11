// Home, person (tasks / rewards / week), meals and lists screens.
import { h, today, addDays, fmtDay, fmtTime, parseYmd, weekStart, celebrate, toast, uid } from './util.js';
import { db, kids, person, tasksFor, completion, toggleTask, streak, balance, isRepeating,
  rewardsFor, redeem, eventsOn, eventsFor, sharedEvents, eventColor, setting, setSettings, put, del, apply, isDue } from './store.js';
import { state, go, render, unlocked, unlock } from './nav.js';
import { confirmDialog, formDialog, avatar, party, pinPad } from './ui.js';
import { getWeather } from './weather.js';
import { quickTaskForm } from './views-parent.js';

const eventTime = (e) => (e.allDay ? 'All day' : fmtTime(new Date(e.start)));

function eventRow(e) {
  return h('div', { class: 'event-row', style: { '--c': eventColor(e) } },
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

  const shared = sharedEvents(day);
  const dinner = db.meals.find((m) => m.id === day);

  const groups = [['morning', '☀️ Morning'], ['day', '🌤️ Any time'], ['evening', '🌙 Evening']];
  return h('div', { class: 'home fill' },
    h('header', { class: 'home-top' },
      h('div', { class: 'clock', id: 'clock' }, fmtTime(now)),
      h('div', { class: 'date' }, fmtDay(day)),
      weather),
    h('div', { class: 'strip' },
      shared.map((e) => h('button', { class: 'strip-chip', style: { '--c': eventColor(e) }, onclick: () => go('calendar') },
        h('small', {}, eventTime(e)), ' ', e.title)),
      h('button', { class: 'strip-chip dinner-chip', onclick: () => go('meals') },
        h('small', {}, '🍽️ Dinner'), ' ', dinner && dinner.meal ? dinner.meal : 'Not planned')),
    h('div', { class: 'board', 'data-scroll': 'board' },
      db.people.map((p) => {
        const evs = eventsFor(p, day);
        const tasks = tasksFor(p.id, day);
        const done = tasks.filter((t) => completion(t, day)).length;
        return h('section', { class: 'col', style: { '--c': p.color } },
          h('button', { class: 'col-head', onclick: () => go('person', { personId: p.id, tab: 'today' }) },
            avatar(p, 'small'),
            h('div', { class: 'grow' },
              h('div', { class: 'col-name' }, p.name),
              h('div', { class: 'pills' },
                h('span', { class: 'pill' }, `✓ ${done}/${tasks.length}`),
                p.role === 'kid' && h('span', { class: 'pill star' }, '⭐ ' + balance(p.id))))),
          h('div', { class: 'progress' }, h('div', { style: { width: (tasks.length ? (done / tasks.length) * 100 : 0) + '%' } })),
          h('div', { class: 'col-body', 'data-scroll': 'col-' + p.id },
            evs.length ? h('div', { class: 'col-events', onclick: () => go('calendar') }, evs.map((e) =>
              h('div', { class: 'col-event' }, h('small', {}, eventTime(e)), h('span', {}, e.title)))) : null,
            tasks.length ? groups.map(([when, label]) => {
              const list = tasks.filter((t) => (t.when || 'day') === when);
              return list.length ? [h('h3', {}, label), list.map((t) => taskRow(t, p))] : null;
            }) : h('p', { class: 'muted col-empty' }, evs.length ? 'No tasks today' : 'Nothing to do today 🌈')),
          // Phones only (hidden on the wall tablet by CSS), and only for a parent: it asks for the PIN.
          h('button', { class: 'col-add', onclick: () => addTaskAsParent(p) }, '+ Add task'));
      })));
}

async function addTaskAsParent(p) {
  const pin = setting('pin');
  if (pin && !unlocked()) {
    const entered = await pinPad('Parent PIN to add a task');
    if (entered == null) return;
    if (entered !== pin) return toast('Wrong PIN');
    unlock();
  }
  quickTaskForm(p);
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
      avatar(p, 'big'),
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
      h('div', { class: 'task-list' }, list.map((t) => taskRow(t, p)))] : null;
  }));
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
            party(p, `${r.icon} ${r.title}`, ['You earned it, ' + p.name + '! 🎉']);
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
      h('td', { class: 'habit-name' }, p.role === 'kid' && [h('span', {}, t.icon), ' '], t.title),
      days.map((d) => {
        const due = isDue(t, d);
        const done = completion(t, d);
        return h('td', { class: d === today() ? 'now' : '' },
          !due ? h('span', { class: 'dot off' }) : done ? h('span', { class: 'dot yes' }, '✓')
            : h('span', { class: 'dot' + (d < today() ? ' missed' : '') }));
      }),
      h('td', { class: 'streak' }, streak(t) || ''))))));
}

function taskRow(t, p) {
  const done = !!completion(t, today());
  const n = streak(t);
  return h('button', { class: 'task-row' + (done ? ' done' : ''), 'data-task': t.id,
    onclick: () => {
      const before = balance(p.id);
      const r = toggleTask(t);
      if (!r.done) return;
      celebrate(document.querySelector(`[data-task="${t.id}"] .check`));
      // Milestones: a streak bonus, finishing everything, or enough stars for a reward.
      const lines = [];
      let title = '';
      const all = tasksFor(p.id);
      if (all.length > 1 && all.every((x) => completion(x, today()))) title = 'All done for today!';
      if (r.bonus) {
        if (!title) title = `${r.streak} days in a row!`;
        else lines.push(`🔥 ${r.streak} days in a row: ${t.title}`);
        lines.push(`+${r.bonus} bonus stars ⭐`);
      }
      const after = balance(p.id);
      rewardsFor(p.id).filter((w) => before < w.cost && after >= w.cost).forEach((w) => {
        if (!title) title = 'You have enough stars!';
        lines.push(`You can get ${w.icon} ${w.title}`);
      });
      if (title) party(p, title, lines.length ? lines : ['Great job, ' + p.name + '! 🌟']);
    } },
    p.role === 'kid' && h('span', { class: 'task-icon' }, t.icon || '⭐'),
    h('span', { class: 'grow' },
      h('span', { class: 'task-title' }, t.title),
      h('span', { class: 'task-meta' },
        p.role === 'kid' && t.stars > 0 && h('span', {}, '⭐ ' + t.stars),
        isRepeating(t) && n >= 2 && h('span', { class: 'streak' }, '🔥 ' + n))),
    h('span', { class: 'check' }, done ? '✓' : ''));
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
