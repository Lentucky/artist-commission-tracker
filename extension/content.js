// Heuristic commission scanner. Pure functions first (tested in Node); browser glue at the bottom.
const THRESHOLD = 70; // keyword (40) + at least one of price / deadline (30 each)

// Gatekeeper: no commission vocabulary, no score. Tune this list as real pages show misses.
const KEYWORDS = /\b(?:commissions?|commissioned|comms?|ych|quote|invoice|sketch|headshot|chibi|full ?body)\b/i;

// shortcut: USD only ($, USD, dollars), first price in the text wins; add other currencies when an artist needs them
const PRICE = /(?:\$|\busd\s*)\s*(\d[\d,]*(?:\.\d{1,2})?)|\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:usd|dollars?)\b/i;
const PRICE_ALL = new RegExp(PRICE.source, 'gi');
// "a total of 112 <anything>" beats every other number in the text
const TOTAL = /\btotal\b[^\d$\n]{0,10}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
// a date only counts when a deadline cue precedes it, so "posted Nov 3" is ignored
const CUE = String.raw`\b(?:due|deadline|by|until|before)\b[^.\n]{0,15}?`;
const D_ISO = new RegExp(CUE + String.raw`(\d{4})-(\d{2})-(\d{2})\b`, 'i');
const D_MD = new RegExp(CUE + String.raw`(${MON})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4})\b)?`, 'i');
const D_DM = new RegExp(CUE + String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+(${MON})\b(?:,?\s+(\d{4})\b)?`, 'i');
const D_REL = /\b(?:in|within)\s+(\d{1,2})\s+(day|week)s?\b/i;

// total cue wins; otherwise the largest price (a chat usually mentions tips and add-ons that are smaller than the quote)
function parsePrice(text) {
  const t = text.match(TOTAL);
  const raw = t ? [t[1]] : [...text.matchAll(PRICE_ALL)].map((m) => m[1] ?? m[2]);
  const values = raw.map((n) => parseFloat(n.replace(/,/g, ''))).filter((v) => v >= 0 && v < 1e10); // backend holds 10 integer digits
  return values.length ? Math.max(...values) : null;
}

// End of the named day in the user's local time. Returns null for Feb 31 and for past dates.
function mkDate(y, mo, d, now, rollYear) {
  let t = new Date(y, mo, d, 23, 59);
  if (rollYear && t < now) t = new Date(y + 1, mo, d, 23, 59);
  return t.getMonth() === mo && t.getDate() === d && t > now ? t : null;
}

function fromName(mon, day, year, now) {
  return mkDate(year ? +year : now.getFullYear(), MONTHS.indexOf(mon.slice(0, 3).toLowerCase()), day, now, !year);
}

function parseDeadline(text, now) {
  let m;
  if ((m = text.match(D_ISO))) return mkDate(+m[1], +m[2] - 1, +m[3], now, false);
  if ((m = text.match(D_MD))) return fromName(m[1], +m[2], m[3], now);
  if ((m = text.match(D_DM))) return fromName(m[2], +m[1], m[3], now);
  if ((m = text.match(D_REL))) return new Date(now.getTime() + m[1] * (m[2].toLowerCase() === 'week' ? 7 : 1) * 864e5);
  return null;
}

function analyze(text, now = new Date()) {
  if (!KEYWORDS.test(text)) return { confidence: 0, budget: null, deadline: null };
  const budget = parsePrice(text);
  const deadline = parseDeadline(text, now);
  return {
    confidence: 40 + (budget !== null ? 30 : 0) + (deadline ? 30 : 0),
    budget,
    deadline: deadline && deadline.toISOString(),
  };
}

function platformOf(host) {
  if (/(^|\.)vgen\.co$/.test(host)) return 'VGEN';
  if (/(^|\.)(x|twitter)\.com$/.test(host)) return 'TWITTER';
  if (/(^|\.)discord\.com$/.test(host)) return 'DISCORD';
  return 'OTHER';
}

// short, stable fingerprint of a text (not cryptographic)
function fingerprint(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Discord DMs and channels reuse one URL for every message, so a selected message gets its own key.
// The same selection scanned twice still maps to the same key (still a duplicate); anything else is a new commission.
function sourceKeyFor(platform, url, selected) {
  return platform === 'DISCORD' && selected ? `${url.split('#')[0]}#c=${fingerprint(selected)}` : url;
}

// --- browser glue ---
function scan() {
  const selected = window.getSelection().toString().trim();
  // no selection: read Discord's chat panel if the selector still matches (unverified), else the page body
  const chat = document.querySelector('[data-list-id="chat-messages"]');
  const text = selected || (chat ? chat.innerText.slice(-8000) : (document.body?.innerText ?? '').slice(0, 5000));
  const title = (selected ? selected.split('\n')[0] : document.title).trim().slice(0, 120) || 'Untitled commission';
  const result = analyze(text);
  const platform = platformOf(location.hostname);
  return {
    ...result,
    confident: result.confidence >= THRESHOLD,
    title,
    platform,
    sourceUrl: sourceKeyFor(platform, location.href, selected),
    // shown in the popup when a scan is not confident, so we can see what was actually read
    scanned: { from: selected ? 'selection' : chat ? 'chat panel' : 'page', chars: text.length, preview: text.slice(0, 80) },
  };
}

function onMessage(msg, _sender, reply, run = scan) {
  if (msg.type !== 'scan') return;
  try {
    reply(run());
  } catch {
    reply({ error: 'scan-failed' }); // a broken page must never leave the popup waiting forever
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(onMessage);
}

if (typeof module !== 'undefined') module.exports = { analyze, platformOf, sourceKeyFor, onMessage, THRESHOLD };