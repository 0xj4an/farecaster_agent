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

// 📁 Rutas de archivos
const HISTORY_PATH = './tweet_history.json';
const LOG_PATH = './tweets.log';

// 🗂️ Leer todos los mensajes desde messages.json
function loadMessages() {
  const data = fs.readFileSync('./messages.json', 'utf8');
  return JSON.parse(data);
}

// 🧠 Cargar historial
function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_PATH)) {
      return { morning: [], noon: [], evening: [] };
    }
    const data = fs.readFileSync(HISTORY_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('⚠️ Error cargando historial:', err);
    return { morning: [], noon: [], evening: [] };
  }
}

// 💾 Guardar historial actualizado
function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

// 🎲 Escoger mensaje aleatorio sin repetir los últimos 10
function getRandomMessage(group) {
  const messages = loadMessages();
  const history = loadHistory();
  const list = messages[group] || [];
  const recent = new Set(history[group] || []);

  const available = list.filter(msg => !recent.has(msg));
  const pool = available.length > 0 ? available : list;

  const message = pool[Math.floor(Math.random() * pool.length)];

  const updated = [message, ...history[group]].slice(0, 10);
  history[group] = updated;
  saveHistory(history);

  return message;
}

// 🪶 Guardar registro local de publicaciones
function logTweet(group, message) {
  const timestamp = new Date().toLocaleString('es-CO');
  const logLine = `[${timestamp}] (${group}) ${message}\n`;
  fs.appendFileSync(LOG_PATH, logLine, 'utf8');
}

// 🐤 Publicar tweet
async function postTweet(text, group) {
  try {
    const { data } = await client.v2.tweet(text);
    console.log(`✅ Tweet publicado (${group}): https://x.com/i/web/status/${data.id}`);
    logTweet(group, text);
  } catch (error) {
    console.error('❌ Error al publicar:', error?.data ?? error);
  }
}

// 🧹 Reset mensual (archiva logs e historial)
function resetMonthlyHistory() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const tag = `${year}-${month}`;

    // Archivar historial
    if (fs.existsSync(HISTORY_PATH)) {
      const archiveHistory = `./tweet_history_${tag}.json`;
      fs.renameSync(HISTORY_PATH, archiveHistory);
      console.log(`🗃️ Historial archivado: ${archiveHistory}`);
    }

    // Reiniciar historial vacío
    saveHistory({ morning: [], noon: [], evening: [] });
    console.log('🧹 Historial reiniciado para nuevo mes.');

    // Archivar log
    if (fs.existsSync(LOG_PATH)) {
      const archiveLog = `./tweets_${tag}.log`;
      fs.renameSync(LOG_PATH, archiveLog);
      console.log(`🗃️ Log archivado: ${archiveLog}`);
    }

    fs.writeFileSync(LOG_PATH, '', 'utf8');
  } catch (err) {
    console.error('⚠️ Error en reset mensual:', err);
  }
}

// 📅 Detectar si HOY es el último día del mes
function isLastDayOfMonth(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getDate() === 1;
}

// 🕒 Schedulers automáticos (hora local Bogotá)

// 🌅 9:00 AM → mensajes "morning"
cron.schedule('0 9 * * *', () => {
  const msg = getRandomMessage('morning');
  console.log('🌅 Publicando mensaje de la mañana...');
  postTweet(msg, 'morning');
}, { timezone: 'America/Bogota' });

// ☀️ 1:00 PM → mensajes "noon"
cron.schedule('0 13 * * *', () => {
  const msg = getRandomMessage('noon');
  console.log('☀️ Publicando mensaje del mediodía...');
  postTweet(msg, 'noon');
}, { timezone: 'America/Bogota' });

// 🌙 7:00 PM → mensajes "evening"
cron.schedule('0 19 * * *', () => {
  const msg = getRandomMessage('evening');
  console.log('🌙 Publicando mensaje de la noche...');
  postTweet(msg, 'evening');
}, { timezone: 'America/Bogota' });

// 🕛 23:59 cada día → verificar si es último día del mes y vaciar si sí
cron.schedule('59 23 * * *', () => {
  if (isLastDayOfMonth()) {
    console.log('🗓️ Último día del mes detectado — reiniciando historial y logs...');
    resetMonthlyHistory();
  } else {
    console.log('📅 No es el último día del mes, sin cambios.');
  }
}, { timezone: 'America/Bogota' });

