const mongoose = require('mongoose');

const withdrawRecordSchema = new mongoose.Schema({
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
  goldAmount: {
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
    type: Number,
    default: 0
  },
  statusText: {
    type: String,
    default: '提现成功'
  },
  createTime: {
    type: Date,
    default: Date.now
  },
  type: {
    type: String,
    default: 'employee'
  }
});

withdrawRecordSchema.index({ userId: 1, createTime: -1 });

module.exports = mongoose.model('WithdrawRecord', withdrawRecordSchema);