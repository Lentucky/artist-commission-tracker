// API_BASE and DASHBOARD_URL come from config.js (loaded before this file in popup.html)
const API = API_BASE;
const DASHBOARD = DASHBOARD_URL;
const $ = (id) => document.getElementById(id);
// textContent, never innerHTML: titles and server messages are untrusted text
const say = (msg) => { $('status').textContent = msg; };
const OFFLINE = "Can't reach the server. If it was idle, give it a minute to wake up and try again.";
let pending; // the scan under review

// server errors look like {status, message, fields: {field: problem}}; show the most specific text we have
const errorText = (data, status) =>
  Object.entries(data?.fields ?? {}).map(([k, v]) => `${k} ${v}`).join('; ') || data?.message || `error ${status}`;

async function getToken() {
  return (await chrome.storage.local.get('token')).token;
}

async function show() {
  const loggedIn = !!(await getToken());
  $('login').classList.toggle('hidden', loggedIn);
  $('main').classList.toggle('hidden', !loggedIn);
  $('review').classList.add('hidden');
}

async function post(path, body, jwt) {
  // the free host sleeps when idle: explain why a request is slow instead of looking frozen
  const slow = setTimeout(() => say('The server is waking up (free hosting). This can take a minute or two. Keep this window open…'), 4000);
  try {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(jwt && { Authorization: `Bearer ${jwt}` }) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000), // give up after 3 minutes
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(slow);
  }
}

async function auth(path) {
  try {
    const { status, data } = await post(path, { email: $('email').value.trim(), password: $('password').value });
    if (status === 200 && data.token) {
      await chrome.storage.local.set({ token: data.token });
      $('password').value = '';
      say('');
      return show();
    }
    say(status === 401 ? 'Wrong email or password.' : `Could not sign in: ${errorText(data, status)}`);
  } catch {
    say(OFFLINE);
  }
}

const pad = (n) => String(n).padStart(2, '0');
const toDateInput = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Heuristics misread real chats (tips, side comments), so a scan is only a draft the artist confirms.
async function scan() {
  say('Scanning…');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    pending = await chrome.tabs.sendMessage(tab.id, { type: 'scan' });
  } catch {
    return say('Open a Vgen, Twitter/X or Discord page (reload it if it was already open) and try again.');
  }
  if (!pending || pending.error) return say("Couldn't read this page. Select the commission text with your mouse and try again.");
  if (!pending.scanned) return say('This tab is running an older version of the scanner. Reload the tab (F5) and scan again.');
  $('title').value = pending.title;
  $('budget').value = pending.budget ?? '';
  $('deadline').value = pending.deadline ? toDateInput(pending.deadline) : '';
  const s = pending.scanned;
  say(`${pending.confident ? 'Looks like a commission' : 'Low confidence'} (${pending.confidence}%). Read ${s.chars} characters from the ${s.from}, starting "${s.preview}". Check the fields, then Sync.`);
  $('main').classList.add('hidden');
  $('review').classList.remove('hidden');
}

async function sync() {
  const title = $('title').value.trim();
  if (!title) return say('Title is required.');
  const budget = $('budget').value;
  const deadline = $('deadline').value;
  try {
    const { status, data } = await post('/commissions', {
      title,
      platform: pending.platform,
      sourceUrl: pending.sourceUrl,
      budget: budget === '' ? null : Number(budget),
      // date input -> end of that day, local time (same rule as the scanner)
      deadline: deadline ? new Date(...deadline.split('-').map((n, i) => (i === 1 ? n - 1 : +n)), 23, 59).toISOString() : null,
      metadata: { confidence: pending.confidence },
    }, await getToken());
    if (status === 201) { await show(); say(`Synced "${title}"`); }
    else if (status === 409) say('Already tracked from this page.');
    else if (status === 401) { await chrome.storage.local.remove('token'); await show(); say('Session expired. Log in again.'); }
    else say(`The server rejected it: ${errorText(data, status)}`);
  } catch {
    say(OFFLINE);
  }
}

$('loginBtn').onclick = () => auth('/auth/login');
$('registerBtn').onclick = () => auth('/auth/register');
$('scanBtn').onclick = scan;
$('syncBtn').onclick = sync;
// reuse an open dashboard tab instead of stacking a new one (needs host permission for the dashboard origin)
$('dashBtn')?.addEventListener('click', async () => {
  const [existing] = await chrome.tabs.query({ url: `${DASHBOARD}/*` });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: DASHBOARD });
  }
});

$('cancelBtn').onclick = () => { say(''); show(); };
$('logoutBtn').onclick = async () => { await chrome.storage.local.remove('token'); say(''); show(); };
async function loadPoll() {
  $('poll').value = String((await chrome.storage.local.get('pollMinutes')).pollMinutes ?? 15);
}
$('poll').onchange = () => chrome.storage.local.set({ pollMinutes: Number($('poll').value) });

// Enter in either box means "Log in" (use the Register button to create an account)
for (const id of ['email', 'password']) {
  $(id)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') auth('/auth/login'); });
}

show();
loadPoll();