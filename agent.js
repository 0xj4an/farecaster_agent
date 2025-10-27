import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import cron from 'node-cron';
import fs from 'fs';

dotenv.config();

// 🐦 Twitter client
const client = new TwitterApi({
  appKey: process.env.TWITTER_APP_KEY,
  appSecret: process.env.TWITTER_APP_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// 💬 Load messages from JSON file
function loadMessages() {
  try {
    const raw = fs.readFileSync('./messages.json', 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('❌ Error loading messages.json:', error.message);
    return [];
  }
}

// 🔄 Pick random message
function getRandomMessage() {
  const messages = loadMessages();
  const randomIndex = Math.floor(Math.random() * messages.length);
  return `${messages[randomIndex]} • ${new Date().toISOString().slice(0,10)}`;
}

// 🐤 Post to X
async function postTweet() {
  try {
    const text = getRandomMessage();
    const { data } = await client.v2.tweet(text);
    console.log("✅ Tweet publicado:", `https://x.com/i/web/status/${data.id}`);
  } catch (error) {
    console.error("❌ Error al publicar:", error?.data ?? error);
  }
}

// 🕒 Programar publicaciones automáticas
// node-cron usa formato "minuto hora día_mes mes día_semana"
// Ejemplo: "0 9 * * *" → a las 9:00 AM cada día

// Publicar a las 9:00 AM (hora Bogotá)
cron.schedule('0 9 * * *', () => {
    console.log('🕘 Publicando tweet de la mañana...');
    postTweet();
  }, { timezone: 'America/Bogota' });
  
  // Publicar a la 1:00 PM
  cron.schedule('0 13 * * *', () => {
    console.log('🕐 Publicando tweet del mediodía...');
    postTweet();
  }, { timezone: 'America/Bogota' });
  
  // Publicar a las 7:00 PM
  cron.schedule('0 19 * * *', () => {
    console.log('🕖 Publicando tweet de la tarde...');
    postTweet();
  }, { timezone: 'America/Bogota' });
  
  console.log('🤖 Agente activo. Publicará a las 9:00 AM, 1:00 PM y 7:00 PM (hora Bogotá)');
// Optional: uncomment for manual test
// postTweet();