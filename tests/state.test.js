'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/state.js');

// minimal in-memory storage mock
function makeStorage(data) {
  const store = Object.assign({}, data);
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _dump: () => Object.assign({}, store)
  };
}

test('default board has 3 columns, sample card, and starter labels', () => {
  const b = S.defaultBoard();
  assert.equal(b.columns.length, 3);
  assert.equal(S.totalCards(b), 1);
  assert.ok(b.labels['lbl-idea']);
  assert.equal(b.columns[0].cards.length, 1);
});

test('addCard places the card in the target column', () => {
  const b = S.defaultBoard();
  const before = S.totalCards(b);
  const b2 = S.addCard(b, b.columns[1].id, { id: 'c1', title: 'Hello' });
  assert.equal(S.totalCards(b2), before + 1);
  assert.ok(b2.columns[1].cards.indexOf('c1') !== -1);
  // original untouched (immutability)
  assert.equal(S.totalCards(b), before);
});

test('updateCard patches fields and bumps updatedAt', () => {
  const b = S.defaultBoard();
  const cardId = b.columns[0].cards[0];
  const past = '2000-01-01T00:00:00.000Z';
  b.cards[cardId].updatedAt = past; // force an old timestamp
  const b2 = S.updateCard(b, cardId, { title: 'New', priority: 3, assignee: 'Ada' });
  assert.equal(b2.cards[cardId].title, 'New');
  assert.equal(b2.cards[cardId].priority, 3);
  assert.equal(b2.cards[cardId].assignee, 'Ada');
  assert.equal(b2.cards[cardId].updatedAt > past, true); // bumped to "now"
});

test('removeCard removes it from the column and the map', () => {
  const b = S.defaultBoard();
  const cardId = b.columns[0].cards[0];
  const b2 = S.removeCard(b, cardId);
  assert.equal(b2.cards[cardId], undefined);
  assert.equal(b2.columns[0].cards.length, 0);
});

test('moveCard moves a card between columns at an index', () => {
  const b = S.defaultBoard();
  const cardId = b.columns[0].cards[0];
  const b2 = S.moveCard(b, cardId, b.columns[2].id, 0);
  assert.equal(b2.columns[0].cards.indexOf(cardId), -1);
  assert.ok(b2.columns[2].cards.indexOf(cardId) !== -1);
});

test('setColumnOrder reorders columns', () => {
  const b = S.defaultBoard();
  const ids = [b.columns[0].id, b.columns[1].id, b.columns[2].id];
  const b2 = S.setColumnOrder(b, [ids[2], ids[0], ids[1]]);
  assert.deepEqual(b2.columns.map(c => c.id), [ids[2], ids[0], ids[1]]);
});

test('removeColumn deletes its cards', () => {
  const b = S.defaultBoard();
  const colId = b.columns[0].id;
  const cardId = b.columns[0].cards[0];
  const b2 = S.removeColumn(b, colId);
  assert.equal(b2.columns.length, 2);
  assert.equal(b2.cards[cardId], undefined);
});

test('checklist ops add/toggle/remove items', () => {
  const b = S.defaultBoard();
  const cardId = b.columns[0].cards[0];
  let b2 = S.addChecklistItem(b, cardId, { id: 'i1', text: 'task' });
  assert.equal(b2.cards[cardId].checklist.length, 4);
  b2 = S.toggleChecklistItem(b2, cardId, 'i1');
  const item = b2.cards[cardId].checklist.find(i => i.id === 'i1');
  assert.equal(item.done, true);
  b2 = S.removeChecklistItem(b2, cardId, 'i1');
  assert.equal(b2.cards[cardId].checklist.length, 3);
});

test('editChecklistItem renames an item, trims length, bumps updatedAt', () => {
  const b = S.defaultBoard();
  const cardId = b.columns[0].cards[0];
  let pre = S.addChecklistItem(b, cardId, { id: 'i1', text: 'task' });
  const past = '2000-01-01T00:00:00.000Z';
  pre.cards[cardId].updatedAt = past; // force an old timestamp
  let b2 = S.editChecklistItem(pre, cardId, 'i1', 'renamed task');
  const item = b2.cards[cardId].checklist.find(i => i.id === 'i1');
  assert.equal(item.text, 'renamed task');
  assert.equal(b2.cards[cardId].updatedAt > past, true); // bumped to "now"
  // input board not mutated (immutability)
  assert.equal(pre.cards[cardId].checklist.find(i => i.id === 'i1').text, 'task');
  // unknown item id is a no-op on the checklist
  const b3 = S.editChecklistItem(b2, cardId, 'nope', 'x');
  assert.deepEqual(b3.cards[cardId].checklist.map(i => i.text), b2.cards[cardId].checklist.map(i => i.text));
});

