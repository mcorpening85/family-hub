// Dialogs: modal, generic form, confirm, PIN pad.
import { h } from './util.js';

export const COLORS = ['#ff5d8f', '#ff9f1c', '#ffd23f', '#3ccf91', '#2ec4f1',
  '#5b7cfa', '#a66bff', '#ff6b5e'];

export const EMOJI = ('🪥 🛏️ 👗 👟 🎒 🧸 📚 ✏️ 🎹 🎨 🧹 🧺 🍽️ 🥣 🥦 🍎 💧 🚿 🛁 🧼 ' +
  '🐶 🐱 🐟 🌱 🗑️ ♻️ 🚲 ⚽ 🏃 🧘 😴 🙏 💊 🦷 🧦 🧥 📖 🎻 🧮 🧩 ' +
  '🎬 🍦 🍕 🍿 🎮 📺 🌙 🎁 🎟️ 🛝 🏊 🎢 🧁 🍪 🛍️ 💵 🎉 ⭐ ❤️ 🌈 ' +
  '👧 👩 👨 👦 👶 🧒 🦄 🐼 🦊 🐰 🐯 🦋 🐸 🐵 🦁 🐙').split(' ');

// A person's picture: their uploaded photo, or their emoji.
export function avatar(p, size = '') {
  return h('span', { class: 'avatar ' + size, style: { '--c': p.color } },
    p.photo ? h('img', { src: p.photo, alt: '' }) : p.avatar);
}

// Shrink an uploaded photo to a small square so it fits in one sheet cell.
export function photoToDataUrl(file, px = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = px;
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
    img.src = url;
  });
}

// Full-screen party for milestones. lines: extra messages under the title.
export function party(p, title, lines = []) {
  document.querySelectorAll('.party').forEach((el) => el.remove());
  const colors = ['#ff5d8f', '#ff9f1c', '#ffd23f', '#3ccf91', '#2ec4f1', '#5b7cfa', '#a66bff'];
  const bits = Array.from({ length: 90 }, (_, i) => h('i', { class: 'confetti', style: {
    left: Math.random() * 100 + '%', background: colors[i % colors.length],
    animationDelay: Math.random() * 1.2 + 's', animationDuration: 2.2 + Math.random() * 2 + 's',
    '--spin': (Math.random() * 720 - 360) + 'deg', '--drift': (Math.random() * 160 - 80) + 'px',
    width: 8 + Math.random() * 8 + 'px', height: 10 + Math.random() * 12 + 'px' } }));
  const el = h('div', { class: 'party', style: { '--c': p.color }, onclick: () => el.remove() },
    bits,
    h('div', { class: 'party-card' },
      avatar(p, 'huge'),
      h('div', { class: 'party-title' }, title),
      lines.map((l) => h('div', { class: 'party-line' }, l)),
      h('div', { class: 'party-hint' }, 'Tap to keep going')));
  document.body.append(el);
  setTimeout(() => el.remove(), 7000);
  fanfare();
}

let actx;
function fanfare() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t = actx.currentTime + i * 0.13;
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + 0.32);
    });
  } catch (e) { /* sound is optional */ }
}

// A pop-up drawn as a plain layer over the page. Not the browser's <dialog>: on Amazon
// Silk, text boxes inside a <dialog> open the keyboard but ignore every key.
// onClose runs once however it closes (the ✕, Escape, or the returned close()).
export function modal(title, body, cls = '', onClose) {
  const before = document.activeElement;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey, true);
    layer.remove();
    if (before && before.isConnected) before.focus({ preventScroll: true });
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    const layers = document.querySelectorAll('.modal-layer');
    if (layers[layers.length - 1] !== layer) return;   // only the top pop-up closes
    e.preventDefault();
    close();
  };
  const box = h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    h('div', { class: 'modal-head' }, h('h2', {}, title),
      h('button', { class: 'icon-btn', type: 'button', onclick: close, 'aria-label': 'Close' }, '✕')),
    body);
  const layer = h('div', { class: 'modal-layer' }, box);
  document.addEventListener('keydown', onKey, true);
  document.body.append(layer);
  box.focus({ preventScroll: true });
  return close;
}

export function confirmDialog(message, yes = 'Yes', no = 'No') {
  return new Promise((resolve) => {
    let close;
    const done = (v) => {
      resolve(v);
      close();
    };
    close = modal(message, h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => done(false) }, no),
      h('button', { class: 'btn primary', onclick: () => done(true) }, yes)), 'confirm', () => resolve(false));
  });
}

