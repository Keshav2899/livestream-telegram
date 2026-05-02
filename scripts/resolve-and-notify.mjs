import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const START_URL =
  process.env.START_URL ||
  'https://timeshealthplus.com/TH/livestream/KeshavKeshav21842';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TIMEOUT_MS = Number.parseInt(process.env.TIMEOUT_MS || '90000', 10);
const STATE_FILE = process.env.STATE_FILE || 'livestream-state.json';
const GITHUB_EVENT_NAME = process.env.GITHUB_EVENT_NAME || '';

/** 05:00–09:59 IST (live window you asked for) */
const WINDOW_START_MIN = 5 * 60;
const WINDOW_END_MIN = 9 * 60 + 59;

function isYoutubeHost(hostname) {
  const h = hostname.replace(/^www\./, '').toLowerCase();
  return h === 'youtube.com' || h === 'youtu.be' || h === 'm.youtube.com';
}

function isYoutubeUrl(urlString) {
  try {
    return isYoutubeHost(new URL(urlString).hostname);
  } catch {
    return false;
  }
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = new URLSearchParams({
    chat_id: String(TELEGRAM_CHAT_ID),
    text,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Telegram API ${res.status}: ${detail}`);
  }
}

function istStamp() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getIstDateYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function getIstMinutesNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hh * 60 + mm;
}

function isWithinLivestreamWindowIst() {
  const now = getIstMinutesNow();
  return now >= WINDOW_START_MIN && now <= WINDOW_END_MIN;
}

async function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveState(obj) {
  await writeFile(STATE_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID');
    process.exit(1);
  }

  const todayIst = getIstDateYmd();

  if (!isWithinLivestreamWindowIst()) {
    // Scheduled runs that GitHub starts late would spam "outside window" — stay quiet.
    if (GITHUB_EVENT_NAME === 'schedule') {
      console.log(
        `Outside 05:00–09:59 IST (${istStamp()}), exit 0 (no Telegram for schedule).`
      );
      return;
    }
    const msg = `No active livestream now (${istStamp()} IST)\nOutside 05:00–09:59 IST window, skipping.`;
    await sendTelegram(msg);
    console.log(msg);
    return;
  }

  const state = await loadState();
  if (
    state?.successUrl &&
    state?.date === todayIst &&
    isYoutubeUrl(state.successUrl)
  ) {
    console.log(
      `Already notified today (${todayIst}) with URL; skipping duplicate Telegram.`
    );
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  let finalUrl = null;
  let lastUrl = START_URL;
  let errMessage = null;

  try {
    await page.goto(START_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    lastUrl = page.url();

    await page.waitForURL((url) => isYoutubeHost(url.hostname), {
      timeout: TIMEOUT_MS,
    });
    finalUrl = page.url();
    lastUrl = finalUrl;
  } catch (e) {
    errMessage = e instanceof Error ? e.message : String(e);
    try {
      lastUrl = page.url();
    } catch {
      /* ignore */
    }
    try {
      await page.screenshot({ path: 'failure.png', fullPage: false });
    } catch {
      /* ignore */
    }
  } finally {
    await browser.close();
  }

  const stamp = istStamp();

  if (finalUrl && isYoutubeUrl(finalUrl)) {
    if (state?.successUrl === finalUrl && state?.date === todayIst) {
      console.log('Same URL as cached state; skip Telegram.');
      return;
    }
    await sendTelegram(`Live stream (${stamp} IST)\n${finalUrl}`);
    console.log('Notified Telegram:', finalUrl);
    await saveState({
      date: todayIst,
      successUrl: finalUrl,
      failureNotifiedDate: null,
    });
    return;
  }

  const failDay = state?.failureNotifiedDate;
  if (failDay === todayIst) {
    console.log(
      `Failure already reported for ${todayIst}; not sending again (see earlier Telegram).`
    );
    process.exit(0);
  }

  const lines = [
    `Could not resolve YouTube URL (${stamp} IST)`,
    errMessage || 'Unknown error',
    `Last URL: ${lastUrl}`,
  ];
  await sendTelegram(lines.join('\n'));
  console.error(lines.join('\n'));
  await saveState({
    date: todayIst,
    successUrl: state?.successUrl ?? null,
    failureNotifiedDate: todayIst,
  });
  process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      await sendTelegram(
        `Livestream job crashed (${istStamp()} IST)\n${e instanceof Error ? e.message : String(e)}`
      );
    } catch {
      /* ignore */
    }
  }
  process.exit(1);
});
