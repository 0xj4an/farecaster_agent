import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import cron from 'node-cron';

dotenv.config();

// 🐦 Twitter client
const client = new TwitterApi({
  appKey: process.env.TWITTER_APP_KEY,
  appSecret: process.env.TWITTER_APP_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// 💬 Array of random messages
const messages = [
  "gm ☀️",
  "Shipping something cool today 🚀",
  "ReFi is the future 🌱 #Celo",
  "Stay focused, keep building 💻",
  "☕ morning coffee + commits = happiness",
  "Exploring decentralized finance 💸 #cCOP",
  "Community > code ❤️ #CeloColombia",
  "Every line of code plants a seed 🌿",
  "Pushing updates soon… stay tuned 👀",
];

// 🔄 Pick a random message
function getRandomMessage() {
  const randomIndex = Math.floor(Math.random() * messages.length);
  return `${messages[randomIndex]} • ${new Date().toISOString().slice(0,10)}`;
}

// 🐤 Post to X
async function postTweet() {
  try {
    const text = getRandomMessage();
    
    // Use read-write client to ensure we have write permissions
    const rwClient = client.readWrite;
    const { data } = await rwClient.v2.tweet(text);
    console.log("✅ Tweet publicado:", `https://x.com/i/web/status/${data.id}`);
  } catch (error) {
    console.error("❌ Error al publicar:");
    console.error("Error completo:", JSON.stringify(error, null, 2));
    
    // More detailed error info
    if (error.code) {
      console.error(`Código de error: ${error.code}`);
    }
    if (error.data) {
      console.error(`Datos del error:`, error.data);
    }
  }
}

// 🕒 Run daily at 9:00 a.m. Bogotá
cron.schedule('0 9 * * *', () => {
  console.log('🕘 Posting daily tweet...');
  postTweet();
}, { timezone: 'America/Bogota' });

// Optional immediate post when starting (for testing)
postTweet();

console.log('🤖 Agente activo. Publicará un mensaje aleatorio cada día a las 9:00 a.m. (America/Bogota)');