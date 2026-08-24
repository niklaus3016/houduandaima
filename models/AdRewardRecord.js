const mongoose = require('mongoose');

const adRewardRecordSchema = new mongoose.Schema({
  trans_id: {
    type: String,
    required: true
  },
  user_id: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    default: ''
  },
  slot_id: {
    type: String,
    default: ''
  },
  rit_id: {
    type: String,
    default: ''
  },
  adn: {
    type: String,
    default: ''
  },
  ecpm: {
    type: Number,
    required: true,
    default: 0
  },
  reward_amount: {
    type: Number,
    default: 1
  },
  reward_name: {
    type: String,
    default: '金币'
  },
  extra: {
    type: String,
    default: ''
  },
  is_awarded: {
    type: Number,
    default: 0
  },
  reason: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

adRewardRecordSchema.index({ user_id: 1 });
adRewardRecordSchema.index({ createdAt: 1 });
adRewardRecordSchema.index({ trans_id: 1 }, { unique: true });

module.exports = mongoose.model('AdRewardRecord', adRewardRecordSchema);