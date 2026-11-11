/**
 * Family Hub backend. Lives inside your family Google Sheet
 * (Extensions > Apps Script) and gives the tablet app access to the
 * sheet and to Google Calendar. See README.md for setup steps.
 */

var TABLES = {
  people: ['id', 'name', 'role', 'color', 'avatar', 'calendarId', 'photo'],
  tasks: ['id', 'title', 'icon', 'personId', 'stars', 'repeat', 'days', 'date', 'when', 'active'],
  completions: ['id', 'taskId', 'personId', 'date', 'stars', 'ts'],
  starlog: ['id', 'personId', 'delta', 'reason', 'kind', 'ref', 'ts'],
  rewards: ['id', 'title', 'icon', 'cost', 'personId', 'active'],
  redemptions: ['id', 'rewardId', 'personId', 'title', 'cost', 'status', 'ts'],
  meals: ['id', 'meal'],
  lists: ['id', 'list', 'text', 'done', 'ts'],
  settings: ['id', 'value']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Family Hub')
    .addItem('Set up sheet', 'setup')
    .addItem('Show family key', 'showKey')
    .addToUi();
}

/** Run once: creates the tabs and the secret family key. Safe to re-run. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('Open this script from inside the Family Hub sheet: Extensions > Apps Script.');
  Object.keys(TABLES).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var cols = TABLES[name];
    // Plain text everywhere so Sheets never reinterprets dates or IDs.
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
  });
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FAMILY_KEY')) {
    props.setProperty('FAMILY_KEY', Utilities.getUuid().replace(/-/g, ''));
  }
  // Touch the calendar so Google asks for calendar permission now.
  CalendarApp.getDefaultCalendar().getName();
  showKey();
}

function showKey() {
  var key = PropertiesService.getScriptProperties().getProperty('FAMILY_KEY');
  var msg = key ? 'Your family key is: ' + key : 'Run "setup" first.';
  console.log(msg);   // shows in the Execution log under the code editor
  try {
    SpreadsheetApp.getActive().toast(msg, 'Family Hub', 60);
  } catch (e) { /* no sheet window open: the log above is enough */ }
  return key;
}

function doGet() {
  return json({ ok: true, app: 'Family Hub' });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty('FAMILY_KEY');
    if (!key || req.key !== key) throw new Error('Wrong family key');
    out = handle(req);
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return json(out);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function handle(req) {
  switch (req.action) {
    case 'ping':
      return {};
    case 'sync':
      var data = {};
      Object.keys(TABLES).forEach(function (t) { data[t] = readTable(t); });
      data.calendars = listCalendars();
      data.events = listEvents(req.start, req.end, calendarIds(data.settings));
      return { data: data };
    case 'batch':
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try { batch(req.ops || []); } finally { lock.releaseLock(); }
      return {};
    case 'eventSave':
      return { event: saveEvent(req.event) };
    case 'eventDelete':
      var ev = findEvent(req.event);
      if (ev) ev.deleteEvent();
      return {};
  }
  throw new Error('Unknown action: ' + req.action);
}

// ---------------- Sheet ----------------
function sheet(name) {
  if (!TABLES[name]) throw new Error('Unknown table: ' + name);
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run Family Hub > Set up sheet.');
  return sh;
}

function readTable(name) {
  var values = sheet(name).getDataRange().getDisplayValues();
  var head = values.shift() || [];
  return values.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { if (h) o[h] = r[i]; });
    return o;
  });
}

