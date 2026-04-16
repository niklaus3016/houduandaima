const mongoose = require('mongoose');

const weeklyTargetSchema = new mongoose.Schema({
  week: {
    type: String,
    required: true
  },
  targetCount: {
    type: Number,
    required: true
  },
  bonusGold: {
    type: Number,
    default: 0
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

module.exports = mongoose.model('WeeklyTarget', weeklyTargetSchema);
