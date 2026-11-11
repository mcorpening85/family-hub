// Month calendar with a day panel; add / edit events.
import { h, today, ymd, parseYmd, addDays, fmtDay, fmtTime, hm, toast } from './util.js';
import { db, eventsOn, saveEvent, deleteEvent, setEventAnchor, setting } from './store.js';
import { state, go } from './nav.js';
import { formDialog } from './ui.js';

export function calendarView() {
  const sel = state.selDay || today();
  const month = state.month || sel.slice(0, 7) + '-01';
  const first = parseYmd(month);
  setEventAnchor(month);
  const gridStart = addDays(month, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const shift = (n) => {
    const d = new Date(first.getFullYear(), first.getMonth() + n, 1);
    go('calendar', { month: ymd(d) });
  };

  return h('div', { class: 'page calendar' },
    h('header', { class: 'page-top' },
      h('h1', {}, first.toLocaleDateString([], { month: 'long', year: 'numeric' })),
      h('div', { class: 'pager' },
        h('button', { class: 'btn', onclick: () => shift(-1), 'aria-label': 'Previous month' }, '‹'),
        h('button', { class: 'btn', onclick: () => go('calendar', { month: null, selDay: today() }) }, 'Today'),
        h('button', { class: 'btn', onclick: () => shift(1), 'aria-label': 'Next month' }, '›'),
        h('button', { class: 'btn primary', onclick: () => editEvent(null, sel) }, '+ Event'))),
    h('div', { class: 'cal-wrap' },
      h('div', { class: 'cal-grid' },
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => h('div', { class: 'cal-dow' }, d)),
        cells.map((d) => {
          const evs = eventsOn(d);
          return h('button', { class: 'cal-cell' + (d.slice(0, 7) !== month.slice(0, 7) ? ' other' : '') +
            (d === today() ? ' today' : '') + (d === sel ? ' sel' : ''),
            onclick: () => go('calendar', { selDay: d }) },
            h('span', { class: 'cal-num' }, parseYmd(d).getDate()),
            evs.slice(0, 3).map((e) => h('span', { class: 'chip', style: { '--c': e.color || '#5b7cfa' } }, e.title)),
            evs.length > 3 && h('span', { class: 'more' }, `+${evs.length - 3} more`));
        })),
      h('aside', { class: 'card day-panel' },
        h('h2', {}, fmtDay(sel)),
        eventsOn(sel).map((e) => h('button', { class: 'event-row', style: { '--c': e.color || '#5b7cfa' },
          onclick: () => editEvent(e, sel) },
          h('span', { class: 'event-time' }, e.allDay ? 'All day' : fmtTime(new Date(e.start))),
          h('span', {}, e.title, e.recurring ? ' 🔁' : ''))),
        !eventsOn(sel).length && h('p', { class: 'muted' }, 'Nothing planned'),
        h('button', { class: 'btn', onclick: () => editEvent(null, sel) }, '+ Add event'))));
}

function editEvent(ev, day) {
  if (ev && ev.recurring) {
    return toast('Repeating events can only be changed in Google Calendar.');
  }
  const start = ev && !ev.allDay ? new Date(ev.start) : null;
  const end = ev && !ev.allDay ? new Date(ev.end) : null;
  const writable = db.calendars.filter((c) => c.writable !== false);
  formDialog({
    title: ev ? 'Edit event' : 'New event',
    fields: [
      { name: 'title', label: 'What', value: ev ? ev.title : '', placeholder: 'Swimming lesson' },
      { name: 'allDay', label: 'All day', type: 'checkbox', value: ev ? ev.allDay : false },
      { name: 'date', label: 'Date', type: 'date', value: ev ? (ev.allDay ? ev.start : ymd(start)) : day },
      { name: 'endDate', label: 'Until', type: 'date', value: ev && ev.allDay ? ev.end : '', show: (v) => v.allDay },
      { name: 'from', label: 'Starts', type: 'time', value: start ? hm(start) : '09:00', show: (v) => !v.allDay },
      { name: 'to', label: 'Ends', type: 'time', value: end ? hm(end) : '10:00', show: (v) => !v.allDay },
      !ev && writable.length > 1 && { name: 'calendarId', label: 'Calendar', type: 'select',
        value: setting('calendarIds').split(',')[0] || writable[0].id,
        options: writable.map((c) => ({ value: c.id, label: c.name })) },
    ].filter(Boolean),
    onDelete: ev ? () => deleteEvent(ev) : null,
    onSave: (v) => {
      if (!v.title || !v.date) return false;
      const out = { id: ev ? ev.id : '', calendarId: ev ? ev.calendarId : v.calendarId || '',
        title: v.title, allDay: !!v.allDay, color: ev ? ev.color : calColor(v.calendarId) };
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

function calColor(id) {
  const c = db.calendars.find((x) => x.id === id) || db.calendars[0];
  return c ? c.color : '#5b7cfa';
}
