import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayHeading, dayKey, dialDigits, groupByDay, initials, localParts, parseLocal, personName, relativeTime } from './format.ts';

test('personName prefers the full name, then company, e-mail, phone', () => {
  assert.equal(personName({ firstName: 'Ana', lastName: 'Silva' }), 'Ana Silva');
  assert.equal(personName({ companyName: 'Acme' }), 'Acme');
  assert.equal(personName({ email: 'a@b.co' }), 'a@b.co');
  assert.equal(personName({ phone: '+55 11 99999-0000' }), '+55 11 99999-0000');
  assert.equal(personName(null), 'Sem nome');
});

test('initials', () => {
  assert.equal(initials('Ana Maria Silva'), 'AS');
  assert.equal(initials('acme'), 'AC');
  assert.equal(initials(''), '?');
});

test('relativeTime', () => {
  const now = new Date(2026, 2, 10, 15, 0);
  assert.equal(relativeTime(new Date(2026, 2, 10, 14, 59, 40).toISOString(), now), 'agora');
  assert.equal(relativeTime(new Date(2026, 2, 10, 14, 30).toISOString(), now), '30 min');
  assert.equal(relativeTime(new Date(2026, 2, 10, 11, 0).toISOString(), now), '4 h');
  assert.equal(relativeTime(new Date(2026, 2, 9, 23, 0).toISOString(), now), 'ontem');
  assert.equal(relativeTime(new Date(2026, 1, 3, 9, 0).toISOString(), now), '03/02');
  assert.equal(relativeTime(null, now), '');
});

test('groupByDay sorts days and events', () => {
  const a = { startsAt: new Date(2026, 2, 11, 9).toISOString(), id: 'a' };
  const b = { startsAt: new Date(2026, 2, 10, 16).toISOString(), id: 'b' };
  const c = { startsAt: new Date(2026, 2, 10, 8).toISOString(), id: 'c' };
  const groups = groupByDay([a, b, c]);
  assert.deepEqual(groups.map((group) => group.key), ['2026-03-10', '2026-03-11']);
  assert.deepEqual(groups[0].items.map((item) => item.id), ['c', 'b']);
});

test('dayHeading', () => {
  const now = new Date(2026, 2, 10, 12);
  assert.equal(dayHeading('2026-03-10', now), 'Hoje, 10 mar');
  assert.equal(dayHeading('2026-03-11', now), 'Amanhã, 11 mar');
  assert.equal(dayHeading('2026-03-13', now), 'sexta, 13 mar');
});

test('dialDigits adds 55 only to bare Brazilian numbers', () => {
  assert.equal(dialDigits('(11) 99999-0000'), '5511999990000');
  assert.equal(dialDigits('11 3333-4444'), '551133334444');
  assert.equal(dialDigits('+1 415 555 0100'), '14155550100');
  assert.equal(dialDigits('0055 11 99999-0000'), '5511999990000');
  assert.equal(dialDigits(null), '');
});

test('parseLocal validates date and time', () => {
  const iso = parseLocal('2026-03-05', '14:30');
  assert.ok(iso);
  if (!iso) return;
  assert.deepEqual(localParts(iso), { date: '2026-03-05', time: '14:30' });
  assert.equal(parseLocal('2026-02-30', '10:00'), null);
  assert.equal(parseLocal('2026-03-05', '25:00'), null);
  assert.equal(parseLocal('05/03/2026', '10:00'), null);
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});
