const mongoose = require('mongoose');

const weeklyBonusClaimSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  week: {
    type: String,
    required: true
  },
  bonusGold: {
    type: Number,
    required: true
  },
  claimedAt: {
    type: Date,
    default: Date.now
  }
});

// 性能：保底模块 isClaimed 检查走这个复合索引，避免全表扫描
weeklyBonusClaimSchema.index({ userId: 1, employeeId: 1, week: 1 });

module.exports = mongoose.model('WeeklyBonusClaim', weeklyBonusClaimSchema);
