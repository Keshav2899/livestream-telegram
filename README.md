# Daily livestream → YouTube URL on Telegram

At **07:00 IST** each day, a GitHub Actions workflow opens the Times Health Plus livestream page in headless Chromium, waits for the JavaScript redirect to YouTube, and sends the final URL to you on **Telegram**.

## Setup

### 1. Telegram bot and chat ID

1. Open [@BotFather](https://t.me/BotFather) in Telegram, run `/newbot`, and copy the **HTTP API token**.
2. Start a chat with your bot and send `/start`.
3. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser (replace `<YOUR_TOKEN>`). Find `"chat":{"id":123456789,...}` — that number is your **chat ID** (for groups it may be negative).

### 2. GitHub repository secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|--------|
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `TELEGRAM_CHAT_ID` | Your numeric chat ID |

### 3. Enable Actions

Push this repo to GitHub. Confirm **Actions** are allowed and the default branch runs workflows.

### Manual test

In GitHub: **Actions → Daily livestream URL to Telegram → Run workflow**.

### Scheduled run (7:00 IST) not firing

1. Repo **Settings → Actions → General**: Actions must be **enabled** (not “Disable actions”).
2. **Settings → Actions → General → Workflow permissions**: choose **Read and write permissions** *or* keep read-only; this repo only needs **read** for `checkout`, but restrictive org defaults can sometimes interfere—if schedules never appear, try read/write once.
3. Confirm the workflow files exist on the **default branch** (`main`).
4. GitHub can **delay or drop** scheduled runs during high load; the cron is set to **01:30 UTC** (07:00 IST), not on the top of the hour, to reduce collisions.
5. A tiny workflow **Schedule heartbeat (GitHub cron check)** runs daily at **06:52 IST** (`01:22 UTC`). Open **Actions** and verify you see a **`schedule`** run for it.  
   - If the heartbeat never shows `schedule` runs, the problem is GitHub-side scheduling/settings (not Playwright). You can delete `schedule-heartbeat.yml` after debugging.

## Local run

Requires Node 20+.

```bash
npm install
npx playwright install chromium
set TELEGRAM_BOT_TOKEN=...
set TELEGRAM_CHAT_ID=...
npm run resolve
```

(On PowerShell use `$env:TELEGRAM_BOT_TOKEN="..."`.)

## Notes

- Scheduled workflows use **UTC**; `30 1 * * *` is **07:00 IST**.
- If the site blocks datacenter IPs, the job may fail; try a VPS with the same script.
- On failure, a `failure.png` screenshot is uploaded as a workflow artifact when possible.
