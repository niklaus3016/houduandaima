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

module.exports = mongoose.model('WeeklyBonusClaim', weeklyBonusClaimSchema);
