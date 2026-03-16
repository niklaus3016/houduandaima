const mongoose = require('mongoose');

const dailyBonusClaimSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  date: {
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
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

dailyBonusClaimSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyBonusClaim', dailyBonusClaimSchema);
