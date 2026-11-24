// node --test tests/reminders.test.cjs
const S = require('../js/state.js');
const test = require('node:test'), assert = require('node:assert');
const T = '2026-11-24';
function board(events, cards) {
  let b = S.defaultBoard();
  (events || []).forEach(e => { b = S.addEvent(b, e); });
  (cards || []).forEach(c => { b = S.addCard(b, b.columns[c.col || 0].id, c); });
  return b;
}
const show = (b, day, st) => S.resolveReminders(b, day, st);
const tags = r => r.items.map(i => i.title + '@' + i.days + '/' + i.stage);

test('exact days fire: 7, 3, 0 and nothing else', () => {
  const due = S.shiftDate(T, 10);
  const b = board([{ title: 'A', date: due }]);
  let st = { last: S.shiftDate(T, -1) }, hits = [];
  for (let i = 0; i <= 11; i++) {
    const day = S.shiftDate(T, i), r = show(b, day, st);
    if (r.items.length) hits.push(r.items[0].days);
    r.items.forEach(x => { r.state.done[x.key] = x.due; delete r.state.open[x.key]; });
    st = r.state;
  }
  assert.deepEqual(hits, [7, 3, 0]);
});
test('missed while closed is shown on next start; once dismissed it stays gone', () => {
  const b = board([{ title: 'A', date: S.shiftDate(T, 2) }]);
  const r = show(b, T, { last: S.shiftDate(T, -4) });
  assert.deepEqual(tags(r), ['A@2/3']);
  r.state.done[r.items[0].key] = r.items[0].due; r.state.open = {};
  assert.equal(show(b, T, r.state).items.length, 0);
  assert.equal(show(b, S.shiftDate(T, 1), r.state).items.length, 0);
  assert.deepEqual(tags(show(b, S.shiftDate(T, 2), r.state)), ['A@0/0']);
});
test('undismissed stays until the next stage', () => {
  const b = board([{ title: 'A', date: S.shiftDate(T, 7) }]);
  let r = show(b, T, { last: S.shiftDate(T, -1) });
  r = show(b, S.shiftDate(T, 1), r.state); assert.deepEqual(tags(r), ['A@6/7']);
  r = show(b, S.shiftDate(T, 4), r.state); assert.deepEqual(tags(r), ['A@3/3']);
  r = show(b, S.shiftDate(T, 8), r.state); assert.deepEqual(tags(r), []);
  assert.deepEqual(r.state.open, {});
});
test('added mid-window is not announced late', () => {
  const b = board([{ title: 'A', date: S.shiftDate(T, 5) }]);
  assert.equal(show(b, T, { last: T }).items.length, 0);
});
test('recurring and multi-day', () => {
  const wk = board([{ title: 'W', date: S.shiftDate(T, -7), repeat: { freq: 'weekly' } }]);
  assert.deepEqual(tags(show(wk, T, { last: S.shiftDate(T, -1) })), ['W@0/0']);
  const mo = board([{ title: 'M', date: '2026-10-27', repeat: { freq: 'monthly', day: 27 } }]);
  assert.deepEqual(tags(show(mo, T, { last: S.shiftDate(T, -1) })), ['M@3/3']);
  const mu = board([{ title: 'L', date: S.shiftDate(T, -1), endDate: S.shiftDate(T, 5), allDay: true }]);
  assert.equal(show(mu, T, null).items.length, 0);
});
test('cards: due shown, done/archived not', () => {
  let b = board([], [{ title: 'C', dueDate: T }, { title: 'D', dueDate: T, col: 2 }, { title: 'E', dueDate: T, id: 'e1' }]);
  const e = Object.keys(b.cards).find(k => b.cards[k].title === 'E');
  b = S.archiveCard(b, e);
  assert.deepEqual(tags(show(b, T, { last: T })), ['C@0/0']);
});
test('garbage state is tolerated; year rollover', () => {
  const b = board([{ title: 'A', date: '2027-01-02' }]);
  [null, 5, 'x', { open: 3, done: [1], last: 9 }].forEach(s => show(b, '2026-12-30', s));
  assert.deepEqual(tags(show(b, '2026-12-30', { last: '2026-12-29' })), ['A@3/3']);
});
test('retired themes fall back', () => {
  assert.equal(S.normalizeBoard({ theme: 'ffxvi', columns: [] }).theme, 'claude');
  assert.equal(S.THEMES.length, 11);
});
