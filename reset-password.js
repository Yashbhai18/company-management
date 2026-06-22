require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function reset() {
  const password = process.argv[2];
  if (!password) {
    console.error('Error: Please specify the new password as a command line argument.');
    console.error('Example: node reset-password.js MyNewSecurePassword123!');
    process.exit(1);
  }

  // Validate password strength according to the custom security policy
  if (password.length < 8 || password.length > 12) {
    console.error('Error: Password must be between 8 and 12 characters.');
    process.exit(1);
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    console.error('Error: Password must contain uppercase, lowercase, numbers, and special symbols.');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('Connected to DB');
  
  const hash = await bcrypt.hash(password, 12);
  
  const User = mongoose.model('User', new mongoose.Schema({
    email: String,
    passwordHash: String
  }, { collection: 'users' }));
  
  const res = await User.updateMany({}, { $set: { passwordHash: hash } });
  console.log('Updated counts:', res);
  process.exit(0);
}

reset();