test('labels can be added and assigned to cards', () => {
  const b = S.defaultBoard();
  const b2 = S.addLabel(b, { id: 'l1', name: 'Urgent', color: '#e5484d' });
  const cardId = b2.columns[0].cards[0];
  const b3 = S.setCardLabels(b2, cardId, ['l1', 'lbl-dev']);
  assert.deepEqual(b3.cards[cardId].labelIds, ['l1', 'lbl-dev']);
});

test('sortColumn by priority/dueDate/created', () => {
  const b = S.defaultBoard();
  let b2 = S.addCard(b, b.columns[0].id, { id: 'a', title: 'A', priority: 0 });
  b2 = S.addCard(b2, b.columns[0].id, { id: 'b', title: 'B', priority: 3 });
  const sorted = S.sortColumn(b2, b.columns[0].id, 'priority');
  const col = sorted.columns[0];
  assert.equal(col.cards[col.cards.length - 1], 'b'); // highest priority last
});

test('isOverdue flags past due dates', () => {
  const past = '2000-01-01';
  const future = '2999-01-01';
  const card = { dueDate: past, checklist: [] };
  assert.equal(S.isOverdue(card), true);
  card.dueDate = future;
  assert.equal(S.isOverdue(card), false);
  card.dueDate = null;
  assert.equal(S.isOverdue(card), false);
});

test('search matches title, description, assignee, and labels', () => {
  const b = S.defaultBoard();
  const cardId = b.columns[0].cards[0];
  const ids = S.searchCardIds(b, 'welcome');
  assert.ok(ids.indexOf(cardId) !== -1);
  const none = S.searchCardIds(b, 'zzzz-not-found');
  assert.equal(none.length, 0);
});

test('normalizeBoard drops orphan card/label references', () => {
  const raw = {
    name: 'X', theme: 'blueprint',
    columns: [{ id: 'c1', name: 'L1', cards: ['good', 'ghost'] }],
    cards: { good: { id: 'good', title: 'T', labelIds: ['real', 'ghost'] } },
    labels: { real: { id: 'real', name: 'R' } }
  };
  const b = S.normalizeBoard(raw);
  assert.deepEqual(b.columns[0].cards, ['good']);
  assert.deepEqual(b.cards.good.labelIds, ['real']);
  assert.equal(b.theme, 'blueprint');
});

test('normalizeBoard on garbage returns a valid board', () => {
  const b = S.normalizeBoard(null);
  assert.equal(b.columns.length, 3); // full default
  const b2 = S.normalizeBoard({ columns: 'nope', cards: 5 });
  assert.ok(Array.isArray(b2.columns));
  assert.equal(b2.columns.length, 1); // falls back to a single "To Do"
});

test('loadBoard/saveBoard round-trips through injected storage', () => {
  const storage = makeStorage();
  const b = S.defaultBoard();
  assert.equal(S.saveBoard(storage, b), true);
  const loaded = S.loadBoard(storage);
  assert.equal(loaded.name, b.name);
  assert.equal(S.totalCards(loaded), S.totalCards(b));
});

test('loadBoard falls back to default on corrupt data', () => {
  const storage = makeStorage();
  storage.setItem(S.STORAGE_KEY, '{not json');
  const b = S.loadBoard(storage);
  assert.ok(b.columns.length >= 1);
});

test('boardStats reports totals, overdue, and columns', () => {
  const b = S.defaultBoard();
  const cardId = b.columns[0].cards[0];
  const b2 = S.updateCard(b, cardId, { dueDate: '2000-01-01' });
  const stats = S.boardStats(b2);
  assert.equal(stats.total, 1);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.columns, 3);
});

test('setWipLimit stores and clears', () => {
  const b = S.defaultBoard();
  const id = b.columns[0].id;
  const b2 = S.setWipLimit(b, id, 5);
  assert.equal(b2.columns[0].wipLimit, 5);
  const b3 = S.setWipLimit(b2, id, null);
  assert.equal(b3.columns[0].wipLimit, null);
});

test('THEMES registers all seven themes and setTheme accepts each', () => {
  const expected = ['sticky', 'blueprint', 'cyberpunk', 'claude', 'ios-glass', 'swiss', 'forest'];
  for (const t of expected) assert.ok(S.THEMES.indexOf(t) !== -1, 'missing theme: ' + t);
  let b = S.defaultBoard();
  for (const t of expected) {
    const b2 = S.setTheme(b, t);
    assert.equal(b2.theme, t);
  }
});

test('toggleColumn flips collapsed state', () => {
  const b = S.defaultBoard();
  const id = b.columns[0].id;
  const b2 = S.toggleColumn(b, id);
  assert.equal(b2.columns[0].collapsed, true);
  const b3 = S.toggleColumn(b2, id);
  assert.equal(b3.columns[0].collapsed, false);
});
