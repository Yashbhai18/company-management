require('dotenv').config();
const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI;

const UserSchema = new mongoose.Schema({
  email: String,
  role: String,
  name: String
}, { collection: 'users' });

const User = mongoose.model('User', UserSchema);

async function check() {
  try {
    await mongoose.connect(uri);
    console.log('Connected');
    const users = await User.find({ email: 'natu@gmail.com' });
    users.forEach(u => console.log(`EMAIL: ${u.email} | ROLE: ${u.role}`));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
