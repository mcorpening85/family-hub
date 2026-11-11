// Calendar by day, week or month; add / edit events.
import { h, today, ymd, parseYmd, addDays, weekStart, fmtDay, fmtTime, hm, toast, load, save } from './util.js';
import { db, eventsOn, saveEvent, deleteEvent, setEventAnchor, setting, calendarList, eventColor, eventOwner } from './store.js';
import { state, go } from './nav.js';
import { formDialog } from './ui.js';

const VIEWS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const short = { month: 'short', day: 'numeric' };
const evTime = (e) => (e.allDay ? 'All day' : fmtTime(new Date(e.start)));

export function calendarView() {
  const sel = state.selDay || today();
  const saved = load('fh-calview');
  const view = state.calView || (VIEWS.some(([id]) => id === saved) ? saved : 'month');
  const month = state.month || sel.slice(0, 7) + '-01';
  const first = parseYmd(month);
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart(sel), i));
  setEventAnchor(view === 'month' ? month : sel);

  // Day and week follow the selected day; month keeps its own page.
  const setView = (v, extra = {}) => {
    save('fh-calview', v);
    go('calendar', { calView: v, month: null, ...extra });
  };
  const shift = (n) => {
    if (view === 'month') return go('calendar', { month: ymd(new Date(first.getFullYear(), first.getMonth() + n, 1)) });
    go('calendar', { selDay: addDays(sel, view === 'week' ? 7 * n : n), month: null });
  };
  const unit = view === 'month' ? 'month' : view;

  let title;
  if (view === 'month') title = first.toLocaleDateString([], { month: 'long', year: 'numeric' });
  else if (view === 'day') title = fmtDay(sel);
  else {
    const [a, b] = [weekDays[0], weekDays[6]];
    const sameMonth = a.slice(0, 7) === b.slice(0, 7);
    title = `${fmtDay(a, short)} – ${sameMonth ? parseYmd(b).getDate() : fmtDay(b, short)}, ${b.slice(0, 4)}`;
  }

  return h('div', { class: 'page calendar' + (view === 'week' ? ' fill' : '') },
    h('header', { class: 'page-top' },
      h('h1', {}, title),
      h('div', { class: 'pager' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Calendar view' }, VIEWS.map(([id, label]) =>
          h('button', { class: view === id ? 'on' : '', 'aria-pressed': String(view === id),
            onclick: () => setView(id) }, label))),
        h('button', { class: 'btn', onclick: () => shift(-1), 'aria-label': 'Previous ' + unit }, '‹'),
        h('button', { class: 'btn', onclick: () => go('calendar', { month: null, selDay: today() }) }, 'Today'),
        h('button', { class: 'btn', onclick: () => shift(1), 'aria-label': 'Next ' + unit }, '›'),
        h('button', { class: 'btn primary', onclick: () => editEvent(null, sel) }, '+ Event'))),
    view === 'day' ? dayBody(sel) : view === 'week' ? weekBody(weekDays, sel, setView) : monthBody(month, first, sel));
}

