import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import cron from 'node-cron';
import fs from 'fs';
dotenv.config();

// 🐦 Configurar cliente de Twitter
const client = new TwitterApi({
  appKey: process.env.TWITTER_APP_KEY,
  appSecret: process.env.TWITTER_APP_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// 🗂️ Leer todos los mensajes desde messages.json
function loadMessages() {
  const data = fs.readFileSync('./messages.json', 'utf8');
  return JSON.parse(data);
}

// 🎲 Escoger mensaje aleatorio de un bloque
function getRandomMessage(group) {
  const messages = loadMessages();
  const list = messages[group] || [];
  const index = Math.floor(Math.random() * list.length);
  const message = list[index];
  return `${message} • ${new Date().toISOString().slice(0, 10)}`;
}

// 🐤 Publicar tweet
async function postTweet(text) {
  try {
    const { data } = await client.v2.tweet(text);
    console.log("✅ Tweet publicado:", `https://x.com/i/web/status/${data.id}`);
  } catch (error) {
    console.error("❌ Error al publicar:", error?.data ?? error);
  }
}

// 🕒 Schedulers — hora local Bogotá
// 9:00 AM → morning
cron.schedule('0 9 * * *', () => {
  console.log('🌅 Publicando mensaje de la mañana...');
  postTweet(getRandomMessage('morning'));
}, { timezone: 'America/Bogota' });

// 1:00 PM → noon
cron.schedule('0 13 * * *', () => {
  console.log('☀️ Publicando mensaje del mediodía...');
  postTweet(getRandomMessage('noon'));
}, { timezone: 'America/Bogota' });

// 7:00 PM → evening
cron.schedule('0 19 * * *', () => {
  console.log('🌙 Publicando mensaje de la noche...');
  postTweet(getRandomMessage('evening'));
}, { timezone: 'America/Bogota' });

console.log('🤖 Agente activo. Publicará mensajes aleatorios a las 9 AM, 1 PM y 7 PM (hora Bogotá).');

// 👉 Para probar manualmente (opcional):
postTweet(getRandomMessage('morning'));
postTweet(getRandomMessage('noon'));
postTweet(getRandomMessage('evening'));