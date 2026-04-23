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

// 添加索引
goldLogSchema.index({ userId: 1, createTime: 1 });
goldLogSchema.index({ employeeId: 1, createTime: 1 });
goldLogSchema.index({ createTime: 1 });

module.exports = mongoose.model('GoldLog', goldLogSchema);