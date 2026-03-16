const mongoose = require('mongoose');

const loginRecordSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  loginDate: {
    type: Date,
    required: true
  },
  loginTime: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 复合索引，确保每天只记录一次
loginRecordSchema.index({ userId: 1, loginDate: 1 }, { unique: true });

module.exports = mongoose.model('LoginRecord', loginRecordSchema);