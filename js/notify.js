// Phone notifications through ntfy (ntfy.sh): free, no account. Each parent installs
// the ntfy app and subscribes to the family's topic. The topic lives in the family's
// settings, so every device that ticks a task knows where to send.
import { setting, balance, tasksFor, completion } from './store.js';
import { today } from './util.js';

export const NTFY = 'https://ntfy.sh';
export const topicUrl = (topic) => `${NTFY}/${topic}`;

// A random name: the topic is the only thing that keeps the alerts private. 12 letters and
// digits from 32 (60 bits) is far too many to guess, yet short enough to type on a phone.
export function newTopic() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';   // no l, i, o, 0, 1: easy to read off a screen
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(bytes, (b) => abc[b % abc.length]).join('');
  return `fh-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export const notifyOn = () => setting('ntfyOn') === '1' && !!setting('ntfyTopic');

// JSON to the root URL as text/plain: no CORS preflight, and emoji are fine in the body.
export async function send(msg, topic = setting('ntfyTopic')) {
  if (!topic) throw new Error('No topic');
  const r = await fetch(NTFY + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ topic, ...msg }),
  });
  if (!r.ok) throw new Error('ntfy answered ' + r.status);
}

// A kid ticked a task. Never blocks or bothers the kid: failures are silent.
export function kidFinished(p, t, r) {
  if (!notifyOn() || p.role !== 'kid') return;
  const all = tasksFor(p.id);
  const done = all.filter((x) => completion(x, today())).length;
  const allDone = all.length > 1 && done === all.length;
  const bits = [];
  if (r.stars > 0) bits.push(`+${r.stars} ⭐`);
  if (r.bonus) bits.push(`+${r.bonus} ⭐ bonus for ${r.streak} days in a row`);
  bits.push(`${done} of ${all.length} done today`, `${balance(p.id)} ⭐ total`);
  send({
    title: allDone ? `${p.name} finished everything for today! 🎉` : `${p.name} finished: ${t.title}`,
    message: (allDone ? `Last one: ${t.title}\n` : '') + bits.join(' · '),
    tags: [allDone ? 'tada' : 'white_check_mark'],
    priority: allDone ? 4 : 3,
  }).catch(() => {});
}
