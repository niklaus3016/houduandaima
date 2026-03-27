const mongoose = require('mongoose');

const deviceStatusSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  isLimited: {
    type: Boolean,
    default: false
  },
  consecutiveLowValueCount: {
    type: Number,
    default: 0
  },
  lastUpdateTime: {
    type: Date,
    default: Date.now
  },
  lastLimitedTime: {
    type: Date
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
deviceStatusSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const DeviceStatus = mongoose.model('DeviceStatus', deviceStatusSchema);

module.exports = DeviceStatus;