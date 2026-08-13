// Vercel serverless function to capture daily livestream URL
import { writeFileSync, existsSync } from 'fs';
import { chromium } from 'playwright';
import admin from 'firebase-admin';
import { execSync } from 'child_process';

export default async function handler(req, res) {
  const tempDir = '/tmp';
  const serviceAccountPath = `${tempDir}/service-account-key.json`;

  try {
    console.log('📺 Starting livestream URL capture...');

    // Write Firebase service account from environment variable
    let firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!firebaseServiceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable not set');
    }

    // Remove BOM if present
    firebaseServiceAccount = firebaseServiceAccount.replace(/^﻿/, '').trim();

    writeFileSync(serviceAccountPath, firebaseServiceAccount);
    const serviceAccount = JSON.parse(firebaseServiceAccount);

    // Initialize Firebase
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    const firestore = admin.firestore();
    const START_URL = process.env.START_URL || 'https://timeshealthplus.com/TH/livestream/KeshavKeshav21842';

    console.log('✓ Firebase initialized');
    console.log('📺 Launching browser to capture URL from:', START_URL);
    console.log('Current directory:', process.cwd());

    // Ensure Playwright chromium is installed (in /tmp or /home for Vercel)
    const browserInstallCmd = 'npx playwright install --with-deps chromium';
    try {
      console.log('Installing Playwright chromium...');
      execSync(browserInstallCmd, {
        timeout: 120000,
        env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 'false' },
      });
      console.log('✓ Playwright chromium installed');
    } catch (e) {
      console.log('⚠ Install warning (may still work):', e.message);
    }

    // Launch browser with proper configuration for Vercel
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage', // Important for serverless
        '--single-process', // Help with Vercel limitations
      ],
    });
    const page = await browser.newPage();

    let youtubeUrl = null;
    page.on('response', async (response) => {
      if (response.url().includes('youtube.com')) {
        youtubeUrl = response.url();
        console.log('✓ Captured YouTube URL:', youtubeUrl);
      }
    });

    page.on('framenavigated', (frame) => {
      const url = frame.url();
      if (url.includes('youtube.com') && !youtubeUrl) {
        youtubeUrl = url;
        console.log('✓ Captured YouTube URL from navigation:', youtubeUrl);
      }
    });

    try {
      await page.goto(START_URL, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      console.log('ℹ Page load timeout or error (may still have URL):', e.message);
    }

    await browser.close();

    if (youtubeUrl) {
      // Save to Firebase
      const dateStr = new Date().toISOString().split('T')[0];
      await firestore.collection('youtube_urls').add({
        url: youtubeUrl,
        title: 'YouTube Livestream',
        timestamp: Date.now(),
        date: dateStr,
      });

      console.log('✓ Saved to Firebase');

      // Send Telegram notification if configured
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: `✓ Livestream URL captured:\n${youtubeUrl}`,
          }),
        });
        console.log('✓ Telegram notification sent');
      }

      res.status(200).json({
        success: true,
        message: 'Livestream URL captured successfully',
        url: youtubeUrl,
        timestamp: new Date().toISOString(),
      });
    } else {
      throw new Error('Failed to capture YouTube URL');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);

    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
