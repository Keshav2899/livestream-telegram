// Vercel serverless function to capture daily livestream URL
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

export default async function handler(req, res) {
  const tempDir = '/tmp';
  const serviceAccountPath = `${tempDir}/service-account-key.json`;

  try {
    console.log('📺 Starting livestream URL capture...');

    // Debug: Log all env vars
    const envKeys = Object.keys(process.env).filter(k => k.includes('FIREBASE') || k.includes('START') || k.includes('TELEGRAM'));
    console.log('Available env vars:', envKeys);
    console.log('FIREBASE_SERVICE_ACCOUNT exists:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('START_URL exists:', !!process.env.START_URL);

    // Write Firebase service account from environment variable
    const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!firebaseServiceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable not set. Available vars: ' + envKeys.join(', '));
    }

    writeFileSync(serviceAccountPath, firebaseServiceAccount);
    console.log('✓ Firebase credentials written to temp file');

    // Run the capture script with environment variable for temp path
    const result = execSync('node scripts/resolve-and-notify.mjs', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        STATE_FILE: `${tempDir}/livestream-state.json`,
      },
    });

    console.log('✅ Capture completed:', result);

    res.status(200).json({
      success: true,
      message: 'Livestream URL captured successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('❌ Full Error:', error);
    console.error('❌ Stderr:', error.stderr?.toString());
    console.error('❌ Stdout:', error.stdout?.toString());

    res.status(500).json({
      success: false,
      error: error.message,
      stderr: error.stderr?.toString(),
      stdout: error.stdout?.toString(),
      timestamp: new Date().toISOString(),
    });
  }
}
