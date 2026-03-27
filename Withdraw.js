const mongoose = require('mongoose');

const withdrawSchema = new mongoose.Schema({
  tgId: Number,
  amount: Number,
  method: String,
  address: String,
  status: { type: String, default: 'Pending' }, // Pending, Approved, Rejected
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Withdraw', withdrawSchema);
