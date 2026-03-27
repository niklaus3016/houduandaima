const mongoose = require('mongoose');

const lotteryPoolSchema = new mongoose.Schema({
  currentAmount: {
    type: Number,
    default: 0,
    required: true
  },
  totalAmount: {
    type: Number,
    default: 0,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  lastDrawTime: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 自动更新lastUpdated字段
lotteryPoolSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

const LotteryPool = mongoose.model('LotteryPool', lotteryPoolSchema);

module.exports = LotteryPool;