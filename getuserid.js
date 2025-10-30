import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
dotenv.config();

const client = new TwitterApi({
  appKey: process.env.TWITTER_APP_KEY,
  appSecret: process.env.TWITTER_APP_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// 🧠 Lista de usernames sin el "@"
const usernames = ['celo_col', 'refimedellin', 'medellinblock', '0xj4an']; // puedes agregar más

(async () => {
  try {
    const result = await client.v2.usersByUsernames(usernames);
    console.log('✅ IDs encontrados:\n');
    for (const user of result.data) {
      console.log(`@${user.username} → ${user.id}`);
    }
  } catch (error) {
    console.error('❌ Error obteniendo userIds:', error);
  }
})();