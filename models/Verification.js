const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  invoiceFile: {
    type: String,
    required: true
  },
  alipayName: {
    type: String,
    default: ''
  },
  alipayAccount: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'approved', 'rejected']
  },
  remark: {
    type: String,
    default: ''
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

module.exports = mongoose.model('Verification', verificationSchema);
