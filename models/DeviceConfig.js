const mongoose = require('mongoose');

const deviceConfigSchema = new mongoose.Schema({
  consecutiveLimit: {
    type: Number,
    default: 10,
    required: true
  },
  goldThreshold: {
    type: Number,
    default: 50,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 自动更新updatedAt字段
deviceConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const DeviceConfig = mongoose.model('DeviceConfig', deviceConfigSchema);

module.exports = DeviceConfig;