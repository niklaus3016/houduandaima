const mongoose = require('mongoose');

const goldDeductionSchema = new mongoose.Schema({
  deductionRate: {
    type: Number,
    required: true
  },
  affectedUsers: {
    type: Number,
    default: 0
  },
  operator: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    default: 'success'
  },
  remark: {
    type: String,
    default: ''
  }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

module.exports = mongoose.model('GoldDeduction', goldDeductionSchema);
