const mongoose = require('mongoose');

/**
 * 团队长职级档位配置（全局一份）
 * 设计：单文档结构（唯一键 teamLeaderLevelConfig，里面存 4 档的数组 levels
 *      这样 PUT 整体覆写，避免多文档并发写入顺序不一致。
 */
const schema = new mongoose.Schema({
  // 唯一键：固定值 'global'，单文档
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global'
  },
  levels: [
    {
      _id: false,
      level: {
        type: String,
        required: true,
        enum: ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
      },
      name: {
        type: String,
        required: true
      },
      commission: {
        type: Number,
        required: true,
        min: 0,
        max: 1
      },
      minRevenue: {
        type: Number,
        required: true,
        min: 0
      },
      targetRevenue: {
        type: Number,
        required: true,
        min: 0
      }
    }
  ],
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    default: ''
  }
});

module.exports = mongoose.model('TeamLeaderLevelConfig', schema);
