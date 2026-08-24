const mongoose = require('mongoose');

const welfareLotteryRecordSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  prizeId: {
    type: String,
    required: true
  },
  prizeName: {
    type: String,
    required: true
  },
  prizeValue: {
    type: Number,
    required: true
  },
  prizeType: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 添加索引优化查询性能
welfareLotteryRecordSchema.index({ employeeId: 1 });
welfareLotteryRecordSchema.index({ employeeId: 1, createdAt: -1 });

module.exports = mongoose.model('WelfareLotteryRecord', welfareLotteryRecordSchema);