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
  }
});

module.exports = mongoose.model('UserGold', userGoldSchema);