function monthBody(month, first, sel) {
  const gridStart = addDays(month, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return h('div', { class: 'cal-wrap' },
    h('div', { class: 'cal-grid' },
      DOW.map((d) => h('div', { class: 'cal-dow' }, d)),
      cells.map((d) => {
        const evs = eventsOn(d);
        return h('button', { class: 'cal-cell' + (d.slice(0, 7) !== month.slice(0, 7) ? ' other' : '') +
          (d === today() ? ' today' : '') + (d === sel ? ' sel' : ''),
          onclick: () => go('calendar', { selDay: d }) },
          h('span', { class: 'cal-num' }, parseYmd(d).getDate()),
          evs.slice(0, 3).map((e) => h('span', { class: 'chip', style: { '--c': eventColor(e) } }, e.title)),
          evs.length > 3 && h('span', { class: 'more' }, `+${evs.length - 3} more`));
      })),
    h('aside', { class: 'card day-panel' },
      h('h2', {}, fmtDay(sel)),
      eventsOn(sel).map((e) => h('button', { class: 'event-row', style: { '--c': eventColor(e) },
        onclick: () => editEvent(e, sel) },
        h('span', { class: 'event-time' }, evTime(e)),
        h('span', {}, e.title, e.recurring ? ' 🔁' : ''))),
      !eventsOn(sel).length && h('p', { class: 'muted' }, 'Nothing planned'),
      h('button', { class: 'btn', onclick: () => editEvent(null, sel) }, '+ Add event')));
}

// ---- week: an hour grid, a column per day, events placed by their times ----
const HOUR_PX = 50;   // height of one hour row
const OPEN_AT = 7;    // the window opens scrolled to this hour, or the week's earliest event
const t12 = (d) => (d.getHours() % 12 || 12) + (d.getMinutes() ? ':' + String(d.getMinutes()).padStart(2, '0') : '');
const ap = (d) => (d.getHours() < 12 ? 'am' : 'pm');
const timeRange = (a, b) => (ap(a) === ap(b) ? `${t12(a)} – ${t12(b)}${ap(b)}` : `${t12(a)}${ap(a)} – ${t12(b)}${ap(b)}`);
const hourLabel = (hr) => `${hr % 12 || 12} ${hr % 24 < 12 ? 'AM' : 'PM'}`;

// Timed events on day d as {e, s, t}: start and end in minutes from that day's midnight.
function daySegments(d) {
  const day0 = parseYmd(d).getTime();
  return eventsOn(d).filter((e) => !e.allDay).map((e) => {
    const s = (new Date(e.start).getTime() - day0) / 60000;
    const t = (new Date(e.end || e.start).getTime() - day0) / 60000;
    return { e, s: Math.max(0, s), t: Math.min(1440, t), spills: s < 0 };
  }).filter((x) => x.s < 1440 && !(x.spills && x.t <= 0))
    .map((x) => ({ ...x, t: Math.min(1440, Math.max(x.t, x.s + 30)) }));   // short events stay tappable
}

// Events that overlap get a lane i of n; a later lane sits on top of the earlier one, indented.
function lanes(list) {
  list.sort((x, y) => x.s - y.s || y.t - x.t);
  let group = [];
  let ends = [];
  let groupEnd = -1;
  const flush = () => {
    group.forEach((x) => (x.n = ends.length));
    group = [];
    ends = [];
    groupEnd = -1;
  };
  for (const x of list) {
    if (group.length && x.s >= groupEnd) flush();
    let i = ends.findIndex((end) => end <= x.s);
    if (i < 0) i = ends.length;
    ends[i] = x.t;
    x.i = i;
    group.push(x);
    groupEnd = Math.max(groupEnd, x.t);
  }
  flush();
  return list;
}

function weekBody(days, sel, setView) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const cols = days.map((d) => ({ d, allDay: eventsOn(d).filter((e) => e.allDay), timed: lanes(daySegments(d)) }));
  const all = cols.flatMap((c) => c.timed);
  const from = 0;
  const to = 24;
  const openAt = Math.min(OPEN_AT, ...all.map((x) => Math.floor(x.s / 60)));
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const at = (min) => `calc(var(--hh) * ${(min / 60 - from).toFixed(3)})`;
  const tall = (min) => `calc(var(--hh) * ${(min / 60).toFixed(3)} - 2px)`;

  return h('div', { class: 'tg-scroll', 'data-scroll': 'week', 'data-scroll-to': openAt * HOUR_PX },
    h('div', { class: 'tg', style: { '--hh': HOUR_PX + 'px' } },
    h('div', { class: 'tg-top' },
      h('div', { class: 'tg-row' },
        h('span', { class: 'tg-gutter' }),
        cols.map(({ d }) => h('button', { class: 'tg-dayhead' + (d === today() ? ' today' : ''),
          'aria-label': 'Open ' + fmtDay(d), onclick: () => setView('day', { selDay: d }) },
          h('span', { class: 'cal-dow' }, DOW[parseYmd(d).getDay()]),
          h('span', { class: 'cal-num' }, parseYmd(d).getDate())))),
      h('div', { class: 'tg-row tg-allday' },
        h('span', { class: 'tg-gutter' }, cols.some((c) => c.allDay.length) ? 'All day' : ''),
        cols.map(({ d, allDay }) => h('div', { class: 'tg-allcell' }, allDay.map((e) =>
          h('button', { class: 'tg-chip', style: { '--c': eventColor(e) }, onclick: () => editEvent(e, d) },
            e.title, e.recurring ? ' 🔁' : '')))))),
    h('div', { class: 'tg-row tg-body', style: { height: `calc(var(--hh) * ${hours.length})` } },
      h('div', { class: 'tg-gutter tg-times' }, hours.slice(1).map((hr) =>
        h('span', { style: { top: at(hr * 60) } }, hourLabel(hr)))),
      cols.map(({ d, timed }) => h('div', { class: 'tg-col' + (d === today() ? ' today' : ''),
        // Tapping an empty slot starts a new event at that hour.
        onclick: (ev) => {
          if (ev.target !== ev.currentTarget) return;
          const hr = from + Math.floor((ev.offsetY / ev.currentTarget.clientHeight) * hours.length);
          editEvent(null, d, Math.min(23, Math.max(0, hr)));
        } },
        timed.map(({ e, s, t, i, n }) => {
          const a = new Date(e.start);
          const z = new Date(e.end || e.start);
          const short = t - s < 50;
          return h('button', { class: 'tg-event' + (short ? ' short' : '') + (z < now ? ' past' : ''),
            style: { '--c': eventColor(e), top: at(s), height: tall(t - s),
              left: `calc(${(i / n) * 100}% + 2px)`, right: '4px', zIndex: i ? String(i) : '' },
            onclick: () => editEvent(e, d) },
            h('strong', {}, e.title, e.recurring ? ' 🔁' : ''),
            h('small', {}, short ? t12(a) + ap(a) : timeRange(a, z)));
        }),
        d === today() && nowMin >= from * 60 && nowMin <= to * 60 &&
          h('i', { class: 'tg-now', style: { top: at(nowMin) } }))))));
}

