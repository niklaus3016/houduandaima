const mongoose = require('mongoose');

const lotterySettingsSchema = new mongoose.Schema({
  poolPercentage: {
    type: Number,
    default: 0.025,
    required: true
  },
  drawTime: {
    type: String,
    default: '22:00',
    required: true
  },
  adCountThreshold: {
    type: Number,
    default: 100,
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  firstPrizePercentage: {
    type: Number,
    default: 0.5,
    required: true
  },
  secondPrizePercentage: {
    type: Number,
    default: 0.3,
    required: true
  },
  thirdPrizePercentage: {
    type: Number,
    default: 0.2,
    required: true
  },
  firstPrizeCount: {
    type: Number,
    default: 1,
    required: true
  },
  secondPrizeCount: {
    type: Number,
    default: 1,
    required: true
  },
  thirdPrizeCount: {
    type: Number,
    default: 1,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 自动更新updatedAt字段
lotterySettingsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const LotterySettings = mongoose.model('LotterySettings', lotterySettingsSchema);

module.exports = LotterySettings;