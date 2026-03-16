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
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Employee', employeeSchema);
