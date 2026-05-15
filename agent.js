import axios from 'axios';
import cron from 'node-cron';
import fs from 'fs';

// 🟣 Configurar cliente de Neynar (Farcaster API)
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
// Your Farcaster numeric FID (optional; mainly for logging / future extensions).
const FID = process.env.FID;
// Neynar write endpoints require a UUID signer (NOT a numeric FID).
// Prefer explicit SIGNER_UUID, but support older setups where FID was used to store the signer UUID.
const isUuid = (v) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const SIGNER_UUID = process.env.SIGNER_UUID || (isUuid(FID) ? FID : undefined);
const NEYNAR_BASE_URL = 'https://api.neynar.com/v2/farcaster';

// If your Neynar plan/API key does not allow write actions (like/recast), avoid spamming retries.
let CAN_USE_REACTIONS = true;
let CAN_USE_WRITES = true;

function normalizeCastHash(hash) {
  if (typeof hash !== 'string') return null;
  const trimmed = hash.trim();
  if (/^0x[0-9a-f]{40,}$/i.test(trimmed)) return trimmed;
  // Some sources may return the hash without the 0x prefix
  if (/^[0-9a-f]{40,}$/i.test(trimmed)) return `0x${trimmed}`;
  return null;
}

function parseEnvInt(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

// Engagement tuning
const LOOKBACK_DAYS = parseEnvInt('LOOKBACK_DAYS', 30); // last N days to consider for engagement
const MAX_ACTIONS_PER_RUN = parseEnvInt('MAX_ACTIONS_PER_RUN', 5); // max likes+recasts per account per run
const MAX_CASTS_REVIEW_PER_ACCOUNT = parseEnvInt('MAX_CASTS_REVIEW_PER_ACCOUNT', 0); // 0 = unlimited, review all casts
const CASTS_PAGE_SIZE = parseEnvInt('CASTS_PAGE_SIZE', 50);
const ACTION_DELAY_MS = parseEnvInt('ACTION_DELAY_MS', 3000);

// Insights (topic mining + weekly cast) tuning
// El insights cast se publica a la mitad del intervalo semanal del random cast,
// a una hora fija siempre. Así nunca cae el mismo día que el random cast.
const INSIGHTS_ENABLED = (process.env.INSIGHTS_ENABLED ?? '0') === '1';
const INSIGHTS_DAYS = parseEnvInt('INSIGHTS_DAYS', 7); // summarize last N days into the weekly cast
const INSIGHTS_STORE_DAYS = parseEnvInt('INSIGHTS_STORE_DAYS', 30); // keep last N days in insights.json
const INSIGHTS_OFFSET_DAYS = parseEnvInt('INSIGHTS_OFFSET_DAYS', 3); // días después del random cast (~mitad de 7)
const INSIGHTS_HOUR = parseEnvInt('INSIGHTS_HOUR', 8); // hora fija (24h, Bogotá) del insights cast

const BOT_TIMEZONE = 'America/Bogota';

function sanitizeCronExpr(expr) {
  if (expr === undefined || expr === null) return '';
  let s = String(expr).trim();
  // Railway env vars are often set with quotes; strip them if present.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function supportsTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const CRON_TIMEZONE = supportsTimeZone(BOT_TIMEZONE) ? BOT_TIMEZONE : undefined;
if (!CRON_TIMEZONE) {
  console.log(`⚠️ Timezone "${BOT_TIMEZONE}" no soportada en este runtime. Cron usará timezone local del sistema.`);
}

function safeSchedule(expr, fn) {
  const cleaned = sanitizeCronExpr(expr);
  if (!cleaned) {
    console.log('⚠️ Cron inválido/vacío, saltando schedule.');
    return null;
  }
  if (typeof cron.validate === 'function' && !cron.validate(cleaned)) {
    console.log(`⚠️ Cron inválido: "${cleaned}". Revisa tu variable de entorno.`);
    return null;
  }
  try {
    return cron.schedule(cleaned, fn, CRON_TIMEZONE ? { timezone: CRON_TIMEZONE } : undefined);
  } catch (err) {
    console.error(`⚠️ Error programando cron "${cleaned}":`, err.message);
    return null;
  }
}

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
const STATE_PATH = './state.json';
const INSIGHTS_PATH = './insights.json';

function loadState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { last_post_ms: null };
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    // Keep this flexible for future fields (e.g., last_insights_post_ymd)
    return typeof data === 'object' && data !== null ? data : { last_post_ms: null };
  } catch {
    return { last_post_ms: null };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function loadInsights() {
  try {
    if (!fs.existsSync(INSIGHTS_PATH)) return { seen: [], items: [] };
    const data = JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
    return { seen: Array.isArray(data?.seen) ? data.seen : [], items: Array.isArray(data?.items) ? data.items : [] };
  } catch {
    return { seen: [], items: [] };
  }
}

function saveInsights(data) {
  fs.writeFileSync(INSIGHTS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function clampText(s, maxLen) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

function extractHashtags(text) {
  if (typeof text !== 'string') return [];
  const matches = text.match(/#[\p{L}\p{N}_]{2,}/gu) || [];
  return matches.map(t => t.toLowerCase());
}

function extractMentions(text) {
  if (typeof text !== 'string') return [];
  const matches = text.match(/@[\p{L}\p{N}_\.]{2,}/gu) || [];
  return matches.map(t => t.toLowerCase());
}

function extractKeywords(text) {
  if (typeof text !== 'string') return [];
  const stop = new Set([
    'the','and','for','with','that','this','from','your','you','are','was','were','have','has','had','will','just','sobre','para','con','una','uno','que','por','del','las','los','pero','como','más','muy','hoy','ayer','esto','esta','este','está','están','ser','sea','son','sus','nos','tus','mis','mi','tu','en','un','una','y','o','de','a','la','el','es'
  ]);
  const tokens = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4 && !stop.has(t));
  return tokens;
}

function topNFromCounts(counts, n) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function buildDailyInsightsCast(insights, followedAccounts) {
  const countsTags = new Map();
  const countsWords = new Map();
  const countsMentions = new Map();

  for (const it of insights.items) {
    const text = it?.text || '';
    for (const h of (it?.hashtags || [])) countsTags.set(h, (countsTags.get(h) || 0) + 1);
    for (const m of (it?.mentions || [])) countsMentions.set(m, (countsMentions.get(m) || 0) + 1);
    for (const w of extractKeywords(text)) countsWords.set(w, (countsWords.get(w) || 0) + 1);
  }

  const tags = topNFromCounts(countsTags, 3);
  const words = topNFromCounts(countsWords, 5);
  const mentions = topNFromCounts(countsMentions, 2);

  const topics = [...new Set([...tags, ...words.slice(0, 3)])].slice(0, 4);
  const sources = followedAccounts.map(a => `@${a.username}`).slice(0, 4).join(' ');

  const parts = [];
  parts.push('Daily FC pulse 🟣');
  if (topics.length) parts.push(`Topics: ${topics.join(' · ')}`);
  if (mentions.length) parts.push(`Mentions: ${mentions.join(' ')}`);
  if (sources) parts.push(`From: ${sources}`);

  return clampText(parts.join('\n'), 320);
}

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
    if (!CAN_USE_WRITES) return;
    const response = await neynarClient.post('/cast', {
      signer_uuid: SIGNER_UUID,
      text: text
    });

    const castHash = response.data?.cast?.hash || 'unknown';
    console.log(`✅ Cast publicado (${group}): https://warpcast.com/~/conversations/${castHash}`);
    logCast(group, text);

    // Persist last post time to avoid re-posting on restarts/deploys
    const state = loadState();
    state.last_post_ms = Date.now();
    saveState(state);
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

// 🎲 Variables para controlar el post aleatorio una vez por semana
const stateAtBoot = loadState();
let lastPostTime = typeof stateAtBoot.last_post_ms === 'number' ? stateAtBoot.last_post_ms : null;
const POST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos

// 🌈 Función para determinar el grupo de mensaje según la hora
function getMessageGroupByHour(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'noon';
  return 'evening';
}

// ⏰ Verificar si han pasado 7 días desde el último post
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

// 🕐 Ejecutar cada hora para verificar si pueden pasar 7 días y postear aleatoriamente
safeSchedule('0 * * * *', () => {
  // Solo continuar si han pasado 7 días
  if (!canPostNow()) {
    const hoursRemaining = Math.ceil((POST_INTERVAL_MS - (Date.now() - lastPostTime)) / (60 * 60 * 1000));
    console.log(`⏳ Esperando... Faltan ~${hoursRemaining}h para poder postear de nuevo.`);
    return;
  }

  // Decidir aleatoriamente si postear esta hora (probabilidad: ~1/4 por hora después de 7 días)
  const shouldPost = getRandomInt(1, 4) === 1;

  if (shouldPost) {
    const currentHour = new Date().getHours();
    const group = getMessageGroupByHour(currentHour);
    const msg = getRandomMessage(group);
    console.log(`🎲 Publicando cast aleatorio (${group}) después de 7 días...`);
    publishCast(msg, group);
    lastPostTime = Date.now();
    console.log(`✅ Cast realizado. Próximo cast disponible en 7 días.`);
  } else {
    console.log(`🎯 7 días cumplidos, pero esperando momento aleatorio para postear...`);
  }
});

// 🕛 23:59 cada día → verificar si es último día del mes y vaciar si sí
safeSchedule('59 23 * * *', () => {
  if (isLastDayOfMonth()) {
    console.log('🗓️ Último día del mes detectado — reiniciando historial y logs...');
    resetMonthlyHistory();
  } else {
    console.log('📅 No es el último día del mes, sin cambios.');
  }
});

console.log('🤖 Agente de Farcaster activo.');
console.log('📅 Casts: 1 vez cada 7 días a una hora aleatoria');
console.log('💚 Auto-engagement: 3 veces al día (9 AM, 3 PM, 9 PM) con cuentas rotativas');
console.log('🗓️ Archivado: Fin de cada mes a las 23:59 (hora Bogotá)');
console.log('🟣 Usando Neynar API para Warpcast/Farcaster');

if (FID && /^\d+$/.test(FID) && !SIGNER_UUID) {
  console.log('⚠️ Tu variable FID es numérica (ej: 13194). Para escribir (cast/like/recast) necesitas SIGNER_UUID (UUID de Neynar).');
}

if (!SIGNER_UUID) {
  CAN_USE_WRITES = false;
  CAN_USE_REACTIONS = false;
  console.log('⚠️ SIGNER_UUID no configurado/ inválido → deshabilitando casts + reactions (like/recast).');
  console.log('ℹ️ Configura SIGNER_UUID con el UUID de tu signer (formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).');
}

// 🚀 Post de prueba al desplegar (opcional)
const STARTUP_TEST_POST = (process.env.STARTUP_TEST_POST ?? '1') === '1';
const FORCE_STARTUP_TEST_POST = process.env.FORCE_STARTUP_TEST_POST === '1';

if (STARTUP_TEST_POST && CAN_USE_WRITES) {
  const canPost = FORCE_STARTUP_TEST_POST || canPostNow();
  if (canPost) {
    const hour = new Date().getHours();
    const group = getMessageGroupByHour(hour);
    const msg = getRandomMessage(group);
    console.log(`🚀 Startup post (${group}) para validar deploy...`);
    publishCast(msg, group).then(() => {
      lastPostTime = Date.now();
      // 🧠 Acoplado: disparar también el insights cast al iniciar
      if (INSIGHTS_ENABLED) {
        return runDailyInsightsCast(followedAccounts);
      }
    }).catch(err => {
      console.error('⚠️ Error en startup post acoplado:', err.response?.data?.message || err.message);
    });
  } else {
    console.log('ℹ️ Startup post omitido: aún no han pasado 7 días desde el último cast.');
  }
}

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
    { username: 'celocolombia', fid: 1371908 },
    { username: 'celo', fid: 3430 },
    { username: 'refimedellin', fid: 226645 }
  ];

  const INTERACTIONS_PATH = './interactions.json';

function getCastTimestampMs(cast) {
  const ts =
    cast?.timestamp ??
    cast?.created_at ??
    cast?.createdAt ??
    cast?.published_at ??
    cast?.publishedAt;

  if (typeof ts === 'number') {
    // seconds vs ms heuristic
    return ts > 1e12 ? ts : ts * 1000;
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

  // 🌐 Función para obtener casts usando Neynar API (¡gratis!)
  async function getUserCastsPage(fid, cursor) {
    try {
      const response = await neynarClient.get('/feed/user/casts', {
        params: {
          fid: fid,
          limit: CASTS_PAGE_SIZE,
          ...(cursor ? { cursor } : {})
        }
      });

      const casts = response.data?.casts || [];
      const nextCursor =
        response.data?.next?.cursor ??
        response.data?.next_cursor ??
        response.data?.cursor ??
        null;

      return { casts, nextCursor };
    } catch (err) {
      console.error(`⚠️ Error obteniendo casts del FID ${fid}:`, err.response?.data?.message || err.message);
      return { casts: [], nextCursor: null };
    }
  }

  async function getUserCastsSince(fid, cutoffMs) {
    const all = [];
    let cursor = null;
    let keepGoing = true;

    while (keepGoing && all.length < MAX_CASTS_REVIEW_PER_ACCOUNT) {
      const { casts, nextCursor } = await getUserCastsPage(fid, cursor);
      if (!casts.length) break;

      for (const cast of casts) {
        const ts = getCastTimestampMs(cast);
        if (ts !== null && ts < cutoffMs) {
          keepGoing = false;
          break;
        }
        all.push(cast);
        if (all.length >= MAX_CASTS_REVIEW_PER_ACCOUNT) break;
      }

      if (!keepGoing) break;
      if (!nextCursor) break;
      cursor = nextCursor;
    }

    return all;
  }

  async function refreshInsightsFromAccounts(accounts, storeCutoffMs) {
    const insights = loadInsights();
    const seen = new Set(insights.seen);

    for (const account of accounts) {
      const casts = await getUserCastsSince(account.fid, storeCutoffMs);
      for (const cast of casts) {
        const hash = normalizeCastHash(cast?.hash);
        if (!hash) continue;
        if (seen.has(hash)) continue;

        const text = typeof cast?.text === 'string' ? cast.text : '';
        const ts = getCastTimestampMs(cast) ?? Date.now();

        insights.items.push({
          hash,
          fid: account.fid,
          username: account.username,
          ts,
          text: clampText(text, 500),
          hashtags: extractHashtags(text),
          mentions: extractMentions(text)
        });
        seen.add(hash);
      }
    }

    // prune to last INSIGHTS_STORE_DAYS
    const cutoff = Date.now() - INSIGHTS_STORE_DAYS * 24 * 60 * 60 * 1000;
    insights.items = insights.items.filter(it => typeof it?.ts === 'number' && it.ts >= cutoff);
    // cap to keep file small
    insights.items = insights.items.slice(-5000);

    // rebuild seen from items (keeps it consistent)
    insights.seen = insights.items.map(it => it.hash);
    saveInsights(insights);
    return insights;
  }

  function ymdBogota() {
    // Stable daily key in Bogota time (fallback to local timezone if ICU/timezone data is missing)
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: BOT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch {
      return new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    }
  }

  async function runDailyInsightsCast(accounts) {
    if (!INSIGHTS_ENABLED) return;
    if (!NEYNAR_API_KEY) return;

    const state = loadState();
    const today = ymdBogota();
    if (state.last_insights_post_ymd === today) {
      console.log('ℹ️ Daily insights cast ya fue publicado hoy, saltando...');
      return;
    }

    const storeCutoffMs = Date.now() - INSIGHTS_STORE_DAYS * 24 * 60 * 60 * 1000;
    const insights = await refreshInsightsFromAccounts(accounts, storeCutoffMs);

    const sinceMs = Date.now() - INSIGHTS_DAYS * 24 * 60 * 60 * 1000;
    const window = { items: insights.items.filter(it => typeof it?.ts === 'number' && it.ts >= sinceMs) };

    console.log(`📊 Insights: ${insights.items.length} casts totales, ${window.items.length} en ventana de ${INSIGHTS_DAYS} día(s)`);

    if (!window.items.length) {
      console.log('ℹ️ No hay suficientes insights para generar un cast. No se publicará post de Insights hoy.');
      console.log('💡 El bot esperará hasta mañana para intentar nuevamente.');
      state.last_insights_post_ymd = today;
      saveState(state);
      return;
    }

    // Log extracted insights
    const countsTags = new Map();
    const countsWords = new Map();
    const countsMentions = new Map();

    for (const it of window.items) {
      const text = it?.text || '';
      for (const h of (it?.hashtags || [])) countsTags.set(h, (countsTags.get(h) || 0) + 1);
      for (const m of (it?.mentions || [])) countsMentions.set(m, (countsMentions.get(m) || 0) + 1);
      for (const w of extractKeywords(text)) countsWords.set(w, (countsWords.get(w) || 0) + 1);
    }

    const topTags = topNFromCounts(countsTags, 5);
    const topWords = topNFromCounts(countsWords, 5);
    const topMentions = topNFromCounts(countsMentions, 5);

    console.log('🧠 Insights encontrados:');
    if (topTags.length) console.log(`   📌 Top hashtags: ${topTags.join(', ')}`);
    if (topWords.length) console.log(`   💬 Top palabras: ${topWords.join(', ')}`);
    if (topMentions.length) console.log(`   👤 Top menciones: ${topMentions.join(', ')}`);

    const text = buildDailyInsightsCast(window, accounts);
    console.log(`✍️ Cast generado: "${text}"`);
    console.log('🧠 Publicando weekly insights cast...');
    await publishCast(text, 'insights');

    state.last_insights_post_ymd = today;
    state.last_insights_post_ms = Date.now();
    saveState(state);
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
    const cutoffMs = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const maxActions = MAX_ACTIONS_PER_RUN > 0 ? MAX_ACTIONS_PER_RUN : Number.POSITIVE_INFINITY;

    try {
      // 🔍 Usar Neynar API para obtener casts
      console.log(`🔍 Obteniendo casts del FID ${account.fid} (@${account.username})...`);
      const casts = await getUserCastsSince(account.fid, cutoffMs);

      if (casts.length === 0) {
        console.log(`ℹ️ No se encontraron casts de @${account.username}`);
        return;
      }

      console.log(`✅ Encontrados ${casts.length} casts de @${account.username}`);

      // 💚 Interactuar con cada cast usando Neynar API
      let successCount = 0;
      for (const cast of casts) {
        const castHash = normalizeCastHash(cast.hash);

        if (!castHash) {
          console.log(`⚠️ Cast con hash inválido, saltando...`);
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
            if (!CAN_USE_REACTIONS) {
              // Skip if reactions are not available on the current plan/key
              continue;
            }
            await neynarClient.post('/reaction', {
              signer_uuid: SIGNER_UUID,
              reaction_type: 'like',
              target: castHash
            });
            console.log(`💛 Like a cast de @${account.username}: ${castHash.substring(0, 10)}...`);
            interactions.liked.unshift(castHash);
            successCount++;
            if (successCount >= maxActions) {
              console.log(`✅ Límite de ${maxActions} acciones alcanzado, finalizando...`);
              break;
            }
            await wait(ACTION_DELAY_MS);
          } catch (err) {
            const errorMsg = err.response?.data?.message || err.message;

            if (typeof errorMsg === 'string' && errorMsg.toLowerCase().includes('upgrade to a paid plan')) {
              CAN_USE_REACTIONS = false;
              console.log('⚠️ Reactions (like/recast) no disponibles en tu plan de Neynar. Saltando reacciones para evitar spam.');
            }

            if (errorMsg === 'Invalid body parameters') {
              console.log('ℹ️ Detalle error (reaction like):', JSON.stringify(err.response?.data ?? {}, null, 2));
            }

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

        // 🔁 Recast (reaction)
        if (!alreadyRecasted) {
          try {
            if (!CAN_USE_REACTIONS) {
              continue;
            }
            await neynarClient.post('/reaction', {
              signer_uuid: SIGNER_UUID,
              reaction_type: 'recast',
              target: castHash
            });
            console.log(`🔁 Recast de @${account.username}: ${castHash.substring(0, 10)}...`);
            interactions.recasted.unshift(castHash);
            successCount++;
            if (successCount >= maxActions) {
              console.log(`✅ Límite de ${maxActions} acciones alcanzado, finalizando...`);
              break;
            }
            await wait(ACTION_DELAY_MS);
          } catch (err) {
            const errorMsg = err.response?.data?.message || err.message;

            if (typeof errorMsg === 'string' && errorMsg.toLowerCase().includes('upgrade to a paid plan')) {
              CAN_USE_REACTIONS = false;
              console.log('⚠️ Reactions (like/recast) no disponibles en tu plan de Neynar. Saltando reacciones para evitar spam.');
            }

            if (errorMsg === 'Invalid body parameters') {
              console.log('ℹ️ Detalle error (reaction recast):', JSON.stringify(err.response?.data ?? {}, null, 2));
            }

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

  let engagementInProgress = false;

  async function engageAllAccounts(label) {
    if (engagementInProgress) {
      console.log('⏳ Engagement ya en progreso, saltando esta ejecución...');
      return;
    }
    engagementInProgress = true;
    try {
      console.log(label);
      for (const account of followedAccounts) {
        await engageWithAccount(account);
      }
    } finally {
      engagementInProgress = false;
    }
  }

  // 🧠 Weekly insights cast — corre diario a INSIGHTS_HOUR, pero solo publica si:
  //    - El random cast ya se publicó al menos una vez (lastPostTime existe)
  //    - Pasaron al menos INSIGHTS_OFFSET_DAYS desde el último random cast (mitad del intervalo)
  //    - Pasaron al menos 6 días desde el último insights cast (evita doble disparo)
  safeSchedule(`0 ${INSIGHTS_HOUR} * * *`, () => {
    if (!INSIGHTS_ENABLED) return;

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    if (lastPostTime === null) {
      console.log('🧠 Insights: esperando primer random cast antes de publicar.');
      return;
    }

    const daysSinceRandom = (now - lastPostTime) / DAY_MS;
    if (daysSinceRandom < INSIGHTS_OFFSET_DAYS) {
      const remaining = (INSIGHTS_OFFSET_DAYS - daysSinceRandom).toFixed(1);
      console.log(`🧠 Insights: faltan ~${remaining}d desde el último random cast.`);
      return;
    }

    const state = loadState();
    const lastInsightsMs = typeof state.last_insights_post_ms === 'number' ? state.last_insights_post_ms : 0;
    const daysSinceInsights = (now - lastInsightsMs) / DAY_MS;
    if (daysSinceInsights < 6) {
      console.log(`🧠 Insights: ya posteado hace ~${daysSinceInsights.toFixed(1)}d, esperando.`);
      return;
    }

    console.log(`🧠 Disparando weekly insights cast (mitad de intervalo, ${INSIGHTS_HOUR}:00 Bogotá)...`);
    runDailyInsightsCast(followedAccounts).catch(err => {
      console.error('⚠️ Error generando insights cast:', err.response?.data?.message || err.message);
    });
  });


  // 🌅 Mañana (9:00 AM) - Revisar cuenta aleatoria
  safeSchedule('0 9 * * *', () => {
    if (NEYNAR_API_KEY) {
      engageAllAccounts('🌅 Auto-engagement matutino (sweep de cuentas)...');
    } else {
      console.log('⚠️ Auto-engagement saltado: NEYNAR_API_KEY no configurado');
    }
  });

  // ☀️ Tarde (3:00 PM) - Revisar cuenta aleatoria
  safeSchedule('0 15 * * *', () => {
    if (NEYNAR_API_KEY) {
      engageAllAccounts('☀️ Auto-engagement vespertino (sweep de cuentas)...');
    } else {
      console.log('⚠️ Auto-engagement saltado: NEYNAR_API_KEY no configurado');
    }
  });

  // 🌙 Noche (9:00 PM) - Revisar cuenta aleatoria
  safeSchedule('0 21 * * *', () => {
    if (NEYNAR_API_KEY) {
      engageAllAccounts('🌙 Auto-engagement nocturno (sweep de cuentas)...');
    } else {
      console.log('⚠️ Auto-engagement saltado: NEYNAR_API_KEY no configurado');
    }
  });

  // 🚀 Ejecutar auto-engagement inmediatamente al iniciar (para testing)
  if (NEYNAR_API_KEY) {
    engageAllAccounts('🚀 Ejecutando auto-engagement inicial (sweep de cuentas)...').catch(err => {
      console.error('⚠️ Error en auto-engagement inicial:', err.message);
    });
  } else {
    console.log('⚠️ NEYNAR_API_KEY no configurado. Auto-engagement deshabilitado.');
    console.log('ℹ️ Para habilitar auto-engagement, añade NEYNAR_API_KEY a las variables de entorno.');
  }
