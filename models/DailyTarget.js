const mongoose = require('mongoose');

const dailyTargetSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    unique: true
  },
  target: {
    type: Number,
    required: true,
    default: 0
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

module.exports = mongoose.model('DailyTarget', dailyTargetSchema);
