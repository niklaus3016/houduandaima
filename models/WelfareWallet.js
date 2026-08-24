const mongoose = require('mongoose');

const welfareWalletSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: false
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
  // 今日广告观看数
  todayAdCount: {
    type: Number,
    default: 0
  },
  // 已发放的抽奖机会对应的广告阈值（避免重复发放）
  lastAwardedThresholdIndex: {
    type: Number,
    default: -1
  },
  // 计数日期（用于判断是否需要重置）
  countDate: {
    type: String,
    default: ''
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

// 添加索引优化查询性能
welfareWalletSchema.index({ employeeId: 1 });
welfareWalletSchema.index({ userId: 1 });

// 自动更新updatedAt字段
welfareWalletSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('WelfareWallet', welfareWalletSchema);