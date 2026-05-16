import axios from 'axios';
import { spawn } from 'child_process';

const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN;
const PROJECT_ID = 'a50a2407-c59c-4593-a92c-7ce805eafe00';
const ENVIRONMENT_ID = '467647ba-9ad0-43df-8ad7-da08b306ff04';
const SERVICE_ID = '558d3e79-1bd4-46a8-8d6c-e398cc020fb4';

if (!RAILWAY_API_TOKEN) {
  console.error('❌ Falta RAILWAY_API_TOKEN en el entorno.');
  console.error('   Uso: RAILWAY_API_TOKEN=<token> node cleanup_via_railway.js [--delete]');
  process.exit(1);
}

async function fetchRailwayVars() {
  const { data } = await axios.post(
    'https://backboard.railway.app/graphql/v2',
    {
      query: 'query($p: String!, $e: String!, $s: String!) { variables(projectId: $p, environmentId: $e, serviceId: $s) }',
      variables: { p: PROJECT_ID, e: ENVIRONMENT_ID, s: SERVICE_ID }
    },
    { headers: { Authorization: `Bearer ${RAILWAY_API_TOKEN}` } }
  );
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data.variables || {};
}

(async () => {
  console.log('🚂 Fetcheando env vars desde Railway (fc-agent / farecaster_agent)...');
  const vars = await fetchRailwayVars();
  const required = ['NEYNAR_API_KEY', 'SIGNER_UUID', 'FID'];
  const missing = required.filter(k => !vars[k]);
  if (missing.length) {
    console.error('❌ Faltan vars en Railway:', missing.join(', '));
    process.exit(1);
  }
  console.log(`✅ Variables obtenidas (FID=${vars.FID})`);
  console.log('');

  const args = process.argv.slice(2);
  const child = spawn('node', ['cleanup_casts.js', ...args], {
    env: {
      ...process.env,
      NEYNAR_API_KEY: vars.NEYNAR_API_KEY,
      SIGNER_UUID: vars.SIGNER_UUID,
      FID: vars.FID
    },
    stdio: 'inherit',
    cwd: import.meta.dirname
  });
  child.on('exit', code => process.exit(code ?? 0));
})().catch(err => {
  console.error('💥 Error:', err?.response?.data ?? err.message);
  process.exit(1);
});
