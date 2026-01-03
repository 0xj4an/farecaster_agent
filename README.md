# 🤖 X Agent

An automated Twitter/X agent that posts curated messages and engages with community accounts. Built with Node.js, Twitter API v2, Twitter scraper, and node-cron.

## 📋 Features

- 🐦 **Automated Tweeting**: Posts random messages once every 24 hours at random times
- 🎲 **Smart Randomization**: Random hour selection with 24-hour minimum interval
- 💚 **Auto-Engagement**: Automatically likes and retweets posts from community accounts
- 🌐 **Hybrid Approach**: Free Twitter scraper for reading + Official API for posting/engaging
- 📝 **Curated Messages**: 320+ messages organized by time of day (morning/noon/evening)
- 🚫 **Anti-Repetition**: Tracks last 10 messages per time slot to avoid duplicates
- 📊 **Monthly Archiving**: Automatically archives tweet history and logs at month-end
- 🔐 **Secure Credentials**: Environment variable management with dotenv
- ⚡ **Instant Testing**: Auto-engagement runs immediately on startup

## 🚀 Installation

1. **Clone the repository**:
```bash
git clone git@github.com:0xj4an-personal/x_agent.git
cd x_agent
```

2. **Install dependencies**:
```bash
npm install
```

3. **Configure environment variables**:
Create a `.env` file in the root directory:
```env
# Twitter API Credentials (for posting, liking, retweeting)
TWITTER_APP_KEY=your_app_key
TWITTER_APP_SECRET=your_app_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret
TWITTER_USER_ID=your_user_id

# Scraper Credentials (secondary account for reading timelines)
SCRAPER_USERNAME=your_scraper_twitter_username
SCRAPER_PASSWORD=your_scraper_twitter_password
```

## ⚙️ Configuration

### Getting Twitter API Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a new Project and App
3. Obtain:
   - API Key (appKey)
   - API Secret (appSecret)
   - Access Token
   - Access Token Secret
   - User ID

### Scraper Account Setup

**Important**: Use a **secondary/burner Twitter account** for scraping.

