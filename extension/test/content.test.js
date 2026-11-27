const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze, platformOf, sourceKeyFor, onMessage, THRESHOLD } = require('../content.js');

const now = new Date(2026, 9, 23, 12, 0); // Oct 23 2026, local time
const ymd = (iso) => {
  const d = new Date(iso);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
};

test('vgen-style order page scores 100', () => {
  const r = analyze('Commission request: Full body chibi\nBudget: $120.50\nDue by Nov 15, 2026', now);
  assert.equal(r.confidence, 100);
  assert.equal(r.budget, 120.5);
  assert.deepEqual(ymd(r.deadline), [2026, 11, 15]);
});

test('tweet scores 100', () => {
  const r = analyze("hey! would love to commission a headshot, can pay $45 USD. need it by 15 Dec", now);
  assert.equal(r.confidence, 100);
  assert.equal(r.budget, 45);
  assert.deepEqual(ymd(r.deadline), [2026, 12, 15]);
});

test('discord message scores 100', () => {
  const r = analyze('ur comms open? quote me for a sketch, deadline is 2026-11-30, budget 60 usd', now);
  assert.equal(r.confidence, 100);
  assert.equal(r.budget, 60);
  assert.deepEqual(ymd(r.deadline), [2026, 11, 30]);
});

test('no commission keyword scores 0 even with a price and a date', () => {
  const r = analyze('Great coffee today, only $5! Due by Nov 20 for the group order', now);
  assert.deepEqual(r, { confidence: 0, budget: null, deadline: null });
});

test('keyword alone is below the threshold', () => {
  const r = analyze('Are your commissions open?', now);
  assert.equal(r.confidence, 40);
  assert.ok(r.confidence < THRESHOLD);
});

test('keyword + price, or keyword + deadline, reaches the threshold', () => {
  const price = analyze('Quote for a headshot? budget $80', now);
  const date = analyze('commission due by Nov 15', now);
  assert.equal(price.confidence, 70);
  assert.equal(date.confidence, 70);
  assert.ok(price.confidence >= THRESHOLD && date.confidence >= THRESHOLD);
});

test('relative deadline: in 2 weeks', () => {
  const r = analyze('commission for $30, need it in 2 weeks', now);
  assert.equal(r.deadline, new Date(now.getTime() + 14 * 864e5).toISOString());
});

test('a month with no year that already passed rolls to next year', () => {
  assert.deepEqual(ymd(analyze('commission $20 due by Mar 3', now).deadline), [2027, 3, 3]);
});

test('thousands separators in prices', () => {
  assert.equal(analyze('commission, total $1,200 due by Nov 15', now).budget, 1200);
});

test('non-dates and past dates are ignored, not guessed', () => {
  assert.equal(analyze('commission $20 due by Feb 31', now).deadline, null);
  assert.equal(analyze('commission $20 due by Nov 15, 2025', now).deadline, null);
  assert.equal(analyze('commission $20 by mark 5', now).deadline, null);
  assert.equal(analyze('commission $20, posted Nov 3', now).deadline, null); // no deadline cue
});

test('a "total" cue beats other prices, whatever the unit', () => {
  const chat = 'comm idea! i will add a 20usd tip. its 75 dollars + 32 dollars for two bodies. a total of 112 dollaridoos';
  assert.equal(analyze(chat, now).budget, 112);
});

test('without a total cue the largest price wins, not the first', () => {
  assert.equal(analyze('commission: 20usd tip, 75 dollars base, 32 dollars extra', now).budget, 75);
});

test('"around 2 weeks" before an update is not a deadline', () => {
  assert.equal(analyze('commission $50, ok with waiting for around 2 weeks before i give you an update', now).deadline, null);
});

test('platform from hostname', () => {
  assert.equal(platformOf('vgen.co'), 'VGEN');
  assert.equal(platformOf('www.vgen.co'), 'VGEN');
  assert.equal(platformOf('x.com'), 'TWITTER');
  assert.equal(platformOf('twitter.com'), 'TWITTER');
  assert.equal(platformOf('discord.com'), 'DISCORD');
  assert.equal(platformOf('notvgen.co'), 'OTHER');
});

const dm = 'https://discord.com/channels/@me/123';

test('discord: each selected message gets its own key, the same selection keeps the same key', () => {
  const a = sourceKeyFor('DISCORD', dm, 'commission idea one, $50');
  const b = sourceKeyFor('DISCORD', dm, 'commission idea two, $80');
  assert.notEqual(a, b);
  assert.equal(a, sourceKeyFor('DISCORD', dm, 'commission idea one, $50'));
  assert.ok(a.startsWith(dm + '#c='));
});

test('discord without a selection, and other platforms, keep the plain URL', () => {
  assert.equal(sourceKeyFor('DISCORD', dm, ''), dm);
  assert.equal(sourceKeyFor('TWITTER', 'https://x.com/a/status/1', 'some text'), 'https://x.com/a/status/1');
  assert.equal(sourceKeyFor('VGEN', 'https://vgen.co/o/9', 'some text'), 'https://vgen.co/o/9');
});

test('an existing fragment is replaced, not stacked', () => {
  const key = sourceKeyFor('DISCORD', dm + '#old', 'text');
  assert.equal(key.split('#').length, 2);
});

test('a scan that throws (broken page structure) replies with an error instead of hanging', () => {
  const replies = [];
  onMessage({ type: 'scan' }, null, (r) => replies.push(r), () => { throw new TypeError('Cannot read properties of null'); });
  assert.deepEqual(replies, [{ error: 'scan-failed' }]);
});

test('onMessage ignores other message types and passes scan results through', () => {
  const replies = [];
  onMessage({ type: 'other' }, null, (r) => replies.push(r), () => ({ ok: 1 }));
  assert.equal(replies.length, 0);
  onMessage({ type: 'scan' }, null, (r) => replies.push(r), () => ({ ok: 1 }));
  assert.deepEqual(replies, [{ ok: 1 }]);
});