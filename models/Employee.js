const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    unique: true,
    length: 4
  },
  realName: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  region: {
    type: String,
    default: ''
  },
  phoneCount: {
    type: Number,
    default: 0
  },
  teamGroupId: {
    type: String,
    default: null
  },
  groupName: {
    type: String,
    default: null
  },
  status: {
    type: String,
    default: 'enabled'
  },
  parentId: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    default: 'EMPLOYEE'
  },
  csjDeviceLimit: {
    type: Number,
    default: 2
  },
  ksDeviceLimit: {
    type: Number,
    default: 2
  },
  ylhDeviceLimit: {
    type: Number,
    default: 2
  },
  joinedGroupAt: {
    type: Date,
    default: Date.now
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

// 添加索引
employeeSchema.index({ parentId: 1 });
employeeSchema.index({ teamGroupId: 1 });
employeeSchema.index({ employeeId: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
