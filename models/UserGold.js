const mongoose = require('mongoose');

const userGoldSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  employeeId: {
    type: String,
    required: true
  },
  currentMonthGold: {
    type: Number,
    default: 0
  },
  lastMonthGold: {
    type: Number,
    default: 0
  },
  lastClaimedBonusDate: {
    type: String,
    default: ''
  },
  adCount: {
    type: Number,
    default: 0
  }
});

// 添加索引优化查询性能
userGoldSchema.index({ employeeId: 1 });
userGoldSchema.index({ userId: 1, employeeId: 1 });

module.exports = mongoose.model('UserGold', userGoldSchema);