console.log('🤖 Agente activo. Publicará a las 9 AM / 1 PM / 7 PM y reiniciará al final de cada mes (23:59 hora Bogotá).');

// 🧪 Prueba manual — publica tres tweets (morning, noon y evening)
(async () => {
    console.log('🧪 Test manual: publicando tres tweets (morning, noon, evening)...');
  
    const msgMorning = getRandomMessage('morning');
    await postTweet(msgMorning, 'morning');
  
    const msgNoon = getRandomMessage('noon');
    await postTweet(msgNoon, 'noon');
  
    const msgEvening = getRandomMessage('evening');
    await postTweet(msgEvening, 'evening');
  
    console.log('✅ Test completo: se publicaron los tres tweets de prueba.');
  })();



  // 🧩 AUTO-LIKE + RETWEET a cuentas aliadas
const followedAccounts = [
    { username: 'Celo_Col', userId: '1584012895125471232' },     // ✅ @celo_col
    { username: 'refimed', userId: '1525503859107303424' },     // ✅ @refimed
    { username: 'MedellinBlock', userId: '1590501436009238529' } // ✅ @medellinblock
  ];
  
  const INTERACTIONS_PATH = './interactions.json';
  
  // 🧠 Cargar historial de interacciones (para no repetir)
  function loadInteractions() {
    try {
      if (!fs.existsSync(INTERACTIONS_PATH)) return { liked: [], retweeted: [] };
      return JSON.parse(fs.readFileSync(INTERACTIONS_PATH, 'utf8'));
    } catch {
      return { liked: [], retweeted: [] };
    }
  }
  
  // 💾 Guardar historial actualizado
  function saveInteractions(data) {
    fs.writeFileSync(INTERACTIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
  }
  
  // ⏱️ Función para esperar (delay)
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // 💚 Dar like + RT a tweets nuevos
  async function engageWithCommunityTweets() {
    const interactions = loadInteractions();

    for (const account of followedAccounts) {
      try {
        const timeline = await client.v2.userTimeline(account.userId, { max_results: 3 }); // Reducido de 5 a 3
        if (!timeline.data?.data) continue;

        for (const tweet of timeline.data.data) {
          const alreadyLiked = interactions.liked.includes(tweet.id);
          const alreadyRT = interactions.retweeted.includes(tweet.id);

          if (!alreadyLiked) {
            await client.v2.like(process.env.TWITTER_USER_ID, tweet.id);
            console.log(`💛 Like a tweet de @${account.username}: ${tweet.id}`);
            interactions.liked.unshift(tweet.id);
            await wait(2000); // Esperar 2 segundos entre likes
          }

          if (!alreadyRT) {
            await client.v2.retweet(process.env.TWITTER_USER_ID, tweet.id);
            console.log(`🔁 Retweet de @${account.username}: ${tweet.id}`);
            interactions.retweeted.unshift(tweet.id);
            await wait(2000); // Esperar 2 segundos entre retweets
          }
        }

        // Esperar 3 segundos entre cuentas
        await wait(3000);

      } catch (err) {
        // Detectar rate limit y saltarlo sin error visible
        if (err?.data?.status === 429) {
          console.log(`⏸️ Rate limit alcanzado para @${account.username}, saltando...`);
          continue;
        }

        // Solo mostrar error si NO es rate limit ni forbidden
        if (err?.data?.status !== 403) {
          console.error(`⚠️ Error interactuando con @${account.username}:`, err?.data ?? err);
        }
      }
    }
  
    // Guardar los últimos 100 registros
    interactions.liked = interactions.liked.slice(0, 100);
    interactions.retweeted = interactions.retweeted.slice(0, 100);
    saveInteractions(interactions);
  }
  
  // 🕒 Ejecutar cada 4 horas (America/Bogota) - Reducido para evitar rate limits
  cron.schedule('0 */4 * * *', () => {
    console.log('🤝 Revisando cuentas aliadas para likes/RTs...');
    engageWithCommunityTweets();
  }, { timezone: 'America/Bogota' });