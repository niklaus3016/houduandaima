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
    required: true
  },
  ecpm: {
    type: Number,
    required: true
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
  createTime: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('GoldLog', goldLogSchema);