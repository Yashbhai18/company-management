const mongoose = require('mongoose');

const uri = 'mongodb://ThinkX:11006618@ac-oegcwrk-shard-00-01.ytwfy5a.mongodb.net:27017/jibble_clone?ssl=true&authSource=admin&directConnection=true';

async function check() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to DB');
    
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const Org = mongoose.model('Organization', new mongoose.Schema({}, { strict: false, collection: 'organizations' }));
    
    const users = await User.find({});
    console.log(`Found ${users.length} users in total:`);
    for (const u of users) {
      const org = await Org.findById(u.get('orgId'));
      console.log(`ID: ${u._id} | Name: ${u.get('name')} | Email: ${u.get('email')} | Role: ${u.get('role')} | Org: ${org ? org.get('name') : 'None'} (${org ? org.get('slug') : 'None'})`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