function dayBody(sel) {
  const evs = eventsOn(sel);
  return h('div', { class: 'card cal-day' },
    evs.map((e) => {
      const owner = eventOwner(e);
      return h('button', { class: 'event-row', style: { '--c': eventColor(e) }, onclick: () => editEvent(e, sel) },
        h('span', { class: 'event-time' }, evTime(e)),
        h('span', { class: 'grow' }, e.title, e.recurring ? ' 🔁' : ''),
        owner && h('small', { class: 'event-who' }, owner.name));
    }),
    !evs.length && h('p', { class: 'empty' }, sel === today() ? 'Nothing planned today' : 'Nothing planned'),
    h('button', { class: 'btn', onclick: () => editEvent(null, sel) }, '+ Add event'));
}

function editEvent(ev, day, hour = 9) {
  const two = (n) => String(n).padStart(2, '0');
  if (ev && ev.recurring) {
    return toast('Repeating events can only be changed in Google Calendar.');
  }
  const start = ev && !ev.allDay ? new Date(ev.start) : null;
  const end = ev && !ev.allDay ? new Date(ev.end) : null;
  const writable = calendarList();
  formDialog({
    title: ev ? 'Edit event' : 'New event',
    fields: [
      { name: 'title', label: 'What', value: ev ? ev.title : '', placeholder: 'Swimming lesson' },
      { name: 'allDay', label: 'All day', type: 'checkbox', value: ev ? ev.allDay : false },
      { name: 'date', label: 'Date', type: 'date', value: ev ? (ev.allDay ? ev.start : ymd(start)) : day },
      { name: 'endDate', label: 'Until', type: 'date', value: ev && ev.allDay ? ev.end : '', show: (v) => v.allDay },
      { name: 'from', label: 'Starts', type: 'time', value: start ? hm(start) : two(hour) + ':00', show: (v) => !v.allDay },
      { name: 'to', label: 'Ends', type: 'time', value: end ? hm(end) : (hour < 23 ? two(hour + 1) + ':00' : '23:59'), show: (v) => !v.allDay },
      !ev && writable.length > 1 && { name: 'calendarId', label: 'Whose calendar', type: 'select',
        value: writable.some((c) => c.id === setting('calendarIds').split(',')[0]) ? setting('calendarIds').split(',')[0] : writable[0].id,
        options: writable.map((c) => ({ value: c.id, label: c.name })) },
    ].filter(Boolean),
    onDelete: ev ? () => deleteEvent(ev) : null,
    onSave: (v) => {
      if (!v.title || !v.date) return false;
      const out = { id: ev ? ev.id : '', calendarId: ev ? ev.calendarId : v.calendarId || '',
        title: v.title, allDay: !!v.allDay, color: ev ? ev.color : (writable.find((c) => c.id === v.calendarId) || writable[0] || {}).color };
      if (v.allDay) {
        out.start = v.date;
        out.end = v.endDate && v.endDate > v.date ? v.endDate : v.date;
      } else {
        const s = new Date(`${v.date}T${v.from || '09:00'}`);
        let e = new Date(`${v.date}T${v.to || v.from || '10:00'}`);
        if (e <= s) e = new Date(s.getTime() + 60 * 60 * 1000);
        out.start = s.toISOString();
        out.end = e.toISOString();
      }
      saveEvent(out);
      go('calendar', { selDay: v.date, month: v.date.slice(0, 7) + '-01' });
    },
  });
}
