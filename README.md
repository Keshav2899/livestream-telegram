# Daily livestream → YouTube URL on Telegram

The workflow runs **several times each morning** (about **05:00–09:50 IST**) so a late GitHub runner still has a chance to hit your **05:00–09:59 IST** live window. It uses headless Chromium, waits for the redirect to YouTube, and sends the link on **Telegram**.

**Free-tier behavior**

- **Same-day dedupe:** after one successful Telegram with a URL, later runs that day **skip** Playwright and do not spam Telegram (state in `livestream-state.json`, cached per IST day).
- **Failures:** you get at most **one failure Telegram per IST day** (retries stay quiet).
- **Runs outside 05:00–09:59 IST:** if the event is **`schedule`**, the job **exits quietly** (no “outside window” Telegram) so delayed jobs do not spam you.

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

Manual runs **outside** 05:00–09:59 IST still get an “outside window” Telegram (so you understand why nothing ran).

### Scheduled run not firing

1. Repo **Settings → Actions → General**: Actions must be **enabled** (not “Disable actions”).
2. Confirm the workflow file is on the **default branch** (`main`).
3. GitHub can **delay** scheduled jobs; multiple crons per morning reduce missed windows.
4. Optional: **Schedule proof commit** workflow commits `.github/schedule-proof.txt` — if those commits appear, the scheduler is firing (separate from Playwright).

## Local run

Requires Node 20+ locally; GitHub Actions uses Node **24**.

```bash
npm install
npx playwright install chromium
set TELEGRAM_BOT_TOKEN=...
set TELEGRAM_CHAT_ID=...
npm run resolve
```

(On PowerShell use `$env:TELEGRAM_BOT_TOKEN="..."`.)

## Notes

- Schedule times in the workflow are **UTC** (`cron`); comments show approximate **IST** (UTC+5:30).
- If the site blocks datacenter IPs, the job may fail; try a VPS with the same script.
- On failure, a `failure.png` screenshot is uploaded as a workflow artifact when possible.
