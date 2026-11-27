// API_BASE and DASHBOARD_URL come from config.js (importScripts in the worker; the tests define the globals themselves)
if (typeof importScripts === 'function') importScripts('config.js');
const API = API_BASE;
const DASHBOARD = DASHBOARD_URL;
const ALARM = 'poll-deadlines';
const DEFAULT_MINUTES = 15;
const DAILY = 1440; // "once a day" option in the popup
const ICON = 'icons/icon128.png';

async function schedule() {
  const { pollMinutes = DEFAULT_MINUTES } = await chrome.storage.local.get('pollMinutes');
  if (pollMinutes === 0) return chrome.alarms.clear(ALARM);
  // runs every time the worker starts (alarms can be lost on browser restart); only create when missing or the
  // period changed, because re-creating on every wake would keep resetting the timer
  const existing = await chrome.alarms.get(ALARM);
  if (existing?.periodInMinutes !== pollMinutes) chrome.alarms.create(ALARM, { periodInMinutes: pollMinutes, delayInMinutes: 1 });
}

function dueText(deadline, now = Date.now()) {
  const ms = new Date(deadline) - now;
  const when = new Date(deadline).toLocaleString();
  if (ms < 0) return `Overdue (was due ${when})`;
  const hours = Math.round(ms / 36e5);
  return hours < 1 ? `Due within the hour (${when})` : `Due in about ${hours} hour${hours === 1 ? '' : 's'} (${when})`;
}

async function poll() {
  const { token, pollMinutes = DEFAULT_MINUTES } = await chrome.storage.local.get(['token', 'pollMinutes']);
  if (!token) return;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  try {
    const res = await fetch(`${API}/notifications/unread`, { headers });
    if (res.status === 401) return chrome.storage.local.remove('token'); // expired: the popup asks for a new login
    if (!res.ok) return;
    const unread = await res.json();
    if (!unread.length) return;
    if (pollMinutes === DAILY && unread.length > 1) {
      // daily mode: one summary instead of a burst of separate notifications
      chrome.notifications.create('digest', { type: 'basic', iconUrl: ICON, title: `${unread.length} commissions due soon`, message: unread.map((n) => n.title).join(', ') });
    } else {
      for (const n of unread) {
        // same id on a repeat shows replaces the notification instead of stacking a second one
        chrome.notifications.create(`notification-${n.id}`, { type: 'basic', iconUrl: ICON, title: n.title, message: dueText(n.deadline) });
      }
    }
    // acknowledge only after showing: if this call fails they show again next poll (at-least-once)
    await fetch(`${API}/notifications/read`, { method: 'POST', headers, body: JSON.stringify({ ids: unread.map((n) => n.id) }) });
  } catch {
    // server offline or still waking up: try again at the next alarm
  }
}

// clicking a notification brings you back to the dashboard: reuse an open tab instead of stacking a new one
async function openDashboard(notificationId) {
  const [existing] = await chrome.tabs.query({ url: `${DASHBOARD}/*` }); // needs host permission for the dashboard origin
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: DASHBOARD });
  }
  chrome.notifications.clear(notificationId);
}
chrome.notifications.onClicked.addListener(openDashboard);

chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM) poll(); });
chrome.runtime.onStartup.addListener(poll);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.pollMinutes) schedule();
  if (changes.token?.newValue) poll(); // just logged in: check right away
});
schedule();

if (typeof module !== 'undefined') module.exports = { poll, schedule, dueText, openDashboard };