import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import admin from 'firebase-admin';

const START_URL =
  process.env.START_URL ||
  'https://timeshealthplus.com/TH/livestream/KeshavKeshav21842';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TIMEOUT_MS = Number.parseInt(process.env.TIMEOUT_MS || '90000', 10);
const STATE_FILE = process.env.STATE_FILE || 'livestream-state.json';
const GITHUB_EVENT_NAME = process.env.GITHUB_EVENT_NAME || '';

// Firebase setup
let firestore = null;
let firebaseInitialized = false;

/**
 * Initialize Firebase Admin SDK
 * Reads service account key from environment variable or file
 */
async function initializeFirebase() {
  if (firebaseInitialized) return;

  try {
    if (existsSync('service-account-key.json')) {
      const serviceAccount = JSON.parse(
        await readFile('service-account-key.json', 'utf8')
      );

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      firestore = admin.firestore();
      firebaseInitialized = true;
      console.log('✓ Firebase initialized successfully');
    } else {
      console.error('✗ Error: service-account-key.json not found!');
      console.error('Please create service account key from Firebase Console');
      process.exit(1);
    }
  } catch (e) {
    console.error('✗ Firebase initialization failed:', e.message);
    process.exit(1);
  }
}

/**
 * Save YouTube URL to Firebase Firestore
 */
async function saveToFirebase(youtubeUrl, title = 'YouTube Livestream') {
  if (!firestore) {
    throw new Error('Firebase not initialized');
  }

  try {
    const dateStr = getIstDateYmd(); // Gets date in YYYY-MM-DD format

    const docRef = await firestore.collection('youtube_urls').add({
      url: youtubeUrl,
      title,
      notes: `Captured from livestream at ${istStamp()}`,
      timestamp: Date.now(),
      date: dateStr  // Add date field for day-wise organization
    });

    console.log('✓ Saved to Firebase:');
    console.log(`  URL: ${youtubeUrl}`);
    console.log(`  Date: ${dateStr}`);
    console.log(`  Document ID: ${docRef.id}`);

    return docRef.id;
  } catch (e) {
    console.error('✗ Failed to save to Firebase:', e.message);
    throw e;
  }
}

/**
 * Send message to Telegram (optional notification)
 */
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('ℹ Telegram not configured (skipping notification)');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = new URLSearchParams({
    chat_id: String(TELEGRAM_CHAT_ID),
    text,
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Telegram API ${res.status}: ${detail}`);
    }
    console.log('✓ Telegram notification sent');
  } catch (e) {
    console.error('⚠ Telegram notification failed:', e.message);
    // Don't fail the job if Telegram fails
  }
}

/** 05:00–09:59 IST (live window) */
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
  console.log('\n========================================');
  console.log('Livestream URL Detector with Firebase');
  console.log('========================================\n');

  // Initialize Firebase FIRST
  await initializeFirebase();

  if (!isWithinLivestreamWindowIst()) {
    if (GITHUB_EVENT_NAME === 'schedule') {
      console.log(`ℹ Outside 05:00–09:59 IST (${istStamp()}), exiting silently.`);
      return;
    }
    const msg = `No active livestream now (${istStamp()} IST)\nOutside 05:00–09:59 IST window, skipping.`;
    console.log(msg);
    await sendTelegram(msg);
    return;
  }

  const todayIst = getIstDateYmd();
  console.log(`Today's date (IST): ${todayIst}`);

  const state = await loadState();
  if (
    state?.successUrl &&
    state?.date === todayIst &&
    isYoutubeUrl(state.successUrl)
  ) {
    console.log(
      `✓ Already notified today (${todayIst}) with URL; skipping duplicate.`
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
    console.log(`\n📡 Navigating to: ${START_URL}`);
    await page.goto(START_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    lastUrl = page.url();
    console.log(`   Current URL: ${lastUrl}`);

    console.log(`\n⏳ Waiting for YouTube redirect (${TIMEOUT_MS}ms timeout)...`);
    await page.waitForURL((url) => isYoutubeHost(url.hostname), {
      timeout: TIMEOUT_MS,
    });
    finalUrl = page.url();
    lastUrl = finalUrl;
    console.log(`   ✓ Redirected to YouTube!`);
  } catch (e) {
    errMessage = e instanceof Error ? e.message : String(e);
    try {
      lastUrl = page.url();
    } catch {
      /* ignore */
    }
    try {
      await page.screenshot({ path: 'failure.png', fullPage: false });
      console.log('📸 Screenshot saved: failure.png');
    } catch {
      /* ignore */
    }
  } finally {
    await browser.close();
  }

  const stamp = istStamp();

  if (finalUrl && isYoutubeUrl(finalUrl)) {
    if (state?.successUrl === finalUrl && state?.date === todayIst) {
      console.log('ℹ Same URL as cached state; skipping.');
      return;
    }

    console.log(`\n✓ SUCCESS! YouTube URL found!`);
    console.log(`  URL: ${finalUrl}`);
    console.log(`  Time: ${stamp}`);

    // SAVE TO FIREBASE (primary action)
    try {
      await saveToFirebase(finalUrl, `Livestream - ${todayIst}`);
    } catch (e) {
      console.error('✗ CRITICAL: Failed to save to Firebase!');
      throw e;
    }

    // Send Telegram notification (optional, bonus)
    await sendTelegram(`✓ Live stream captured!\n${stamp}\n\n${finalUrl}`);

    // Save state
    await saveState({
      date: todayIst,
      successUrl: finalUrl,
      failureNotifiedDate: null,
    });

    console.log('\n✓ Operation complete!');
    return;
  }

  const failDay = state?.failureNotifiedDate;
  if (failDay === todayIst) {
    console.log(
      `ℹ Failure already reported for ${todayIst}; not sending again.`
    );
    process.exit(0);
  }

  console.log(`\n✗ ERROR: Could not resolve YouTube URL`);
  const lines = [
    `Could not resolve YouTube URL (${stamp} IST)`,
    errMessage || 'Unknown error',
    `Last URL: ${lastUrl}`,
  ];

  const errorMsg = lines.join('\n');
  console.error(errorMsg);

  await sendTelegram(errorMsg);
  await saveState({
    date: todayIst,
    successUrl: state?.successUrl ?? null,
    failureNotifiedDate: todayIst,
  });

  process.exit(1);
}

main().catch(async (e) => {
  console.error('\n✗ Job crashed:', e);
  const stamp = istStamp();
  const msg = `✗ Livestream job crashed (${stamp} IST)\n${e instanceof Error ? e.message : String(e)}`;

  try {
    await sendTelegram(msg);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