function batch(ops) {
  var cache = {};
  function table(name) {
    if (!cache[name]) {
      var sh = sheet(name);
      var values = sh.getDataRange().getDisplayValues();
      cache[name] = { sh: sh, head: values[0].slice(),
        ids: values.slice(1).map(function (r) { return r[0]; }) };
    }
    return cache[name];
  }
  ops.forEach(function (op) {
    var t = table(op.table);
    if (op.t === 'del') {
      var at = t.ids.indexOf(String(op.id));
      if (at >= 0) { t.sh.deleteRow(at + 2); t.ids.splice(at, 1); }
      return;
    }
    var row = op.row;
    Object.keys(row).forEach(function (k) {       // new field: add a column
      if (t.head.indexOf(k) < 0) {
        t.head.push(k);
        t.sh.getRange(1, t.head.length).setNumberFormat('@').setValue(k);
      }
    });
    var i = t.ids.indexOf(String(row.id));
    var n = i >= 0 ? i + 2 : t.ids.length + 2;
    var range = t.sh.getRange(n, 1, 1, t.head.length);
    var current = i >= 0 ? range.getDisplayValues()[0] : [];
    var values = t.head.map(function (h, c) {
      if (row[h] === undefined) return current[c] || '';
      return row[h] === null ? '' : String(row[h]);
    });
    range.setNumberFormat('@').setValues([values]);
    if (i < 0) t.ids.push(String(row.id));
  });
}

// ---------------- Calendar ----------------
function calendarIds(settings) {
  var row = (settings || readTable('settings')).filter(function (s) { return s.id === 'calendarIds'; })[0];
  var ids = row && row.value ? row.value.split(',').filter(String) : [];
  return ids.length ? ids : [CalendarApp.getDefaultCalendar().getId()];
}

function listCalendars() {
  var primary = CalendarApp.getDefaultCalendar().getId();
  return CalendarApp.getAllCalendars().map(function (c) {
    return { id: c.getId(), name: c.getName(), color: c.getColor(),
      primary: c.getId() === primary, writable: c.isOwnedByMe() || c.getId() === primary };
  });
}

function tz() { return Session.getScriptTimeZone(); }
function day(d) { return Utilities.formatDate(d, tz(), 'yyyy-MM-dd'); }
function fromDay(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

function toJson(ev, cal) {
  var o = { id: ev.getId(), calendarId: cal.getId(), title: ev.getTitle(), color: cal.getColor(),
    allDay: ev.isAllDayEvent(), recurring: ev.isRecurringEvent() };
  if (o.allDay) {
    o.start = day(ev.getAllDayStartDate());
    o.end = day(new Date(ev.getAllDayEndDate().getTime() - 12 * 3600 * 1000)); // end is exclusive
  } else {
    o.start = ev.getStartTime().toISOString();
    o.end = ev.getEndTime().toISOString();
  }
  return o;
}

function listEvents(start, end, ids) {
  var from = fromDay(start);
  var to = new Date(fromDay(end).getTime() + 24 * 3600 * 1000);
  var out = [];
  ids.forEach(function (id) {
    var cal = CalendarApp.getCalendarById(id);
    if (!cal) return;
    cal.getEvents(from, to).forEach(function (ev) { out.push(toJson(ev, cal)); });
  });
  return out;
}

function findEvent(e) {
  var cal = CalendarApp.getCalendarById(e.calendarId || calendarIds()[0]);
  return cal ? cal.getEventById(e.id) : null;
}

function saveEvent(e) {
  var cal = CalendarApp.getCalendarById(e.calendarId || calendarIds()[0]);
  if (!cal) throw new Error('Calendar not found');
  var ev = e.id ? cal.getEventById(e.id) : null;
  if (e.id && !ev) throw new Error('Event not found');
  if (e.allDay) {
    var s = fromDay(e.start);
    var endExclusive = new Date(fromDay(e.end || e.start).getTime() + 36 * 3600 * 1000);
    endExclusive = fromDay(day(endExclusive));
    if (ev) ev.setAllDayDates(s, endExclusive); else ev = cal.createAllDayEvent(e.title, s, endExclusive);
  } else {
    var a = new Date(e.start), b = new Date(e.end);
    if (ev) ev.setTime(a, b); else ev = cal.createEvent(e.title, a, b);
  }
  ev.setTitle(e.title);
  return toJson(ev, cal);
}
