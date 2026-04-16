const mongoose = require('mongoose');

const welfareWithdrawSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  alipayAccount: {
    type: String,
    required: true
  },
  alipayName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    default: 'processing',
    enum: ['processing', 'completed', 'failed']
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

module.exports = mongoose.model('WelfareWithdraw', welfareWithdrawSchema);
