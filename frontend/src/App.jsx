import { useEffect, useState } from 'react';

const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const LABEL = { PENDING: 'Pending', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
const PLATFORM_STYLE = {
  VGEN: 'bg-violet-100 text-violet-700',
  TWITTER: 'bg-sky-100 text-sky-700',
  DISCORD: 'bg-indigo-100 text-indigo-700',
  OTHER: 'bg-slate-100 text-slate-700',
};

const pad = (n) => String(n).padStart(2, '0');
const toDateInput = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// date input value -> end of that day in local time (same rule as the extension)
const endOfDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59).toISOString();
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// API address: empty in dev (Vite proxies /api); a hosted build sets VITE_API_URL, e.g. https://my-api.onrender.com
const API = import.meta.env.VITE_API_URL ?? '';

// shortcut: token lives in localStorage; fine for a local tool, revisit (httpOnly cookie) before hosting this publicly
async function api(path, { method = 'GET', body } = {}) {
  const jwt = localStorage.getItem('token');
  const res = await fetch(API + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(jwt && { Authorization: `Bearer ${jwt}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, data });
  return data;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(path) {
    try {
      const { token } = await api(path, { method: 'POST', body: { email, password } });
      localStorage.setItem('token', token);
      onLogin();
    } catch (e) {
      setError(
        e.status
          ? { 409: 'Email already registered.', 401: 'Wrong email or password.', 400: 'Enter a valid email and a password of 8-72 characters.' }[e.status] ?? e.data?.message ?? `The server answered with error ${e.status}.`
          : "Can't reach the server. If it was idle, give it a minute and try again."
      );
    }
  }

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2';
  return (
    <div className="mx-auto mt-24 w-full max-w-sm rounded-2xl bg-white p-6 shadow">
      <h1 className="mb-4 text-xl font-semibold">Commission Tracker</h1>
      <p className="mb-3 text-sm text-slate-500">New here? Type an email and a new password (8-72 characters), then click Register. Already registered? Click Log in.</p>
      <div className="space-y-3">
        <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} type="password" placeholder="Password (8-72 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="w-full rounded-lg bg-slate-900 py-2 text-white" onClick={() => submit('/auth/login')}>Log in</button>
        <button className="w-full rounded-lg border border-slate-300 py-2" onClick={() => submit('/auth/register')}>Register</button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function Card({ c, onStatus, onDeadline }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const active = c.status === 'PENDING' || c.status === 'IN_PROGRESS';
  const msLeft = c.deadline ? new Date(c.deadline) - Date.now() : null;
  const overdue = active && msLeft !== null && msLeft < 0;
  const soon = active && msLeft !== null && msLeft >= 0 && msLeft < 3 * 864e5;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium break-words">{c.title}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${PLATFORM_STYLE[c.platform]}`}>{c.platform}</span>
      </div>
      <p className="text-2xl font-semibold">{money.format(c.budget)}</p>
      <p className={`text-sm ${overdue ? 'text-red-600' : soon ? 'text-amber-600' : 'text-slate-500'}`}>
        {c.deadline ? `Due ${new Date(c.deadline).toLocaleDateString()}${overdue ? ' · overdue' : soon ? ' · due soon' : ''}` : 'No deadline'}
      </p>
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="rounded-lg bg-slate-900 px-2 py-1 text-sm text-white disabled:opacity-40" disabled={!draft} onClick={() => { onDeadline(c.id, draft); setEditing(false); }}>Save</button>
          {c.deadline && <button className="text-sm text-red-600 hover:underline" onClick={() => { onDeadline(c.id, ''); setEditing(false); }}>Remove</button>}
          <button className="text-sm text-slate-500 hover:underline" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <button className="self-start text-sm text-indigo-600 hover:underline" onClick={() => { setDraft(c.deadline ? toDateInput(c.deadline) : ''); setEditing(true); }}>Change deadline</button>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={c.status} onChange={(e) => onStatus(c.id, e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </select>
        {c.sourceUrl && (
          <a className="text-sm text-indigo-600 hover:underline" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">Open source</a>
        )}
      </div>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [sort, setSort] = useState('deadline');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let stale = false; // ignore a slow response that arrives after the toolbar changed again
    api(`/commissions?sort=${sort}${status ? `&status=${status}` : ''}`)
      .then((data) => { if (!stale) { setItems(data); setError(''); } })
      .catch((e) => { if (e.status === 401) onLogout(); else if (!stale) setError("Can't load commissions. Is the backend running?"); });
    return () => { stale = true; };
  }, [sort, status, reload, onLogout]);

  async function changeStatus(id, next) {
    try {
      await api(`/commissions/${id}/status`, { method: 'PATCH', body: { status: next } });
      setReload((n) => n + 1);
    } catch (e) {
      if (e.status === 401) onLogout(); else setError('Could not update the status.');
    }
  }

  async function changeDeadline(id, date) {
    try {
      await api(`/commissions/${id}/deadline`, { method: 'PATCH', body: { deadline: date ? endOfDay(date) : null } });
      setReload((n) => n + 1);
    } catch (e) {
      if (e.status === 401) onLogout(); else setError('Could not update the deadline.');
    }
  }

  const btn = (on) => `rounded-full px-3 py-1 text-sm ${on ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 shadow-sm'}`;
  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Commissions</h1>
        <button className="text-sm text-slate-500 hover:underline" onClick={onLogout}>Log out</button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex gap-2">
          <button className={btn(sort === 'deadline')} onClick={() => setSort('deadline')}>Nearest deadline</button>
          <button className={btn(sort === 'budget')} onClick={() => setSort('budget')}>Most expensive</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn(status === '')} onClick={() => setStatus('')}>All</button>
          {STATUSES.map((s) => <button key={s} className={btn(status === s)} onClick={() => setStatus(s)}>{LABEL[s]}</button>)}
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {items === null && !error && <p className="text-slate-500">Loading… (if the server was asleep this can take a minute or two)</p>}
      {items?.length === 0 && <p className="text-slate-500">Nothing here yet. Scan a commission with the extension.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items?.map((c) => <Card key={c.id} c={c} onStatus={changeStatus} onDeadline={changeDeadline} />)}
      </div>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('token'));
  const logout = () => { localStorage.removeItem('token'); setLoggedIn(false); };
  return loggedIn ? <Dashboard onLogout={logout} /> : <Login onLogin={() => setLoggedIn(true)} />;
}