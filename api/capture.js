// Vercel serverless function to capture daily livestream URL
export default async function handler(req, res) {
  try {
    console.log('📺 Starting livestream URL capture...');

    // Import and run the capture script
    const { execSync } = require('child_process');

    const result = execSync('node resolve-and-notify-v2.mjs', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 120000,
    });

    console.log('✅ Capture completed:', result);

    res.status(200).json({
      success: true,
      message: 'Livestream URL captured successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error:', error.message);

    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
