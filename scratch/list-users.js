const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const users = await mongoose.connection.db.collection('users').find().toArray();
  console.log('Users found:', users.length);
  users.forEach(u => {
    console.log(`Name: ${u.name} | Email: ${u.email} | Username: ${u.username} | Role: ${u.role} | 2FA: ${u.is2faEnabled}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