// fields: [{name,label,type,value,options,show(vals),placeholder,min}]
// types: text number date time select checkbox emoji color days
export function formDialog({ title, fields, onSave, onDelete, saveLabel = 'Save' }) {
  const vals = {};
  fields.forEach((f) => (vals[f.name] = f.value ?? ''));
  const form = h('form', { class: 'form' });
  let close;
  let emojiOpen = false;

  function control(f) {
    const set = (v, rebuild) => {
      vals[f.name] = v;
      if (rebuild) build();
    };
    switch (f.type) {
      case 'select':
        return h('select', { onchange: (e) => set(e.target.value, true) },
          f.options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(vals[f.name]) }, o.label)));
      case 'checkbox':
        return h('input', { type: 'checkbox', checked: !!vals[f.name],
          onchange: (e) => set(e.target.checked, true) });
      case 'color':
        return h('div', { class: 'swatches' }, COLORS.map((c) =>
          h('button', { type: 'button', class: 'swatch' + (vals[f.name] === c ? ' on' : ''),
            style: { background: c }, 'aria-label': 'Colour', onclick: () => set(c, true) })));
      case 'emoji':
        return h('div', {},
          h('button', { type: 'button', class: 'emoji-current',
            onclick: () => { emojiOpen = !emojiOpen; build(); } }, vals[f.name] || '➕'),
          emojiOpen && h('div', { class: 'emoji-grid' }, EMOJI.map((e) =>
            h('button', { type: 'button', onclick: () => { emojiOpen = false; set(e, true); } }, e))));
      case 'photo': {
        const input = h('input', { type: 'file', accept: 'image/*', hidden: true,
          onchange: async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try { set(await photoToDataUrl(file), true); } catch (err) { /* keep the old one */ }
          } });
        return h('div', { class: 'photo-field' },
          h('span', { class: 'avatar', style: { '--c': vals.color || '#5b7cfa' } },
            vals[f.name] ? h('img', { src: vals[f.name], alt: '' }) : vals.avatar || '🙂'),
          input,
          h('button', { type: 'button', class: 'btn', onclick: () => input.click() },
            vals[f.name] ? 'Change photo' : 'Upload photo'),
          vals[f.name] && h('button', { type: 'button', class: 'btn', onclick: () => set('', true) }, 'Remove'));
      }
      case 'days': {
        const on = String(vals[f.name] || '').split(',').filter(Boolean);
        return h('div', { class: 'days' }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) =>
          h('button', { type: 'button', class: on.includes(String(i)) ? 'on' : '',
            onclick: () => {
              const next = on.includes(String(i)) ? on.filter((x) => x !== String(i)) : [...on, String(i)];
              set(next.sort().join(','), true);
            } }, d)));
      }
      default:
        return h('input', { type: f.type || 'text', value: vals[f.name],
          placeholder: f.placeholder || '', min: f.min, inputMode: f.type === 'number' ? 'numeric' : undefined,
          oninput: (e) => set(e.target.value) });
    }
  }

  function build() {
    form.replaceChildren();
    for (const f of fields) {
      if (f.show && !f.show(vals)) continue;
      const boxed = ['photo', 'emoji', 'color', 'days'].includes(f.type);
      form.append(h(boxed ? 'div' : 'label', { class: 'field' + (f.type === 'checkbox' ? ' inline' : '') },
        h('span', {}, f.label), control(f)));
    }
    form.append(h('div', { class: 'actions' },
      onDelete && h('button', { type: 'button', class: 'btn danger',
        onclick: async () => {
          if (await confirmDialog('Delete this?', 'Delete', 'Keep')) {
            onDelete();
            close();
          }
        } }, 'Delete'),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn primary' }, saveLabel)));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = { ...vals };
    fields.forEach((f) => {
      if (f.type === 'number') out[f.name] = Number(out[f.name]) || 0;
      if (typeof out[f.name] === 'string') out[f.name] = out[f.name].trim();
    });
    if ((await onSave(out)) !== false) close();
  });
  build();
  close = modal(title, form);
  // Only focus the first box for a mouse and keyboard. On touch tablets (Amazon Silk)
  // a field focused by script gets no on-screen keyboard, and tapping it then does nothing.
  const first = form.querySelector('input[type=text]');
  if (first && !first.value && matchMedia('(hover: hover) and (pointer: fine)').matches) first.focus();
}

// Resolves with the 4 digits entered, or null if closed.
export function pinPad(title = 'Parent PIN') {
  return new Promise((resolve) => {
    let pin = '';
    let close;
    const dots = h('div', { class: 'pin-dots' });
    const draw = () => dots.replaceChildren(...[0, 1, 2, 3].map((i) =>
      h('span', { class: i < pin.length ? 'on' : '' })));
    const press = (k) => {
      if (k === '⌫') pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += k;
      draw();
      if (pin.length === 4) {
        const v = pin;
        setTimeout(() => { resolve(v); close(); }, 120);
      }
    };
    const pad = h('div', { class: 'pin-pad' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) =>
        k ? h('button', { type: 'button', onclick: () => press(k) }, k) : h('span')));
    draw();
    close = modal(title, h('div', { class: 'pin' }, dots, pad), 'confirm', () => resolve(null));
  });
}
