const test = require('node:test');
const assert = require('node:assert/strict');

// config.js is loaded by the real worker; here the tests define the same globals
globalThis.API_BASE = 'http://api.test/api';
globalThis.DASHBOARD_URL = 'http://dash.test';

const state = { store: {}, alarms: {}, shown: [], fetches: [], tabs: [], cleared: [], openTabs: [], updated: [], focusedWindows: [] };
const reset = () => { state.store = {}; state.alarms = {}; state.shown = []; state.fetches = []; state.tabs = []; state.cleared = []; state.openTabs = []; state.updated = []; state.focusedWindows = []; };

// minimal fake of the chrome.* APIs the worker uses
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in state.store).map((k) => [k, state.store[k]])),
      set: async (obj) => { Object.assign(state.store, obj); },
      remove: async (key) => { delete state.store[key]; },
    },
    onChanged: { addListener() {} },
  },
  alarms: {
    get: async (name) => state.alarms[name],
    create: (name, info) => { state.alarms[name] = { name, ...info }; },
    clear: async (name) => { delete state.alarms[name]; },
    onAlarm: { addListener() {} },
  },
  notifications: {
    create: (id, opts) => { state.shown.push({ id, ...opts }); },
    clear: (id) => { state.cleared.push(id); },
    onClicked: { addListener() {} },
  },
  tabs: {
    create: (opts) => { state.tabs.push(opts); },
    query: async () => state.openTabs,
    update: async (id, props) => { state.updated.push({ id, ...props }); },
  },
  windows: { update: async (id, props) => { state.focusedWindows.push({ id, ...props }); } },
  runtime: { onStartup: { addListener() {} } },
};

const { poll, schedule, dueText, openDashboard } = require('../background.js');

const json = (status, body) => ({ status, ok: status < 300, json: async () => body });
const mockFetch = (handler) => {
  globalThis.fetch = async (url, opts = {}) => { state.fetches.push({ url, opts }); return handler(url, opts); };
};
const inHours = (h) => new Date(Date.now() + h * 36e5).toISOString();

test('poll shows each unread notification, then acknowledges them', async () => {
  reset();
  state.store.token = 't';
  mockFetch((url) => (url.endsWith('/unread')
    ? json(200, [{ id: 7, title: 'Skadi', deadline: inHours(2) }, { id: 8, title: 'Late one', deadline: inHours(-1) }])
    : json(204, null)));
  await poll();
  assert.deepEqual(state.shown.map((n) => n.title), ['Skadi', 'Late one']);
  assert.match(state.shown[0].message, /Due in about 2 hours/);
  assert.match(state.shown[1].message, /Overdue/);
  const ack = state.fetches.at(-1);
  assert.ok(ack.url.endsWith('/notifications/read'));
  assert.deepEqual(JSON.parse(ack.opts.body), { ids: [7, 8] });
  assert.equal(ack.opts.headers.Authorization, 'Bearer t');
});

test('poll does nothing when logged out or when nothing is unread', async () => {
  reset();
  mockFetch(() => { throw new Error('should not be called'); });
  await poll(); // no token: no request at all
  assert.equal(state.fetches.length, 0);

  state.store.token = 't';
  mockFetch(() => json(200, []));
  await poll();
  assert.equal(state.shown.length, 0);
  assert.equal(state.fetches.length, 1); // fetched, found nothing, sent no acknowledgement
});

test('an expired token (401) is cleared so the popup asks for a login', async () => {
  reset();
  state.store.token = 'old';
  mockFetch(() => json(401, null));
  await poll();
  assert.equal(state.store.token, undefined);
  assert.equal(state.shown.length, 0);
});

test('backend offline: no crash, nothing shown, token kept', async () => {
  reset();
  state.store.token = 't';
  mockFetch(() => { throw new TypeError('Failed to fetch'); });
  await poll();
  assert.equal(state.shown.length, 0);
  assert.equal(state.store.token, 't');
});

test('failed acknowledgement does not throw (notification repeats next poll)', async () => {
  reset();
  state.store.token = 't';
  mockFetch((url) => {
    if (url.endsWith('/unread')) return json(200, [{ id: 1, title: 'A', deadline: inHours(1) }]);
    throw new TypeError('Failed to fetch');
  });
  await poll();
  assert.equal(state.shown.length, 1);
});

test('daily mode: several unread become one summary, all acknowledged', async () => {
  reset();
  state.store.token = 't';
  state.store.pollMinutes = 1440;
  mockFetch((url) => (url.endsWith('/unread')
    ? json(200, [{ id: 1, title: 'A', deadline: inHours(3) }, { id: 2, title: 'B', deadline: inHours(5) }, { id: 3, title: 'C', deadline: inHours(9) }])
    : json(204, null)));
  await poll();
  assert.equal(state.shown.length, 1);
  assert.equal(state.shown[0].title, '3 commissions due soon');
  assert.equal(state.shown[0].message, 'A, B, C');
  assert.deepEqual(JSON.parse(state.fetches.at(-1).opts.body), { ids: [1, 2, 3] });
});

test('daily mode: a single unread still shows its own text', async () => {
  reset();
  state.store.token = 't';
  state.store.pollMinutes = 1440;
  mockFetch((url) => (url.endsWith('/unread') ? json(200, [{ id: 4, title: 'Solo', deadline: inHours(2) }]) : json(204, null)));
  await poll();
  assert.deepEqual(state.shown.map((n) => n.title), ['Solo']);
});

test('schedule: defaults to 15 minutes and a worker wake does not reset the timer', async () => {
  reset();
  await schedule();
  const alarm = state.alarms['poll-deadlines'];
  assert.equal(alarm.periodInMinutes, 15);
  state.alarms['poll-deadlines'] = { ...alarm, marker: 'original' };
  await schedule(); // the worker woke up again
  assert.equal(state.alarms['poll-deadlines'].marker, 'original');
});

test('schedule: changing the setting recreates the alarm, 0 turns it off', async () => {
  reset();
  await schedule();
  state.store.pollMinutes = 5;
  await schedule();
  assert.equal(state.alarms['poll-deadlines'].periodInMinutes, 5);
  state.store.pollMinutes = 0;
  await schedule();
  assert.equal(state.alarms['poll-deadlines'], undefined);
});

test('dueText wording', () => {
  const now = Date.now();
  assert.match(dueText(new Date(now + 20 * 60000).toISOString(), now), /within the hour/);
  assert.match(dueText(new Date(now + 60 * 60000).toISOString(), now), /about 1 hour \(/);
  assert.match(dueText(new Date(now - 1000).toISOString(), now), /^Overdue/);
});

test('clicking a notification opens the dashboard and dismisses it', async () => {
  reset();
  await openDashboard('notification-7');
  assert.deepEqual(state.tabs, [{ url: 'http://dash.test' }]);
  assert.deepEqual(state.cleared, ['notification-7']);
});

test('clicking a notification reuses an open dashboard tab instead of opening another', async () => {
  reset();
  state.openTabs = [{ id: 42, windowId: 7 }];
  await openDashboard('notification-8');
  assert.deepEqual(state.tabs, []); // no new tab
  assert.deepEqual(state.updated, [{ id: 42, active: true }]);
  assert.deepEqual(state.focusedWindows, [{ id: 7, focused: true }]);
  assert.deepEqual(state.cleared, ['notification-8']);
});