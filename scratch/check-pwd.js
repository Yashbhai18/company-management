const bcrypt = require('bcryptjs');

const hash = '$2b$12$sxFcCQQxhxVDYZ1M7FJYweExz33lsxvTFaJelRQYVaSUweoCQL2de';

async function check() {
  const match1 = await bcrypt.compare('Password123', hash);
  console.log('Password123 matches:', match1);
  const match2 = await bcrypt.compare('password', hash);
  console.log('password matches:', match2);
  const match3 = await bcrypt.compare('admin', hash);
  console.log('admin matches:', match3);
  const match4 = await bcrypt.compare('12345678', hash);
  console.log('12345678 matches:', match4);
}

check();
