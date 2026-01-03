import axios from 'axios';
import cron from 'node-cron';
import fs from 'fs';

// 🟣 Configurar cliente de Neynar (Farcaster API)
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
// NOTE: This bot uses the env var name "FID" for the value sent as Neynar "signer_uuid".
const FID = process.env.FID;
const NEYNAR_BASE_URL = 'https://api.neynar.com/v2/farcaster';

// Cliente axios configurado con headers de autenticación
const neynarClient = axios.create({
  baseURL: NEYNAR_BASE_URL,
  headers: {
    'api_key': NEYNAR_API_KEY,
    'Content-Type': 'application/json'
  }
});

// 📁 Rutas de archivos
const HISTORY_PATH = './cast_history.json';
const LOG_PATH = './casts.log';

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
function logCast(group, message) {
  const timestamp = new Date().toLocaleString('es-CO');
  const logLine = `[${timestamp}] (${group}) ${message}\n`;
  fs.appendFileSync(LOG_PATH, logLine, 'utf8');
}

// 🟣 Publicar cast en Farcaster
async function publishCast(text, group) {
  try {
    const response = await neynarClient.post('/cast', {
      signer_uuid: FID,
      text: text
    });

    const castHash = response.data?.cast?.hash || 'unknown';
    console.log(`✅ Cast publicado (${group}): https://warpcast.com/~/conversations/${castHash}`);
    logCast(group, text);
  } catch (error) {
    console.error('❌ Error al publicar cast:', error?.response?.data ?? error.message);
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
      const archiveHistory = `./cast_history_${tag}.json`;
      fs.renameSync(HISTORY_PATH, archiveHistory);
      console.log(`🗃️ Historial archivado: ${archiveHistory}`);
    }

    // Reiniciar historial vacío
    saveHistory({ morning: [], noon: [], evening: [] });
    console.log('🧹 Historial reiniciado para nuevo mes.');

    // Archivar log
    if (fs.existsSync(LOG_PATH)) {
      const archiveLog = `./casts_${tag}.log`;
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
    console.log(`🎲 Publicando cast aleatorio (${group}) después de 24h...`);
    publishCast(msg, group);
    lastPostTime = Date.now();
    console.log(`✅ Cast realizado. Próximo cast disponible en 24 horas.`);
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

console.log('🤖 Agente de Farcaster activo.');
console.log('📅 Casts: 1 vez cada 24 horas a una hora aleatoria');
console.log('💚 Auto-engagement: 3 veces al día (9 AM, 3 PM, 9 PM) con cuentas rotativas');
console.log('🗓️ Archivado: Fin de cada mes a las 23:59 (hora Bogotá)');
console.log('🟣 Usando Neynar API para Warpcast/Farcaster');

// 🧪 Prueba manual — descomentado para testing
// (async () => {
//     console.log('🧪 Test manual: publicando un cast de prueba...');
//
//     const testHour = new Date().getHours();
//     const testGroup = getMessageGroupByHour(testHour);
//     const testMsg = getRandomMessage(testGroup);
//     await publishCast(testMsg, testGroup);
//
//     console.log('✅ Test completo: cast de prueba publicado.');
//   })();



  // 🧩 AUTO-LIKE + RECAST a cuentas aliadas en Farcaster
  // Nota: Necesitarás obtener los FIDs de estas cuentas desde Warpcast
const followedAccounts = [
    { username: 'celo-col', fid: 0 },        // TODO: Obtener FID real de @celo-col en Warpcast
    { username: 'refimed', fid: 0 },         // TODO: Obtener FID real de @refimed en Warpcast
    { username: 'medellinblock', fid: 0 }    // TODO: Obtener FID real de @medellinblock en Warpcast
  ];

  const INTERACTIONS_PATH = './interactions.json';

  // 🌐 Función para obtener casts usando Neynar API (¡gratis!)
  async function getUserCasts(fid) {
    try {
      const response = await neynarClient.get('/feed/user/casts', {
        params: {
          fid: fid,
          limit: 5  // Obtener los últimos 5 casts
        }
      });

      return response.data?.casts || [];
    } catch (err) {
      console.error(`⚠️ Error obteniendo casts del FID ${fid}:`, err.response?.data?.message || err.message);
      return [];
    }
  }

  // 🧠 Cargar historial de interacciones (para no repetir)
  function loadInteractions() {
    try {
      if (!fs.existsSync(INTERACTIONS_PATH)) return { liked: [], recasted: [] };
      return JSON.parse(fs.readFileSync(INTERACTIONS_PATH, 'utf8'));
    } catch {
      return { liked: [], recasted: [] };
    }
  }

  // 💾 Guardar historial actualizado
  function saveInteractions(data) {
    fs.writeFileSync(INTERACTIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  // ⏱️ Función para esperar (delay)
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // 💚 Dar like + recast a casts nuevos de UNA cuenta específica
  async function engageWithAccount(account) {
    const interactions = loadInteractions();

    try {
      // 🔍 Usar Neynar API para obtener casts
      console.log(`🔍 Obteniendo casts del FID ${account.fid} (@${account.username})...`);
      const casts = await getUserCasts(account.fid);

      if (casts.length === 0) {
        console.log(`ℹ️ No se encontraron casts de @${account.username}`);
        return;
      }

      console.log(`✅ Encontrados ${casts.length} casts de @${account.username}`);

      // 💚 Interactuar con cada cast usando Neynar API
      let successCount = 0;
      for (const cast of casts) {
        const castHash = cast.hash;

        if (!castHash) {
          console.log(`⚠️ Cast sin hash, saltando...`);
          continue;
        }

        const alreadyLiked = interactions.liked.includes(castHash);
        const alreadyRecasted = interactions.recasted.includes(castHash);

        // Si ya interactuamos con este cast, saltarlo
        if (alreadyLiked && alreadyRecasted) {
          continue;
        }

        // 💛 Dar like (reaction)
        if (!alreadyLiked) {
          try {
            await neynarClient.post('/reaction', {
              signer_uuid: FID,
              reaction_type: 'like',
              target: castHash
            });
            console.log(`💛 Like a cast de @${account.username}: ${castHash.substring(0, 10)}...`);
            interactions.liked.unshift(castHash);
            successCount++;
            await wait(3000); // Esperar 3 segundos entre acciones
          } catch (err) {
            const errorMsg = err.response?.data?.message || err.message;

            // Marcar como procesado si ya fue liked
            if (errorMsg.includes('already') || errorMsg.includes('duplicate')) {
              interactions.liked.unshift(castHash);
              console.log(`⚠️ Ya se había dado like - Marcado como procesado`);
            } else if (err.response?.status === 429) {
              console.log(`⚠️ Rate limit alcanzado, esperando 60 segundos...`);
              await wait(60000);
            } else {
              console.log(`⚠️ Error dando like: ${errorMsg}`);
            }
          }
        }

        // 🔁 Recast (quote cast con texto vacío)
        if (!alreadyRecasted) {
          try {
            await neynarClient.post('/cast', {
              signer_uuid: FID,
              text: '',
              embeds: [{ cast_id: { hash: castHash, fid: account.fid } }]
            });
            console.log(`🔁 Recast de @${account.username}: ${castHash.substring(0, 10)}...`);
            interactions.recasted.unshift(castHash);
            successCount++;
            await wait(3000); // Esperar 3 segundos entre acciones
          } catch (err) {
            const errorMsg = err.response?.data?.message || err.message;

            // Marcar como procesado si ya fue recasteado
            if (errorMsg.includes('already') || errorMsg.includes('duplicate')) {
              interactions.recasted.unshift(castHash);
              console.log(`⚠️ Ya se había hecho recast - Marcado como procesado`);
            } else if (err.response?.status === 429) {
              console.log(`⚠️ Rate limit alcanzado, deteniendo engagement...`);
              break; // Salir del loop si hay rate limit
            } else {
              console.log(`⚠️ Error haciendo recast: ${errorMsg}`);
            }
          }
        }

        // Limitar a máximo 3 interacciones exitosas por sesión
        if (successCount >= 3) {
          console.log(`✅ Límite de 3 interacciones alcanzado, finalizando...`);
          break;
        }
      }

      console.log(`📊 Engagement completado: ${successCount} interacciones exitosas`);

      // Guardar los últimos 100 registros
      interactions.liked = interactions.liked.slice(0, 100);
      interactions.recasted = interactions.recasted.slice(0, 100);
      saveInteractions(interactions);

    } catch (err) {
      console.error(`⚠️ Error procesando @${account.username}:`, err.response?.data?.message || err.message);
    }
  }

  // 🎲 Seleccionar cuenta aleatoria para revisar
  function getRandomAccount() {
    const randomIndex = Math.floor(Math.random() * followedAccounts.length);
    return followedAccounts[randomIndex];
  }
  
  // 🌅 Mañana (9:00 AM) - Revisar cuenta aleatoria
  cron.schedule('0 9 * * *', () => {
    if (NEYNAR_API_KEY && FID) {
      const account = getRandomAccount();
      console.log(`🌅 Auto-engagement matutino con @${account.username}...`);
      engageWithAccount(account);
    } else {
      console.log('⚠️ Auto-engagement saltado: NEYNAR_API_KEY o FID no configurado');
    }
  }, { timezone: 'America/Bogota' });

  // ☀️ Tarde (3:00 PM) - Revisar cuenta aleatoria
  cron.schedule('0 15 * * *', () => {
    if (NEYNAR_API_KEY && FID) {
      const account = getRandomAccount();
      console.log(`☀️ Auto-engagement vespertino con @${account.username}...`);
      engageWithAccount(account);
    } else {
      console.log('⚠️ Auto-engagement saltado: NEYNAR_API_KEY o FID no configurado');
    }
  }, { timezone: 'America/Bogota' });

  // 🌙 Noche (9:00 PM) - Revisar cuenta aleatoria
  cron.schedule('0 21 * * *', () => {
    if (NEYNAR_API_KEY && FID) {
      const account = getRandomAccount();
      console.log(`🌙 Auto-engagement nocturno con @${account.username}...`);
      engageWithAccount(account);
    } else {
      console.log('⚠️ Auto-engagement saltado: NEYNAR_API_KEY o FID no configurado');
    }
  }, { timezone: 'America/Bogota' });

  // 🚀 Ejecutar auto-engagement inmediatamente al iniciar (para testing)
  if (NEYNAR_API_KEY && FID) {
    const account = getRandomAccount();
    console.log(`🚀 Ejecutando auto-engagement inicial con @${account.username}...`);
    engageWithAccount(account).catch(err => {
      console.error('⚠️ Error en auto-engagement inicial:', err.message);
    });
  } else {
    console.log('⚠️ NEYNAR_API_KEY o FID no configurado. Auto-engagement deshabilitado.');
    console.log('ℹ️ Para habilitar auto-engagement, añade NEYNAR_API_KEY y FID a las variables de entorno.');
  }