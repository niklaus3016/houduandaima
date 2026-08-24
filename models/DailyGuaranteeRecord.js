const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  userId:     { type: String, default: '' },
  dateStr:    { type: String, required: true },

  // ===== 二段保底：哪一段（1=第一段5万 / 2=第二段10万）=====
  // 老数据（单段保底时期）默认视为 stage=2，避免历史记录查询错位
  stage:      { type: Number, default: 2, min: 1, index: true },

  // 命中时 / 领取时快照（仅审计用途）
  thresholdViews: { type: Number, default: 3000 },
  thresholdGold:  { type: Number, default: 100000 },
  viewsAtClaim:   { type: Number, default: 0 },
  goldAtClaim:    { type: Number, default: 0 },
  virtualWeeklyAtClaim: { type: Number, default: 0 },
  totalGoldForGuaranteeAtClaim: { type: Number, default: 0 },
  // 实际补差金币 = max(0, thresholdGold - totalGoldForGuaranteeAtClaim)
  gapGold:       { type: Number, required: true, default: 0 },

  claimedAt:     { type: Date,   default: Date.now }
});

// 幂等核心：同日同员工同段只能领一次（二段保底允许每天领 2 次：stage=1 + stage=2）
schema.index({ employeeId: 1, dateStr: 1, stage: 1 }, { unique: true });
// 后台 overview 查询某一天的发放情况快速索引
schema.index({ dateStr: 1, claimedAt: -1 });
// 性能：/claims 分页按员工+日期+段位+金额筛选
schema.index({ employeeId: 1, dateStr: -1, stage: 1, gapGold: -1 });

module.exports = mongoose.model('DailyGuaranteeRecord', schema);
