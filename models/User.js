const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  tgId: { type: Number, unique: true, required: true },
  username: String,
  balance: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },
  referredBy: { type: Number, default: null },
  lastBonus: { type: Date, default: null },
  isJoined: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);
