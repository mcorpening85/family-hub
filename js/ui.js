// Dialogs: modal, generic form, confirm, PIN pad.
import { h } from './util.js';

export const COLORS = ['#ff5d8f', '#ff9f1c', '#ffd23f', '#3ccf91', '#2ec4f1',
  '#5b7cfa', '#a66bff', '#ff6b5e'];

export const EMOJI = ('🪥 🛏️ 👗 👟 🎒 🧸 📚 ✏️ 🎹 🎨 🧹 🧺 🍽️ 🥣 🥦 🍎 💧 🚿 🛁 🧼 ' +
  '🐶 🐱 🐟 🌱 🗑️ ♻️ 🚲 ⚽ 🏃 🧘 😴 🙏 💊 🦷 🧦 🧥 📖 🎻 🧮 🧩 ' +
  '🎬 🍦 🍕 🍿 🎮 📺 🌙 🎁 🎟️ 🛝 🏊 🎢 🧁 🍪 🛍️ 💵 🎉 ⭐ ❤️ 🌈 ' +
  '👧 👩 👨 👦 👶 🧒 🦄 🐼 🦊 🐰 🐯 🦋 🐸 🐵 🦁 🐙').split(' ');

export function modal(title, body, cls = '') {
  const d = h('dialog', { class: 'modal ' + cls });
  const close = () => {
    if (d.open) d.close();
    d.remove();
  };
  d.append(
    h('div', { class: 'modal-head' }, h('h2', {}, title),
      h('button', { class: 'icon-btn', type: 'button', onclick: close, 'aria-label': 'Close' }, '✕')),
    body);
  d.addEventListener('cancel', () => setTimeout(() => d.remove()));
  document.body.append(d);
  d.showModal();
  return close;
}

export function confirmDialog(message, yes = 'Yes', no = 'No') {
  return new Promise((resolve) => {
    let close;
    const done = (v) => {
      close();
      resolve(v);
    };
    close = modal(message, h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => done(false) }, no),
      h('button', { class: 'btn primary', onclick: () => done(true) }, yes)), 'confirm');
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
      form.append(h('label', { class: 'field' + (f.type === 'checkbox' ? ' inline' : '') },
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
  const first = form.querySelector('input[type=text]');
  if (first && !first.value) first.focus();
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
        setTimeout(() => { close(); resolve(v); }, 120);
      }
    };
    const pad = h('div', { class: 'pin-pad' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) =>
        k ? h('button', { type: 'button', onclick: () => press(k) }, k) : h('span')));
    draw();
    close = modal(title, h('div', { class: 'pin' }, dots, pad), 'confirm');
    document.querySelector('dialog.modal:last-of-type .icon-btn')
      .addEventListener('click', () => resolve(null));
  });
}
