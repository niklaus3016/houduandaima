const mongoose = require('mongoose');

const welfareWalletSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  employeeId: {
    type: String,
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0
  },
  chances: {
    type: Number,
    default: 0
  },
  alipayName: {
    type: String,
    default: ''
  },
  alipayAccount: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('WelfareWallet', welfareWalletSchema);
