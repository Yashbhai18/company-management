const mongoose = require('mongoose');
const uri = "mongodb://ThinkX:11006618@ac-oegcwrk-shard-00-00.ytwfy5a.mongodb.net:27017,ac-oegcwrk-shard-00-01.ytwfy5a.mongodb.net:27017,ac-oegcwrk-shard-00-02.ytwfy5a.mongodb.net:27017/jibble_clone?ssl=true&replicaSet=atlas-oegcwrk-shard-0&authSource=admin";
mongoose.connect(uri).then(() => {
    console.log("Connected successfully");
    process.exit(0);
}).catch(err => {
    console.error("Connection error:", err);
    process.exit(1);
});
