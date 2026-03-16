const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  leaderId: {
    type: String,
    required: true
  },
  members: [
    {
      userId: {
        type: String,
        required: true
      },
      role: {
        type: String,
        default: 'member'
      }
    }
  ],
  todayRevenue: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
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

module.exports = mongoose.model('Team', teamSchema);