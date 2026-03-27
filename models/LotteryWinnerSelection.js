const mongoose = require('mongoose');

const lotteryWinnerSelectionSchema = new mongoose.Schema({
  issueNumber: {
    type: String,
    required: true,
    unique: true
  },
  firstPrizeUserId: {
    type: String
  },
  secondPrizeUserId: {
    type: String
  },
  thirdPrizeUserId: {
    type: String
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

// 自动更新updatedAt字段
lotteryWinnerSelectionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const LotteryWinnerSelection = mongoose.model('LotteryWinnerSelection', lotteryWinnerSelectionSchema);

module.exports = LotteryWinnerSelection;