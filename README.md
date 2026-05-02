# Daily livestream → YouTube URL on Telegram

At **07:59 IST** each day, a GitHub Actions workflow opens the Times Health Plus livestream page in headless Chromium, waits for the JavaScript redirect to YouTube, and sends the final URL to you on **Telegram**.

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

### Scheduled run (7:59 IST) not firing

1. Repo **Settings → Actions → General**: Actions must be **enabled** (not “Disable actions”).
2. **Settings → Actions → General → Workflow permissions**: the **Schedule proof commit** workflow must be able to **push** commits. Use **Read and write permissions** (or fine-grained token settings that allow `contents: write`). If pushes are blocked, the proof workflow will fail on `git push`.
3. Confirm the workflow files exist on the **default branch** (`main`).
4. GitHub can **delay or drop** scheduled runs during high load.
5. **Schedule proof commit (7:59 IST)** runs at the same wall time and updates `.github/schedule-proof.txt`. Check **Commits** on `main` for `chore: schedule proof ...` — if those commits appear daily, the scheduler is working.

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

- Scheduled workflows use **UTC**; `29 2 * * *` is **07:59 IST** (02:29 UTC + 5:30).
- If the site blocks datacenter IPs, the job may fail; try a VPS with the same script.
- On failure, a `failure.png` screenshot is uploaded as a workflow artifact when possible.
