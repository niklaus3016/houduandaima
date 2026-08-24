const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  ip: {
    type: String,
    required: true
  },
  deviceId: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    default: ''
  },
  csjAppId: {
    type: String,
    default: ''
  },
  createTime: {
    type: Date,
    default: Date.now
  },
  updateTime: {
    type: Date,
    default: Date.now
  }
});

// 复合索引
userActivitySchema.index({ userId: 1, createTime: -1 });
userActivitySchema.index({ employeeId: 1, createTime: -1 });
userActivitySchema.index({ employeeId: 1, platform: 1, createTime: -1 });
userActivitySchema.index({ employeeId: 1, platform: 1, csjAppId: 1, createTime: -1 });
// 唯一索引：同一用户+IP+设备组合唯一
userActivitySchema.index({ userId: 1, ip: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('UserActivity', userActivitySchema);
