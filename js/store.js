// Data layer. Two backends behind one interface:
//   demo   - everything in this device's localStorage
//   google - a Google Apps Script web app that reads/writes the family
//            Google Sheet and Google Calendar (see apps-script/Code.gs)
import { uid, ymd, today, addDays, parseYmd, load, save, toast } from './util.js';

const TABLES = ['people', 'tasks', 'completions', 'starlog', 'rewards',
  'redemptions', 'meals', 'lists', 'settings'];
const NUM = { tasks: ['stars'], completions: ['stars'], starlog: ['delta'],
  rewards: ['cost'], redemptions: ['cost'] };
const BOOL = { tasks: ['active'], rewards: ['active'], lists: ['done'] };

export const db = { events: [], calendars: [] };
TABLES.forEach((t) => (db[t] = []));

export let conn = load('fh-conn'); // {demo:true} | {url,key}
export let loaded = false;
export function setConn(c) {
  conn = c;
  loaded = false;
  if (c) save('fh-conn', c);
  else localStorage.removeItem('fh-conn');
}

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

let pending = 0;
let chain = Promise.resolve();
const enqueue = (fn) => {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
};

async function call(action, payload = {}) {
  const res = await fetch(conn.url, {
    method: 'POST',
    // text/plain avoids a CORS preflight, which Apps Script cannot answer.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: conn.key, action, ...payload }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Request failed');
  return j;
}

function truthy(v) {
  return v === true || v === 'true' || v === 'TRUE' || v === '1' || v === 1;
}

function normalize(data) {
  for (const t of TABLES) {
    db[t] = (data[t] || []).map((r) => {
      r = { ...r };
      (NUM[t] || []).forEach((f) => (r[f] = Number(r[f]) || 0));
      (BOOL[t] || []).forEach((f) => (r[f] = truthy(r[f])));
      return r;
    });
  }
  if (data.events) db.events = data.events;
  if (data.calendars) db.calendars = data.calendars;
}

function snapshot() {
  const out = { events: db.events, calendars: db.calendars };
  TABLES.forEach((t) => (out[t] = db[t]));
  return out;
}

// Events are loaded for a window around this month.
let anchor = today();
function range() {
  const d = parseYmd(anchor);
  return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
    ymd(new Date(d.getFullYear(), d.getMonth() + 3, 0))];
}
export function setEventAnchor(day) {
  const [s, e] = range();
  if (day >= s && day <= e) return;
  anchor = day;
  sync().catch(() => {});
}

export function loadCache() {
  const c = load(conn && conn.demo ? 'fh-data' : 'fh-cache');
  if (c) {
    normalize(c);
    loaded = true;
  }
}

export async function sync() {
  if (!conn) return;
  if (conn.demo) {
    normalize(load('fh-data') || {});
    loaded = true;
    emit();
    return;
  }
  const [start, end] = range();
  const j = await enqueue(() => call('sync', { start, end }));
  if (pending) return; // newer local edits are still on their way up
  const before = JSON.stringify(snapshot());
  normalize(j.data);
  loaded = true;
  save('fh-cache', snapshot());
  if (JSON.stringify(snapshot()) !== before) emit();
}

export async function testConnection(url, key) {
  const old = conn;
  conn = { url, key };
  try {
    await call('ping');
  } finally {
    conn = old;
  }
}

// ops: [{t:'put', table, row}, {t:'del', table, id}]
export async function apply(ops) {
  if (!ops.length) return;
  for (const o of ops) {
    const arr = db[o.table];
    const id = o.t === 'put' ? o.row.id : o.id;
    const i = arr.findIndex((r) => r.id === id);
    if (o.t === 'put') {
      if (i >= 0) arr[i] = { ...arr[i], ...o.row };
      else arr.push({ ...o.row });
    } else if (i >= 0) arr.splice(i, 1);
  }
  emit();
  if (conn.demo) return save('fh-data', snapshot());
  pending++;
  try {
    await enqueue(() => call('batch', { ops }));
    pending--;
  } catch (e) {
    pending--;
    toast('Could not save. Check the internet connection.');
    sync().catch(() => {});
  }
}

export const put = (table, row) => apply([{ t: 'put', table, row }]);
export const del = (table, id) => apply([{ t: 'del', table, id }]);

// ---------- settings ----------
export const setting = (k, dflt = '') => {
  const r = db.settings.find((s) => s.id === k);
  return r && r.value !== '' && r.value != null ? r.value : dflt;
};
export const setSettings = (obj) =>
  apply(Object.entries(obj).map(([id, value]) =>
    ({ t: 'put', table: 'settings', row: { id, value: String(value) } })));

// ---------- people ----------
export const person = (id) => db.people.find((p) => p.id === id);
export const kids = () => db.people.filter((p) => p.role === 'kid');

// ---------- tasks & habits ----------
export const isRepeating = (t) => t.repeat !== 'once';

export function completion(task, day) {
  return db.completions.find((c) => c.taskId === task.id &&
    (task.repeat === 'once' || c.date === day));
}

function scheduledOn(task, day) {
  const dow = parseYmd(day).getDay();
  if (task.repeat === 'daily') return true;
  if (task.repeat === 'weekdays') return dow >= 1 && dow <= 5;
  if (task.repeat === 'weekly') return String(task.days || '').split(',').includes(String(dow));
  return false;
}

export function isDue(task, day) {
  if (!task.active) return false;
  if (task.repeat === 'once') {
    const c = completion(task, day);
    if (c) return c.date === day; // stays visible, ticked, on the day it was done
    return !task.date || task.date <= day;
  }
  return scheduledOn(task, day);
}

export const tasksFor = (personId, day = today()) =>
  db.tasks.filter((t) => t.personId === personId && isDue(t, day));

export function streak(task) {
  if (!isRepeating(task)) return 0;
  let day = today();
  if (!completion(task, day)) day = addDays(day, -1);
  let n = 0;
  for (let i = 0; i < 400; i++, day = addDays(day, -1)) {
    if (!scheduledOn(task, day)) continue;
    if (!completion(task, day)) break;
    n++;
  }
  return n;
}

// Tick or untick a task. Returns {done, stars, bonus}.
export function toggleTask(task) {
  const day = today();
  const done = completion(task, day);
  if (done) {
    const ops = [{ t: 'del', table: 'completions', id: done.id }];
    db.starlog.filter((s) => s.ref === done.id || s.ref === 'streak:' + done.id)
      .forEach((s) => ops.push({ t: 'del', table: 'starlog', id: s.id }));
    apply(ops);
    return { done: false, stars: 0, bonus: 0 };
  }
  const who = person(task.personId);
  const isKid = who && who.role === 'kid';
  const ts = new Date().toISOString();
  const comp = { id: uid(), taskId: task.id, personId: task.personId, date: day,
    stars: task.stars, ts };
  const ops = [{ t: 'put', table: 'completions', row: comp }];
  if (isKid && task.stars > 0) {
    ops.push({ t: 'put', table: 'starlog', row: { id: uid(), personId: task.personId,
      delta: task.stars, reason: task.title, kind: 'earn', ref: comp.id, ts } });
  }
  // Streak bonus: counted as if today's completion is already in.
  let bonus = 0;
  db.completions.push(comp);
  const n = streak(task);
  db.completions.pop();
  const every = Number(setting('streakEvery', 7));
  const amount = Number(setting('streakBonus', 5));
  if (isKid && every > 0 && amount > 0 && n > 0 && n % every === 0) {
    bonus = amount;
    ops.push({ t: 'put', table: 'starlog', row: { id: uid(), personId: task.personId,
      delta: amount, reason: `${n} days in a row: ${task.title}`, kind: 'bonus',
      ref: 'streak:' + comp.id, ts } });
  }
  apply(ops);
  return { done: true, stars: isKid ? task.stars : 0, bonus };
}

// ---------- stars & rewards ----------
export const balance = (personId) =>
  db.starlog.filter((s) => s.personId === personId).reduce((a, s) => a + s.delta, 0);

export function adjustStars(personId, delta, reason) {
  return put('starlog', { id: uid(), personId, delta, reason,
    kind: 'adjust', ref: '', ts: new Date().toISOString() });
}

export const rewardsFor = (personId) =>
  db.rewards.filter((r) => r.active && (!r.personId || r.personId === personId))
    .sort((a, b) => a.cost - b.cost);

export function redeem(reward, personId) {
  const id = uid();
  const ts = new Date().toISOString();
  return apply([
    { t: 'put', table: 'redemptions', row: { id, rewardId: reward.id, personId,
      title: `${reward.icon} ${reward.title}`, cost: reward.cost, status: 'pending', ts } },
    { t: 'put', table: 'starlog', row: { id: uid(), personId, delta: -reward.cost,
      reason: 'Reward: ' + reward.title, kind: 'spend', ref: id, ts } },
  ]);
}

export function cancelRedemption(r) {
  const ops = [{ t: 'del', table: 'redemptions', id: r.id }];
  db.starlog.filter((s) => s.ref === r.id)
    .forEach((s) => ops.push({ t: 'del', table: 'starlog', id: s.id }));
  return apply(ops);
}

// ---------- calendar ----------
// Each person can have their own Google calendar (set in Parents > Family).
// Demo mode fakes one calendar per person plus a shared Family one.
export const calendarList = () => (conn.demo
  ? [{ id: 'family', name: 'Family', color: '#5b7cfa' },
    ...db.people.map((p) => ({ id: 'demo-' + p.id, name: p.name, color: p.color }))]
  : db.calendars.filter((c) => c.writable !== false));
export const personCalId = (p) => (conn.demo ? 'demo-' + p.id : p.calendarId || '');
export const eventOwner = (e) =>
  db.people.find((p) => personCalId(p) && personCalId(p) === e.calendarId);
export const eventColor = (e) => {
  const o = eventOwner(e);
  return o ? o.color : e.color || '#5b7cfa';
};
export const eventsFor = (p, day) =>
  eventsOn(day).filter((e) => personCalId(p) && e.calendarId === personCalId(p));
export const sharedEvents = (day) => eventsOn(day).filter((e) => !eventOwner(e));

export function eventsOn(day) {
  return db.events.filter((e) => {
    if (e.allDay) return e.start <= day && day <= (e.end || e.start);
    return ymd(new Date(e.start)) <= day && day <= ymd(new Date(e.end || e.start));
  }).sort((a, b) => (a.allDay ? 0 : 1) - (b.allDay ? 0 : 1) ||
    String(a.start).localeCompare(String(b.start)));
}

export async function saveEvent(ev) {
  const isNew = !ev.id;
  const local = { ...ev, id: ev.id || 'tmp-' + uid() };
  const i = db.events.findIndex((e) => e.id === local.id);
  if (i >= 0) db.events[i] = local;
  else db.events.push(local);
  emit();
  if (conn.demo) return save('fh-data', snapshot());
  pending++;
  try {
    const j = await enqueue(() => call('eventSave', { event: { ...ev, id: isNew ? '' : ev.id } }));
    const k = db.events.findIndex((e) => e.id === local.id);
    if (k >= 0) db.events[k] = j.event;
    pending--;
    emit();
  } catch (e) {
    pending--;
    toast('Could not save the event: ' + e.message);
    sync().catch(() => {});
  }
}

export async function deleteEvent(ev) {
  db.events = db.events.filter((e) => e.id !== ev.id);
  emit();
  if (conn.demo) return save('fh-data', snapshot());
  pending++;
  try {
    await enqueue(() => call('eventDelete', { event: { id: ev.id, calendarId: ev.calendarId } }));
    pending--;
  } catch (e) {
    pending--;
    toast('Could not delete the event: ' + e.message);
    sync().catch(() => {});
  }
}
