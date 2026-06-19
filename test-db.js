require('dotenv').config();
const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("MONGODB_URI is not defined in environment variables");
    process.exit(1);
}
mongoose.connect(uri).then(() => {
    console.log("Connected successfully");
    process.exit(0);
}).catch(err => {
    console.error("Connection error:", err);
    process.exit(1);
});
