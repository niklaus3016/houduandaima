const mongoose = require('mongoose');

const goldLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  deviceId: {
    type: String,
    default: ''
  },
  ecpm: {
    type: Number,
    default: 0
  },
  gold: {
    type: Number,
    required: true
  },
  slotId: {
    type: String,
    default: ''
  },
  commissionRate: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    default: 'income'
  },
  createTime: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('GoldLog', goldLogSchema);