1. Create a new Twitter account (or use an existing secondary account)
2. This account is used ONLY to read tweets (view timelines)
3. ⚠️ Risk: This account could get banned for scraping - DO NOT use your main account

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TWITTER_APP_KEY` | Your Twitter API Key (for posting) |
| `TWITTER_APP_SECRET` | Your Twitter API Secret |
| `TWITTER_ACCESS_TOKEN` | Your Twitter Access Token |
| `TWITTER_ACCESS_SECRET` | Your Twitter Access Token Secret |
| `TWITTER_USER_ID` | Your Twitter User ID |
| `SCRAPER_USERNAME` | Secondary account username (for reading) |
| `SCRAPER_PASSWORD` | Secondary account password |

## 📖 Usage

Start the agent:
```bash
npm start
```

The agent will:
- ✅ Run continuously 24/7
- ✅ Post once every 24 hours at a random time
- ✅ Auto-engage with community accounts every 4 hours
- ✅ Test auto-engagement immediately on startup
- ✅ Archive logs monthly
- ✅ Show detailed console logs of all actions

## 🕒 Scheduling

### Tweet Posting
- **Frequency**: Once every 24 hours
- **Timing**: Random hour (0-23)
- **Logic**: After 24h pass, enters random posting window with 1/8 chance per hour
- **Message Selection**: Based on hour (morning/noon/evening)

### Auto-Engagement
- **Frequency**: Every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
- **Startup**: Runs immediately on deployment
- **Community Accounts**:
  - @Celo_Col (Celo Colombia)
  - @refimed (ReFi Medellín)
  - @MedellinBlock (Medellín Blockchain)
- **Actions**: Likes + Retweets recent posts (max 5 per account)

### Monthly Archiving
- **Frequency**: Daily at 23:59
- **Trigger**: Last day of each month
- **Actions**: Archives `tweet_history.json` and `tweets.log` with timestamp

All times use `America/Bogota` timezone.

## 📁 Project Structure

```
x_agent/
├── agent.js              # Main bot logic with scheduling
├── getuserid.js          # Utility to fetch Twitter user IDs
├── messages.json         # 320+ curated messages (morning/noon/evening)
├── tweet_history.json    # Tracks last 10 posted messages per time slot
├── interactions.json     # Tracks liked/retweeted posts (last 100)
├── tweets.log           # Local log of all posted tweets
├── package.json         # Dependencies and scripts
├── .npmrc              # npm configuration for Railway
├── .env                # Environment variables (create this)
├── .gitignore          # Git ignore file
└── README.md           # This file
```

## 🛠️ Technologies Used

- **Node.js** (≥18.0.0): Runtime environment
- **twitter-api-v2**: Official Twitter/X API v2 client (posting, liking, retweeting)
- **@the-convocation/twitter-scraper**: Free Twitter scraper (reading timelines)
- **node-cron**: Task scheduling with timezone support
- **dotenv**: Environment variable management

## 💡 How It Works

### Hybrid Architecture

**Free Tier Solution:**
1. **Twitter API (Free)** → Post tweets + Like + Retweet
2. **Twitter Scraper (Free)** → Read timelines from other users

**Why?**
- Twitter API Free tier doesn't allow reading user timelines
- Scraper bypasses this limitation for FREE
- Official API used for all write operations (safe & reliable)

### Workflow

1. **Startup**:
   - Initialize Twitter API client
   - Initialize scraper
   - Load message database and history
   - Run auto-engagement immediately

2. **Every Hour**:
   - Check if 24h passed since last post
   - If yes, randomly decide to post (1/8 chance)
   - Select message based on current hour
   - Update history and log

3. **Every 4 Hours**:
   - Login scraper (if not already logged in)
   - Fetch recent tweets from community accounts
   - Like tweets not previously liked
   - Retweet tweets not previously retweeted
   - Save interaction history

4. **Daily at 23:59**:
   - Check if last day of month
   - Archive tweet history and logs
   - Reset for new month

## 📝 Customizing Messages

Messages are stored in `messages.json` organized by time of day:

```json
{
  "morning": [
    "gm ☀️",
    "Coffee + code = perfect morning ☕👨‍💻"
  ],
  "noon": [
    "Building in public 🚀",
    "Halfway through the day, let's ship it! 📦"
  ],
  "evening": [
    "Grateful for this community 💚",
    "Another day of building done ✨"
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

### Setup Steps:

1. **Connect Repository**:
   - Link your GitHub repository to Railway

2. **Set Environment Variables**:
   ```
   TWITTER_APP_KEY=xxx
   TWITTER_APP_SECRET=xxx
   TWITTER_ACCESS_TOKEN=xxx
   TWITTER_ACCESS_SECRET=xxx
   TWITTER_USER_ID=xxx
   SCRAPER_USERNAME=xxx
   SCRAPER_PASSWORD=xxx
   ```

3. **Deploy**:
   - Railway will automatically deploy
   - Bot runs 24/7 with automatic restarts
   - Logs available in Railway dashboard

### Expected Logs:

```
🤖 Agente activo. Publicará 1 vez cada 24 horas a una hora aleatoria...
🚀 Ejecutando auto-engagement inicial...
✅ Scraper autenticado correctamente
🔍 Obteniendo tweets de @Celo_Col con scraper...
✅ Encontrados 5 tweets de @Celo_Col
💛 Like a tweet de @Celo_Col: 123456789
🔁 Retweet de @Celo_Col: 123456789
```

## 🔒 Security Notes

- ⚠️ **Never commit `.env` file** (included in `.gitignore`)
- ⚠️ **Use secondary account for scraper** (risk of ban)
- ⚠️ **Keep API credentials secure**
- ⚠️ **Use Railway environment variables** for production

## 📊 Features Breakdown

| Feature | Status | Cost |
|---------|--------|------|
| Automated posting | ✅ Working | Free (API) |
| Auto-engagement | ✅ Working | Free (Scraper + API) |
| Timeline reading | ✅ Working | Free (Scraper) |
| Monthly archiving | ✅ Working | Free |
| Anti-repetition | ✅ Working | Free |
| Rate limit handling | ✅ Working | Free |

**Total Cost: $0/month** 🎉

## 📄 License

ISC

## 👤 Author

0xj4an

---

**Note**: This bot uses a hybrid approach to provide full functionality for FREE. The scraper is used only for reading public data, while the official API handles all posting and engagement actions.
