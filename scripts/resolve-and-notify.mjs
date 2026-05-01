import { chromium } from 'playwright';

const START_URL =
  process.env.START_URL ||
  'https://timeshealthplus.com/TH/livestream/KeshavKeshav21842';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TIMEOUT_MS = Number.parseInt(process.env.TIMEOUT_MS || '90000', 10);

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

async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID');
    process.exit(1);
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

    await page.waitForURL(
      (url) => isYoutubeHost(url.hostname),
      { timeout: TIMEOUT_MS }
    );
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
    await sendTelegram(`Live stream (${stamp} IST)\n${finalUrl}`);
    console.log('Notified Telegram:', finalUrl);
    return;
  }

  const lines = [
    `Could not resolve YouTube URL (${stamp} IST)`,
    errMessage || 'Unknown error',
    `Last URL: ${lastUrl}`,
  ];
  await sendTelegram(lines.join('\n'));
  console.error(lines.join('\n'));
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
