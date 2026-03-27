const mongoose = require('mongoose');

const lotteryHistorySchema = new mongoose.Schema({
  issueNumber: {
    type: String,
    required: true,
    unique: true
  },
  date: {
    type: String,
    default: function() {
      return this.issueNumber;
    }
  },
  drawTime: {
    type: Date,
    required: true
  },
  poolAmount: {
    type: Number,
    required: true
  },
  firstPrize: {
    type: Number,
    required: true
  },
  secondPrize: {
    type: Number,
    required: true
  },
  thirdPrize: {
    type: Number,
    required: true
  },
  winners: {
    firstPrize: [
      {
        userId: {
          type: String,
          required: true
        },
        employeeId: {
          type: String
        },
        amount: {
          type: Number,
          required: true
        },
        ticketNumber: {
          type: String
        }
      }
    ],
    secondPrize: [
      {
        userId: {
          type: String,
          required: true
        },
        employeeId: {
          type: String
        },
        amount: {
          type: Number,
          required: true
        },
        ticketNumber: {
          type: String
        }
      }
    ],
    thirdPrize: [
      {
        userId: {
          type: String,
          required: true
        },
        employeeId: {
          type: String
        },
        amount: {
          type: Number,
          required: true
        },
        ticketNumber: {
          type: String
        }
      }
    ]
  },
  drawType: {
    type: String,
    required: true,
    default: '随机' // 随机, 指定
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('LotteryHistory', lotteryHistorySchema);