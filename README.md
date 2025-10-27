# 🤖 X Agent

An automated Twitter/X agent that posts random motivational and community-focused messages throughout the day. Built with Node.js, Twitter API v2, and node-cron.

## 📋 Features

- 🐦 **Automated Tweeting**: Posts random messages to X/Twitter automatically
- ⏰ **Multiple Daily Posts**: Posts at 9:00 AM, 1:00 PM, and 7:00 PM (America/Bogota timezone)
- 🎲 **Random Messages**: Selects from a curated collection of 100+ messages about ReFi, Celo, building, and community
- 📅 **Date Stamping**: Each post includes the current date
- 📝 **External Message Config**: Messages stored in `messages.json` for easy customization
- 🔐 **Environment Variables**: Secure credential management with dotenv

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
TWITTER_APP_KEY=your_app_key
TWITTER_APP_SECRET=your_app_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret
```

## ⚙️ Configuration

### Getting Twitter API Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a new app and obtain:
   - API Key (appKey)
   - API Secret (appSecret)
   - Access Token
   - Access Token Secret

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TWITTER_APP_KEY` | Your Twitter API Key |
| `TWITTER_APP_SECRET` | Your Twitter API Secret |
| `TWITTER_ACCESS_TOKEN` | Your Twitter Access Token |
| `TWITTER_ACCESS_SECRET` | Your Twitter Access Token Secret |

## 📖 Usage

Start the agent:
```bash
npm start
```

The agent will:
- Run continuously and post at scheduled times (9:00 AM, 1:00 PM, 7:00 PM daily)
- Display a confirmation message when a tweet is posted
- Show the tweet URL in the console
- Keep running 24/7, posting automatically at the scheduled times

### Testing

To test immediately, uncomment line 64 in `agent.js`:
```javascript
postTweet();
```

Then run:
```bash
npm start
```

## 📁 Project Structure

```
x_agent/
├── agent.js          # Main bot logic with scheduling
├── messages.json     # Curated collection of 100+ messages
├── package.json      # Dependencies and scripts
├── .env             # Environment variables (create this)
├── .gitignore       # Git ignore file
└── README.md        # This file
```

## 🛠️ Technologies Used

- **Node.js**: Runtime environment
- **twitter-api-v2**: Twitter/X API client
- **node-cron**: Task scheduling
- **dotenv**: Environment variable management

## 📝 Customizing Messages

The messages are now stored in `messages.json` for easy management. Edit this file to customize your random messages:

```json
// messages.json
export const messages = [
  "gm ☀️",
  "Shipping something cool today 🚀",
  "Your custom message here 💚",
  // Add more messages here
];
```

The messages are organized by categories:
- 🌅 **GM / Good Morning**: Greeting messages
- 🚀 **Shipping / Building**: Development and coding vibes  
- 🌱 **ReFi / Celo**: Regenerative finance and impact messages
- 💻 **Builders / Tech**: Focus and productivity messages
- ❤️ **Community / LatAm**: Community and regional content
- 👀 **Misc / Humor**: General fun and relaxed messages

## 🕒 Scheduling

The bot posts **3 times per day** at:
- 🌅 **9:00 AM** - Morning greetings and energy
- 🌞 **1:00 PM** - Midday motivation
- 🌆 **7:00 PM** - Evening community vibes

All times are in `America/Bogota` timezone. The schedules are configured in `agent.js`:

```javascript
// 9:00 AM
cron.schedule('0 9 * * *', () => { /* ... */ }, { timezone: 'America/Bogota' });

// 1:00 PM  
cron.schedule('0 13 * * *', () => { /* ... */ }, { timezone: 'America/Bogota' });

// 7:00 PM
cron.schedule('0 19 * * *', () => { /* ... */ }, { timezone: 'America/Bogota' });
```

### Cron Format

The format is: `minute hour day month day-of-week`
- `'0 9 * * *'` = Every day at 9:00 AM
- `'0 13 * * *'` = Every day at 1:00 PM
- `'0 19 * * *'` = Every day at 7:00 PM

To change the schedule or add more times, modify the cron expressions in `agent.js`.

## 📄 License

ISC

## 👤 Author

0xj4an

## 🚂 Railway Deployment

This project is designed to run continuously on [Railway](https://railway.app/):

1. Connect your GitHub repository to Railway
2. Set the environment variables in Railway:
   - `TWITTER_APP_KEY`
   - `TWITTER_APP_SECRET`  
   - `TWITTER_ACCESS_TOKEN`
   - `TWITTER_ACCESS_SECRET`
3. Railway will automatically deploy and keep the agent running 24/7

The bot will run continuously, posting automatically at the scheduled times (9 AM, 1 PM, 7 PM Bogotá time).

---

**Note**: Make sure to keep your `.env` file secure and never commit it to version control. This project includes `.env` in `.gitignore` for your security.
