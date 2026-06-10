const mongoose = require('mongoose');

const uri = 'mongodb://ThinkX:11006618@ac-oegcwrk-shard-00-01.ytwfy5a.mongodb.net:27017/jibble_clone?ssl=true&authSource=admin&directConnection=true';

async function check() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to DB');
    
    // We'll read the users collection dynamically
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const Org = mongoose.model('Organization', new mongoose.Schema({}, { strict: false, collection: 'organizations' }));
    
    const users = await User.find({ email: /yashindia06/i });
    console.log(`Found ${users.length} users:`);
    for (const u of users) {
      const org = await Org.findById(u.get('orgId'));
      console.log({
        id: u._id,
        name: u.get('name'),
        email: u.get('email'),
        username: u.get('username'),
        role: u.get('role'),
        isActive: u.get('isActive'),
        passwordHash: u.get('passwordHash'),
        orgName: org ? org.get('name') : null,
        orgSlug: org ? org.get('slug') : null,
      });
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
