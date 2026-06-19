require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function reset() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('Connected to DB');
  
  const hash = await bcrypt.hash('Password123', 12);
  
  const User = mongoose.model('User', new mongoose.Schema({
    email: String,
    passwordHash: String
  }, { collection: 'users' }));
  
  const res = await User.updateMany({ email: 'natu@gmail.com' }, { $set: { passwordHash: hash } });
  console.log('Updated counts:', res);
  process.exit(0);
}

reset();
