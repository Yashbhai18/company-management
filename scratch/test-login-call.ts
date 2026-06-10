const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const uri = 'mongodb://ThinkX:11006618@ac-oegcwrk-shard-00-01.ytwfy5a.mongodb.net:27017/jibble_clone?ssl=true&authSource=admin&directConnection=true';

// Setup schemas/models to mock the structure for TypeScript transpilation
// But wait, we can just load the compiled TS/JS or we can write a clean script that uses ts-node or load models directly.
// Let's use ts-node to run a typescript script!
// Let's write a TypeScript script and run it using npx ts-node.
