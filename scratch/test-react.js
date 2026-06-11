const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/attendance-tracker';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const { Message } = require('../server/src/models/Message');

  // Find any message
  const msg = await Message.findOne();
  if (!msg) {
    console.log('No messages found');
    process.exit(0);
  }

  console.log('Original message reactions:', JSON.stringify(msg.reactions));

  // Try to toggle a reaction
  const userId = new mongoose.Types.ObjectId(); // mock user
  const emoji = '👍';

  if (!msg.reactions) msg.reactions = [];

  // Toggle logic
  let toggledOffSameEmoji = false;
  msg.reactions.forEach((r) => {
    const userIdx = r.userIds.findIndex((uid) => uid.toString() === userId.toString());
    if (userIdx > -1) {
      if (r.emoji === emoji) {
        toggledOffSameEmoji = true;
      }
      r.userIds.splice(userIdx, 1);
    }
  });

  msg.reactions = msg.reactions.filter((r) => r.userIds.length > 0);

  if (!toggledOffSameEmoji) {
    const targetReaction = msg.reactions.find((r) => r.emoji === emoji);
    if (!targetReaction) {
      msg.reactions.push({ emoji, userIds: [userId] });
    } else {
      targetReaction.userIds.push(userId);
    }
  }

  msg.markModified('reactions');
  try {
    await msg.save();
    console.log('Saved successfully!');
    const updated = await Message.findById(msg._id);
    console.log('Updated message reactions:', JSON.stringify(updated.reactions));
  } catch (err) {
    console.error('Save error:', err);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
