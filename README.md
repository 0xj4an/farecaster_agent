# 🟣 Farcaster Agent Bot

Agente automatizado para Farcaster/Warpcast enfocado en la comunidad ReFi y Celo en Colombia.

## 📋 Features

- 🟣 **Automated Casting**: Posts random messages once every 24 hours at random times
- 🎲 **Smart Randomization**: Random hour selection with 24-hour minimum interval
- 💚 **Auto-Engagement**: Automatically likes and recasts from community accounts
- 🌐 **Simple API**: Neynar API with generous free tier (no scraping needed!)
- 📝 **Curated Messages**: 320+ messages organized by time of day (morning/noon/evening)
- 🚫 **Anti-Repetition**: Tracks last 10 messages per time slot to avoid duplicates
- 📊 **Monthly Archiving**: Automatically archives cast history and logs at month-end
- 🔐 **Secure Credentials**: Environment variable management
- ⚡ **Instant Testing**: Auto-engagement runs immediately on startup

## 🚀 Installation

1. **Install dependencies**:

```bash
npm install
```

1. **Get Neynar credentials**:

   - Go to [https://neynar.com/](https://neynar.com/)
   - Create account and get your `NEYNAR_API_KEY`
   - Set your `FID` (used as Neynar `signer_uuid` in this bot)

1. **Configure environment variables**:

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Or create a `.env` file manually:

```env
# 🟣 Farcaster/Neynar Configuration (REQUIRED)
NEYNAR_API_KEY=your_neynar_api_key_here
SIGNER_UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
FID=your_numeric_fid_here

# ⚙️ Engagement Tuning (OPTIONAL - defaults shown)
LOOKBACK_DAYS=30
MAX_ACTIONS_PER_RUN=5
MAX_CASTS_REVIEW_PER_ACCOUNT=0
CASTS_PAGE_SIZE=50
ACTION_DELAY_MS=3000

# 🧠 Daily Insights (OPTIONAL)
INSIGHTS_ENABLED=0
INSIGHTS_DAYS=1
INSIGHTS_STORE_DAYS=30
INSIGHTS_POST_CRON=30 8 * * *

# 🚀 Startup Post (OPTIONAL)
STARTUP_TEST_POST=1
FORCE_STARTUP_TEST_POST=0
```

1. **Update followed accounts with real FIDs**:

Edit [agent.js:211-215](agent.js) to add the Farcaster IDs (FIDs) of accounts you want to engage with. Find FIDs by searching usernames on Warpcast or using Neynar's user search API.

## ⚙️ Configuration

### Getting Neynar API Credentials

1. Go to [Neynar Dashboard](https://neynar.com/)
2. Create an account or sign in
3. Create a new app to get your `NEYNAR_API_KEY`
4. Your FID is your Farcaster user ID - find it on your Warpcast profile

### Finding FIDs

To find the FID of Farcaster users you want to follow:

**Option 1 - Neynar API**:

```bash
curl "https://api.neynar.com/v2/farcaster/user/search?q=username" \
  -H "api_key: YOUR_API_KEY"
```

**Option 2 - Warpcast Profile**:
Visit their Warpcast profile and check the URL or use tools like [fid.info](https://fid.info)

### Environment Variables

#### Required Variables

| Variable | Description |
| --- | --- |
| `NEYNAR_API_KEY` | Your Neynar API Key from dashboard |
| `SIGNER_UUID` | Required for writes (casts/likes/recasts). Must be a UUID signer from Neynar (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |
| `FID` | Your Farcaster numeric FID (optional; used for logging) |

#### Engagement Tuning (Optional)

| Variable | Default | Description |
| --- | --- | --- |
| `LOOKBACK_DAYS` | `30` | Number of days to look back for engagement |
| `MAX_ACTIONS_PER_RUN` | `5` | Maximum likes+recasts per account per execution (5 × 3 runs = 15/day per account) |
| `MAX_CASTS_REVIEW_PER_ACCOUNT` | `0` | Maximum casts to review per account (0 = unlimited, reviews all available) |
| `CASTS_PAGE_SIZE` | `50` | Number of casts to fetch per API page |
| `ACTION_DELAY_MS` | `3000` | Delay between actions in milliseconds (3 seconds) |

#### Daily Insights (Optional)

| Variable | Default | Description |
| --- | --- | --- |
| `INSIGHTS_ENABLED` | `0` | If `1`, posts a daily "topics pulse" based on followed accounts |
| `INSIGHTS_DAYS` | `1` | How many days of casts to summarize into the daily insights cast |
| `INSIGHTS_STORE_DAYS` | `30` | How many days to keep in the local insights cache |
| `INSIGHTS_POST_CRON` | `30 8 * * *` | Cron string for the insights post time (8:30 AM Bogota timezone) |

#### Startup Options (Optional)

| Variable | Default | Description |
| --- | --- | --- |
| `STARTUP_TEST_POST` | `1` | If `1`, posts one cast on startup (respects 24h gate) |
| `FORCE_STARTUP_TEST_POST` | `0` | If `1`, forces a startup cast even if last cast was <24h ago |

## 📖 Usage

Start the agent:

```bash
npm start
```

The agent will:

- ✅ Run continuously 24/7
- ✅ Post one cast every 24 hours at a random time
- ✅ Auto-engage with community accounts 3 times daily (9 AM, 3 PM, 9 PM)
- ✅ Test auto-engagement immediately on startup
- ✅ Archive logs monthly
- ✅ Show detailed console logs of all actions

## 🕒 Scheduling

### Cast Posting

- **Frequency**: Once every 24 hours
- **Timing**: Random hour (0-23)
- **Logic**: After 24h pass, enters random posting window with 1/8 chance per hour
- **Message Selection**: Based on hour (morning/noon/evening)

### Auto-Engagement

- **Frequency**: 3 times daily
  - 🌅 9:00 AM (Bogotá time)
  - ☀️ 3:00 PM (Bogotá time)
  - 🌙 9:00 PM (Bogotá time)
- **Startup**: Runs immediately on deployment
- **Accounts**: All followed accounts are checked in each execution
- **Actions per execution**: Max 5 likes+recasts per account
- **Daily limit**: Max 15 actions per account per day (5 × 3 executions)
- **Total daily**: Max 45 actions across all 3 accounts (15 × 3 accounts)
- **Lookback window**: Reviews casts from the last 30 days
- **Smart filtering**: Only engages with casts not previously liked/recasted

### Monthly Archiving

- **Frequency**: Daily at 23:59
- **Trigger**: Last day of each month
- **Actions**: Archives `cast_history.json` and `casts.log` with timestamp

All times use `America/Bogota` timezone.

## 📁 Project Structure

```text
fc_agent/
├── agent.js              # Main bot logic with scheduling
├── messages.json         # 320+ curated messages (morning/noon/evening)
├── cast_history.json     # Tracks last 10 posted messages per time slot
├── interactions.json     # Tracks liked/recasted posts (last 100)
├── insights.json         # Cached insights data from followed accounts
├── state.json            # Bot state (last post time, last insights post)
├── casts.log             # Local log of all posted casts
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables (create from .env.example)
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore file
└── README.md             # This file
```

## 🛠️ Technologies Used

- **Node.js** (≥18.0.0): Runtime environment
- **axios**: HTTP client for Neynar API calls
- **node-cron**: Task scheduling with timezone support
- **Neynar API**: Farcaster/Warpcast API provider (free tier)

## 💡 How It Works

### Architecture

**Simple & Free:**

1. **Neynar API** → All operations (read, post, like, recast)
2. **No scraping needed** → Native API support for everything
3. **Generous free tier** → No aggressive rate limits

### Workflow

1. **Startup**:
   - Initialize Neynar API client with credentials
   - Load message database and history
   - Run auto-engagement immediately (test mode)

2. **Every Hour**:
   - Check if 24h passed since last cast
   - If yes, randomly decide to post (1/8 chance)
   - Select message based on current hour
   - Publish cast via Neynar API
   - Update history and log

3. **3 Times Daily (9 AM, 3 PM, 9 PM)**:
   - Select random account from followed list
   - Fetch recent casts via Neynar API
   - Like casts not previously liked
   - Recast casts not previously recasted
   - Save interaction history

4. **Daily at 23:59**:
   - Check if last day of month
   - Archive cast history and logs
   - Reset for new month

## 📝 Customizing Messages

Messages are stored in `messages.json` organized by time of day:

```json
{
  "morning": [
    "gm ☀️ build, repeat, love #web3",
    "Buenos días Medellín 🌞 #build #ReFi"
  ],
  "noon": [
    "Seguimos construyendo desde Medellín 🇨🇴✨",
    "Midday check-in ☕ still shipping ideas 🌱"
  ],
  "evening": [
    "Day done 🌙 another block built 💚",
    "Cerrando el día con gratitud y código 💻💛"
  ]
}
```

**Time Slots:**

- 🌅 **Morning** (5:00 - 11:59): Morning greetings, coffee, motivation
- ☀️ **Noon** (12:00 - 17:59): Building, progress, midday energy
- 🌙 **Evening** (18:00 - 4:59): Gratitude, reflection, community

**Categories:**

- ReFi & Celo ecosystem
- Web3 building & shipping
- Community & LatAm focus
- Developer motivation
- Medellín tech scene

## 🚂 Railway Deployment

This project is designed to run continuously on [Railway](https://railway.app/):

### Setup Steps

1. **Connect Repository**:
   - Link your GitHub repository to Railway

1. **Set Environment Variables**:

   In Railway dashboard, add these **required** variables:

   ```env
   NEYNAR_API_KEY=your_neynar_api_key
   SIGNER_UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   FID=your_numeric_fid
   ```

   **Optional** variables (use defaults if not set):

   ```env
   MAX_ACTIONS_PER_RUN=5
   MAX_CASTS_REVIEW_PER_ACCOUNT=0
   LOOKBACK_DAYS=30
   INSIGHTS_ENABLED=1
   ```

1. **Deploy**:
   - Railway will automatically deploy
   - Bot runs 24/7 with automatic restarts
   - Logs available in Railway dashboard

### Expected Logs

```text
🤖 Agente de Farcaster activo.
📅 Casts: 1 vez cada 24 horas a una hora aleatoria
💚 Auto-engagement: 3 veces al día (9 AM, 3 PM, 9 PM) con cuentas rotativas
🗓️ Archivado: Fin de cada mes a las 23:59 (hora Bogotá)
🟣 Usando Neynar API para Warpcast/Farcaster
🚀 Ejecutando auto-engagement inicial con @username...
🔍 Obteniendo casts del FID 12345 (@username)...
✅ Encontrados 5 casts de @username
💛 Like a cast de @username: abc123...
🔁 Recast de @username: def456...
```

## 🔒 Security Notes

- ⚠️ **Never commit `.env` file** (included in `.gitignore`)
- ⚠️ **Keep API credentials secure**
- ⚠️ **Use Railway environment variables** for production
- ✅ **No scraping = no risk of account bans**

## 📊 Features Breakdown

| Feature | Status | Cost |
| --- | --- | --- |
| Automated casting | ✅ Working | Free (Neynar API) |
| Auto-engagement | ✅ Working | Free (Neynar API) |
| Feed reading | ✅ Working | Free (Neynar API) |
| Monthly archiving | ✅ Working | Free |
| Anti-repetition | ✅ Working | Free |
| Rate limit handling | ✅ Working | Free |

**Total Cost: $0/month** 🎉

## 🌐 API Documentation

- [Neynar API Docs](https://docs.neynar.com/)
- [Farcaster Protocol](https://docs.farcaster.xyz/)
- [Warpcast](https://warpcast.com/)

## 📄 License

ISC

## 👤 Author

0xj4an

---

**Built for the ReFi & Celo community in Colombia** 🇨🇴 💚
