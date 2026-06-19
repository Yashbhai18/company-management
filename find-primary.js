require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || '';
const credentialsMatch = uri.match(/mongodb:\/\/(.*?@)/);
const credentials = credentialsMatch ? credentialsMatch[1] : '';

const hosts = [
  'ac-oegcwrk-shard-00-00.ytwfy5a.mongodb.net',
  'ac-oegcwrk-shard-00-01.ytwfy5a.mongodb.net',
  'ac-oegcwrk-shard-00-02.ytwfy5a.mongodb.net'
];

async function findPrimary() {
  for (const host of hosts) {
    try {
      const singleUri = `mongodb://${credentials}${host}:27017/jibble_clone?ssl=true&authSource=admin&directConnection=true`;
      console.log(`Connecting to ${host}...`);
      const conn = await mongoose.createConnection(singleUri).asPromise();
      const adminDb = conn.db.admin();
      const info = await adminDb.command({ hello: 1 });
      if (info.isWritablePrimary) {
        console.log(`\nFound Primary: ${host}`);
        process.exit(0);
      } else {
        console.log(`${host} is Secondary`);
      }
      await conn.close();
    } catch (err) {
      console.log(`Failed on ${host}: ${err.message}`);
    }
  }
  console.log('No primary found');
  process.exit(1);
}

findPrimary();
