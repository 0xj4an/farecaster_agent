# 🤖 X Agent

An automated Twitter/X agent that posts random messages on a daily schedule. Built with Node.js, Twitter API v2, and node-cron.

## 📋 Features

- 🐦 **Automated Tweeting**: Posts random messages to X/Twitter automatically
- ⏰ **Cron Scheduling**: Daily posts at 9:00 AM (America/Bogota timezone)
- 🎲 **Random Messages**: Selects from a predefined collection of messages
- 📅 **Date Stamping**: Each post includes the current date
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
- Run continuously and post at the scheduled time (9:00 AM daily)
- Display a confirmation message when a tweet is posted
- Show the tweet URL in the console

### Testing

To test immediately (comment out line 52 in `agent.js`):
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
├── agent.js          # Main bot logic
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

Edit the `messages` array in `agent.js` to customize your random messages:

```javascript
const messages = [
  "gm ☀️",
  "Shipping something cool today 🚀",
  // Add your custom messages here
];
```

## 🕒 Scheduling

The cron schedule is set to 9:00 AM America/Bogota timezone:

```javascript
cron.schedule('0 9 * * *', () => { /* ... */ }, { timezone: 'America/Bogota' });
```

To change the schedule, modify the cron expression and timezone in `agent.js`.

## 📄 License

ISC

## 👤 Author

0xj4an

---

**Note**: Make sure to keep your `.env` file secure and never commit it to version control. This project includes `.env` in `.gitignore` for your security.
