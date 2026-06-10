const mongoose = require('mongoose');

async function run() {
  const uri = 'mongodb://ThinkX:11006618@ac-oegcwrk-shard-00-01.ytwfy5a.mongodb.net:27017/jibble_clone?ssl=true&authSource=admin&directConnection=true';
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri);
    console.log('Connected!');
    
    // Locate specific target User ID: 6a0458a04962911a8b86a71f (Natu kaka, employee, Org: coffee)
    const targetId = '6a0458a04962911a8b86a71f';
    
    const check = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(targetId) });
    if (!check) {
      console.error(`Target record ${targetId} not found in database!`);
      await mongoose.disconnect();
      return;
    }
    
    console.log(`Found record to remove: Name=${check.name}, Role=${check.role}, OrgId=${check.orgId}`);
    
    const result = await mongoose.connection.db.collection('users').deleteOne({ _id: new mongoose.Types.ObjectId(targetId) });
    console.log(`Deletion result: ${result.deletedCount} document(s) deleted successfully!`);
    
    await mongoose.disconnect();
    console.log('Disconnected safely.');
  } catch (e) {
    console.error('Deletion Error:', e);
  }
}

run();
