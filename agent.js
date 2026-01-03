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

// 🎲 Variables para controlar el post aleatorio cada 24 horas
let lastPostTime = null;
const POST_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas en milisegundos

// 🌈 Función para determinar el grupo de mensaje según la hora
function getMessageGroupByHour(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'noon';
  return 'evening';
}

// ⏰ Verificar si han pasado 24 horas desde el último post
function canPostNow() {
  if (lastPostTime === null) return true; // Primera vez
  const now = Date.now();
  const timeSinceLastPost = now - lastPostTime;
  return timeSinceLastPost >= POST_INTERVAL_MS;
}

// 🎲 Generar un número aleatorio entre min y max (inclusivo)
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 🕐 Ejecutar cada hora para verificar si pueden pasar 24h y postear aleatoriamente
cron.schedule('0 * * * *', () => {
  // Solo continuar si han pasado 24 horas
  if (!canPostNow()) {
    const hoursRemaining = Math.ceil((POST_INTERVAL_MS - (Date.now() - lastPostTime)) / (60 * 60 * 1000));
    console.log(`⏳ Esperando... Faltan ~${hoursRemaining}h para poder postear de nuevo.`);
    return;
  }

  // Decidir aleatoriamente si postear esta hora (probabilidad: ~1/8 para promediar ~3 posts/día)
  const shouldPost = getRandomInt(1, 8) === 1;

  if (shouldPost) {
    const currentHour = new Date().getHours();
    const group = getMessageGroupByHour(currentHour);
    const msg = getRandomMessage(group);
    console.log(`🎲 Publicando tweet aleatorio (${group}) después de 24h...`);
    postTweet(msg, group);
    lastPostTime = Date.now();
    console.log(`✅ Post realizado. Próximo post disponible en 24 horas.`);
  } else {
    console.log(`🎯 24h cumplidas, pero esperando momento aleatorio para postear...`);
  }
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

console.log('🤖 Agente activo. Publicará 1 vez cada 24 horas a una hora aleatoria y reiniciará al final de cada mes (23:59 hora Bogotá).');

// 🧪 Prueba manual — descomentado para testing
// (async () => {
//     console.log('🧪 Test manual: publicando un tweet de prueba...');
//
//     const testHour = new Date().getHours();
//     const testGroup = getMessageGroupByHour(testHour);
//     const testMsg = getRandomMessage(testGroup);
//     await postTweet(testMsg, testGroup);
//
//     console.log('✅ Test completo: tweet de prueba publicado.');
//   })();



  // 🧩 AUTO-LIKE + RETWEET a cuentas aliadas
const followedAccounts = [
    { username: 'Celo_Col', userId: '1584012895125471232' },     // ✅ @celo_col
    { username: 'refimed', userId: '1525503859107303424' },     // ✅ @refimed
    { username: 'MedellinBlock', userId: '1590501436009238529' } // ✅ @medellinblock
  ];

  const INTERACTIONS_PATH = './interactions.json';
  const SOCIAVAULT_API_URL = 'https://api.sociavault.com/v1/scrape/twitter/user-tweets';

  // 🌐 Función para obtener tweets usando SociaVault API
  async function getUserTweets(username) {
    try {
      const response = await fetch(`${SOCIAVAULT_API_URL}?handle=${username}`, {
        method: 'GET',
        headers: {
          'X-API-Key': process.env.SOCIAVAULT_API_KEY
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SociaVault API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      // SociaVault devuelve los tweets en data.tweets
      // Retorna los 100 tweets más populares del usuario
      return data.tweets || [];
    } catch (err) {
      console.error(`⚠️ Error obteniendo tweets de @${username}:`, err.message);
      return [];
    }
  }

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

  // 💚 Dar like + RT a tweets nuevos (usando SociaVault API para obtener + API oficial para interactuar)
  async function engageWithCommunityTweets() {
    const interactions = loadInteractions();

    for (const account of followedAccounts) {
      try {
        // 🔍 Usar SociaVault API para obtener tweets recientes
        console.log(`🔍 Obteniendo tweets de @${account.username} con SociaVault API...`);
        const tweets = await getUserTweets(account.username);

        if (tweets.length === 0) {
          console.log(`ℹ️ No se encontraron tweets de @${account.username}`);
          continue;
        }

        console.log(`✅ Encontrados ${tweets.length} tweets de @${account.username}`);

        // Limitar a los primeros 5 tweets
        const recentTweets = tweets.slice(0, 5);

        // 💚 Interactuar con cada tweet usando la API oficial
        for (const tweet of recentTweets) {
          // SociaVault devuelve el ID en rest_id o legacy.id_str
          const tweetId = tweet.rest_id || tweet.legacy?.id_str;

          if (!tweetId) {
            console.log(`⚠️ Tweet sin ID, saltando...`);
            continue;
          }

          const alreadyLiked = interactions.liked.includes(tweetId);
          const alreadyRT = interactions.retweeted.includes(tweetId);

          if (!alreadyLiked) {
            try {
              await client.v2.like(process.env.TWITTER_USER_ID, tweetId);
              console.log(`💛 Like a tweet de @${account.username}: ${tweetId}`);
              interactions.liked.unshift(tweetId);
              await wait(2000); // Esperar 2 segundos entre likes
            } catch (err) {
              if (err?.data?.status !== 403) {
                console.log(`⚠️ Error dando like: ${err.message}`);
              }
            }
          }

          if (!alreadyRT) {
            try {
              await client.v2.retweet(process.env.TWITTER_USER_ID, tweetId);
              console.log(`🔁 Retweet de @${account.username}: ${tweetId}`);
              interactions.retweeted.unshift(tweetId);
              await wait(2000); // Esperar 2 segundos entre retweets
            } catch (err) {
              if (err?.data?.status !== 403) {
                console.log(`⚠️ Error haciendo RT: ${err.message}`);
              }
            }
          }
        }

        // Esperar 3 segundos entre cuentas
        await wait(3000);

      } catch (err) {
        console.error(`⚠️ Error procesando @${account.username}:`, err.message);
      }
    }
  
    // Guardar los últimos 100 registros
    interactions.liked = interactions.liked.slice(0, 100);
    interactions.retweeted = interactions.retweeted.slice(0, 100);
    saveInteractions(interactions);
  }
  
  // 🕒 Ejecutar cada 4 horas (America/Bogota) - Reducido para evitar rate limits
  cron.schedule('0 */4 * * *', () => {
    if (process.env.SOCIAVAULT_API_KEY) {
      console.log('🤝 Revisando cuentas aliadas para likes/RTs...');
      engageWithCommunityTweets();
    } else {
      console.log('⚠️ Auto-engagement saltado: SOCIAVAULT_API_KEY no configurado');
    }
  }, { timezone: 'America/Bogota' });

  // 🚀 Ejecutar auto-engagement inmediatamente al iniciar (para testing)
  // Descomentado solo si SOCIAVAULT_API_KEY está configurado
  if (process.env.SOCIAVAULT_API_KEY) {
    console.log('🚀 Ejecutando auto-engagement inicial con SociaVault API...');
    engageWithCommunityTweets().catch(err => {
      console.error('⚠️ Error en auto-engagement inicial:', err.message);
    });
  } else {
    console.log('⚠️ SOCIAVAULT_API_KEY no configurado. Auto-engagement deshabilitado.');
    console.log('ℹ️ Para habilitar auto-engagement, añade SOCIAVAULT_API_KEY a las variables de entorno.');
  }