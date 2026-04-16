const mongoose = require('mongoose');

const welfarePrizeSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  value: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  probability: {
    type: Number,
    required: true
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

module.exports = mongoose.model('WelfarePrize', welfarePrizeSchema);
