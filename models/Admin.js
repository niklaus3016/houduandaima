const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'admin'
  },
  teamName: {
    type: String,
    default: ''
  },
  teamGroupId: {
    type: String,
    default: null
  },
  groupName: {
    type: String,
    default: null
  },
  commission: {
    type: Number,
    default: 0
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
  status: {
    type: String,
    default: 'enabled'
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
adminSchema.index({ username: 1 });

module.exports = mongoose.model('Admin', adminSchema);
