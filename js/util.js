// Small DOM + date helpers shared by every screen.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    } else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const today = () => ymd();
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtTime = (d) =>
  d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtDay = (s, opts = { weekday: 'long', month: 'long', day: 'numeric' }) =>
  parseYmd(s).toLocaleDateString([], opts);
// Sunday that starts the week containing s.
export const weekStart = (s) => addDays(s, -parseYmd(s).getDay());

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

// Burst of stars from an element (or screen centre).
export function celebrate(fromEl, emoji = '⭐') {
  const r = fromEl
    ? fromEl.getBoundingClientRect()
    : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const dist = 90 + Math.random() * 110;
    const s = h('div', { class: 'burst' }, i % 3 ? emoji : '✨');
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.setProperty('--dx', Math.cos(a) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(a) * dist + 'px');
    document.body.append(s);
    setTimeout(() => s.remove(), 900);
  }
  ding();
}

let audio;
function ding() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 1320].forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = f;
      o.type = 'triangle';
      const t = audio.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.26);
    });
  } catch (e) {
    /* sound is optional */
  }
}

export const load = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch (e) {
    return null;
  }
};
export const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    /* storage full or blocked */
  }
};
