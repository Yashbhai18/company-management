const mongoose = require('mongoose');

async function run() {
  const uri = 'mongodb://ThinkX:11006618@ac-oegcwrk-shard-00-01.ytwfy5a.mongodb.net:27017/jibble_clone?ssl=true&authSource=admin&directConnection=true';
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri);
    console.log('MongoDB Atlas Connected!');
    
    const orgs = await mongoose.connection.db.collection('organizations').find({}).toArray();
    console.log('\n--- ORGANIZATIONS ---');
    orgs.forEach(o => console.log(`ID: ${o._id}, Name: ${o.name}, Slug: ${o.slug}`));
    
    const users = await mongoose.connection.db.collection('users').find({}).toArray();
    console.log('\n--- USERS ---');
    users.forEach(u => {
      const o = orgs.find(x => x._id.toString() === u.orgId?.toString());
      console.log(`ID: ${u._id}, Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, Org: ${o ? o.name : 'Unknown'}`);
    });
    
    await mongoose.disconnect();
    console.log('Disconnected.');
  } catch (e) {
    console.error('Error:', e);
  }
}

run();
