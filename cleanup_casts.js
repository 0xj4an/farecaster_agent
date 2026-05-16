import axios from 'axios';
import fs from 'fs';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const SIGNER_UUID = process.env.SIGNER_UUID;
const FID = process.env.FID;

if (!NEYNAR_API_KEY || !SIGNER_UUID || !FID) {
  console.error('❌ Falta NEYNAR_API_KEY, SIGNER_UUID o FID en .env');
  process.exit(1);
}

const DELETE_MODE = process.argv.includes('--delete');
const PAGE_SIZE = 150;
const DELETE_DELAY_MS = 500;
const INSIGHTS_PREFIX = 'Daily FC pulse';

const client = axios.create({
  baseURL: 'https://api.neynar.com/v2/farcaster',
  headers: { api_key: NEYNAR_API_KEY, 'Content-Type': 'application/json' }
});

function loadBotMessageSet() {
  const data = JSON.parse(fs.readFileSync('./messages.json', 'utf8'));
  const set = new Set();
  for (const group of Object.keys(data)) {
    for (const msg of data[group]) set.add(msg);
  }
  return set;
}

function isReply(cast) {
  return Boolean(cast?.parent_hash || cast?.parent_author?.fid);
}

function isBotPost(cast, botMessages) {
  const text = (cast?.text || '').trim();
  if (!text) return false;
  if (text.startsWith(INSIGHTS_PREFIX)) return true;
  return botMessages.has(text);
}

function getLikesCount(cast) {
  return cast?.reactions?.likes_count ?? cast?.reactions?.likes?.length ?? 0;
}

async function fetchAllCasts() {
  const all = [];
  let cursor = null;
  let page = 0;
  while (true) {
    page++;
    const params = { fid: FID, limit: PAGE_SIZE };
    if (cursor) params.cursor = cursor;
    const { data } = await client.get('/feed/user/casts', { params });
    const casts = data?.casts || [];
    all.push(...casts);
    console.log(`📥 Página ${page}: ${casts.length} casts (total acumulado: ${all.length})`);
    cursor = data?.next?.cursor ?? data?.next_cursor ?? data?.cursor ?? null;
    if (!cursor || casts.length === 0) break;
    await new Promise(r => setTimeout(r, 200));
  }
  return all;
}

async function deleteCast(hash) {
  return client.delete('/cast', {
    data: { signer_uuid: SIGNER_UUID, target_hash: hash }
  });
}

(async () => {
  console.log(`🧹 Cleanup casts (FID=${FID})`);
  console.log(`🔒 Modo: ${DELETE_MODE ? '⚠️  DELETE (borra de verdad)' : '🟢 DRY-RUN (no borra nada)'}`);
  console.log('');

  const botMessages = loadBotMessageSet();
  console.log(`📚 Mensajes conocidos del bot (messages.json): ${botMessages.size}`);

  const all = await fetchAllCasts();
  console.log('');
  console.log(`📊 Total de casts del FID ${FID}: ${all.length}`);

  const replies = all.filter(isReply);
  const topLevel = all.filter(c => !isReply(c));
  const botPosts = topLevel.filter(c => isBotPost(c, botMessages));
  const manual = topLevel.filter(c => !isBotPost(c, botMessages));
  const toDelete = botPosts.filter(c => getLikesCount(c) === 0);
  const keep = botPosts.filter(c => getLikesCount(c) > 0);

  console.log(`   ↳ Replies (excluidos): ${replies.length}`);
  console.log(`   ↳ Top-level manuales (excluidos): ${manual.length}`);
  console.log(`   ↳ Top-level del bot: ${botPosts.length}`);
  console.log(`      ↳ 💚 con ≥1 like (se conservan): ${keep.length}`);
  console.log(`      ↳ 💀 con 0 likes (a borrar): ${toDelete.length}`);
  console.log('');

  if (toDelete.length === 0) {
    console.log('✅ Nada que borrar. Listo.');
    return;
  }

  console.log('🔍 Preview de los primeros 10 a borrar:');
  for (const c of toDelete.slice(0, 10)) {
    const ts = c.timestamp ? new Date(c.timestamp).toISOString().slice(0, 10) : '????-??-??';
    const txt = (c.text || '').replace(/\s+/g, ' ').slice(0, 60);
    console.log(`   ${ts} | ${c.hash.slice(0, 12)} | ${txt}`);
  }
  console.log('');

  if (!DELETE_MODE) {
    console.log('ℹ️ Esto fue un dry-run. Para borrar de verdad, corré:');
    console.log('   node --env-file=.env cleanup_casts.js --delete');
    return;
  }

  console.log(`⚠️  Borrando ${toDelete.length} casts en 5 segundos... (Ctrl+C para cancelar)`);
  await new Promise(r => setTimeout(r, 5000));

  let ok = 0, fail = 0;
  for (let i = 0; i < toDelete.length; i++) {
    const c = toDelete[i];
    try {
      await deleteCast(c.hash);
      ok++;
      console.log(`  ✅ [${i + 1}/${toDelete.length}] borrado ${c.hash.slice(0, 12)}`);
    } catch (err) {
      fail++;
      const detail = err?.response?.data ?? err.message;
      console.error(`  ❌ [${i + 1}/${toDelete.length}] error ${c.hash.slice(0, 12)}:`, typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    if (i < toDelete.length - 1) await new Promise(r => setTimeout(r, DELETE_DELAY_MS));
  }

  console.log('');
  console.log(`🎉 Listo. Borrados: ${ok}, fallidos: ${fail}.`);
})().catch(err => {
  console.error('💥 Error fatal:', err?.response?.data ?? err.message);
  process.exit(1);
});
