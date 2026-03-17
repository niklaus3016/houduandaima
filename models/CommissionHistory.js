const mongoose = require('mongoose');

const commissionHistorySchema = new mongoose.Schema({
  teamGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TeamGroup',
    required: true
  },
  groupName: {
    type: String,
    required: true
  },
  oldCommission: {
    type: Number,
    required: true
  },
  newCommission: {
    type: Number,
    required: true
  },
  operatorId: {
    type: String,
    required: true
  },
  operatorName: {
    type: String,
    default: ''
  },
  changeTime: {
    type: Date,
    default: Date.now
  },
  remark: {
    type: String,
    default: ''
  }
});

commissionHistorySchema.index({ teamGroupId: 1, changeTime: -1 });

module.exports = mongoose.model('CommissionHistory', commissionHistorySchema);
