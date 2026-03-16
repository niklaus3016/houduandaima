const mongoose = require('mongoose');

const teamGroupSchema = new mongoose.Schema({
  teamLeaderId: {
    type: String,
    required: true
  },
  teamName: {
    type: String,
    required: true
  },
  groupName: {
    type: String,
    required: true
  },
  groupLeaderId: {
    type: String,
    default: null
  },
  groupLeaderName: {
    type: String,
    default: null
  },
  commission: {
    type: Number,
    default: 0.05
  },
  memberCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('TeamGroup', teamGroupSchema);