const mongoose = require('mongoose');

const welfareSettingsSchema = new mongoose.Schema({
  // 阈值配置
  thresholds: {
    type: Array,
    default: [
      { adCount: 1000, giveChances: 1 },
      { adCount: 2000, giveChances: 2 },
      { adCount: 3000, giveChances: 3 }
    ]
  },
  // 每日广告计数重置日期
  resetDate: {
    type: String,
    default: ''
  },
  // 最后更新时间
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 自动更新updatedAt字段
welfareSettingsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const WelfareSettings = mongoose.model('WelfareSettings', welfareSettingsSchema);

module.exports = WelfareSettings;
