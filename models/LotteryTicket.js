const mongoose = require('mongoose');

const lotteryTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    default: '有效' // 有效, 中奖, 作废
  },
  issueNumber: {
    type: String,
    required: true
  },
  validUntil: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('LotteryTicket', lotteryTicketSchema);