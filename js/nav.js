// Tiny router: one state object, one render function.
export const state = { view: 'home', unlockedUntil: 0 };

let renderer = () => {};
export const setRenderer = (fn) => (renderer = fn);
export const render = () => renderer();
export function go(view, extra = {}) {
  Object.assign(state, { view }, extra);
  render();
}
export const unlocked = () => Date.now() < state.unlockedUntil;
export const unlock = () => (state.unlockedUntil = Date.now() + 5 * 60 * 1000);
