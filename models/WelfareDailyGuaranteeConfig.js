const mongoose = require('mongoose');

/**
 * 每日保底礼包配置（管理员配置）—— 二段保底版
 *   - 单文档模型：全系统永远只有 1 条记录（按 _id 固定 singleton）
 *   - 若文档不存在则以 DEFAULT_CONFIG 兜底，避免查询影响业务
 *   - effectiveFromDateStr（可选）：该配置从哪个北京日开始生效（YYYY-MM-DD）
 *     - 留空表示立即生效（当前默认行为，简单）
 *     - 若未来要做"明天 0 点改规则"，管理员可设置为明天日期
 *   - 管理员权限：仅 SUPER_ADMIN / FINANCE 可改，其他角色可读
 *
 * 二段保底：
 *   stages: [
 *     { stage: 1, thresholdViews: 2000, thresholdGold: 50000 },
 *     { stage: 2, thresholdViews: 3000, thresholdGold: 100000 }
 *   ]
 *   - stage 编号从 1 开始递增，必须严格递增（views & gold 都必须递增）
 *   - 第一段：看满 2000 条触发，补齐到 5 万金币
 *   - 第二段：看满 3000 条触发，补齐到 10 万金币（含已领第一段的补贴金币）
 *
 * 向后兼容：
 *   - 老文档只有 thresholdViews / thresholdGold（单段保底）→ getEffectiveConfig 自动视为 stage 2
 *   - 新文档必须用 stages 数组，老字段保留是为了读取老 DB 记录
 */
const stageSchema = new mongoose.Schema({
  stage:           { type: Number, required: true, min: 1 },
  thresholdViews: { type: Number, required: true, min: 1 },
  thresholdGold:  { type: Number, required: true, min: 1 }
}, { _id: false });

const schema = new mongoose.Schema({
  // 开关：保底福袋是否启用（默认 true，开启）
  enabled: { type: Boolean, default: true },

  // 二段保底配置（新版）
  stages: {
    type: [stageSchema],
    default: [
      { stage: 1, thresholdViews: 2000, thresholdGold: 50000 },
      { stage: 2, thresholdViews: 3000, thresholdGold: 100000 }
    ],
    validate: {
      validator: function(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return false;
        // stage 必须从 1 递增；thresholdViews & thresholdGold 必须严格递增
        for (let i = 0; i < arr.length; i++) {
          if (!arr[i] || typeof arr[i].stage !== 'number' || arr[i].stage !== i + 1) return false;
          if (i > 0) {
            if (arr[i].thresholdViews <= arr[i-1].thresholdViews) return false;
            if (arr[i].thresholdGold  <= arr[i-1].thresholdGold)  return false;
          }
        }
        return true;
      },
      message: 'stages 必须按 stage=1,2,... 递增，且 thresholdViews / thresholdGold 都严格递增'
    }
  },

  // ===== 兼容字段（老文档：单段保底，仅用于读取历史 DB 记录）=====
  // 新文档不要写入这两个字段；getEffectiveConfig 会优先读 stages，老文档没 stages 才 fallback 到这两字段
  thresholdViews: { type: Number, min: 1 },  // 老字段：单段保底条数门槛
  thresholdGold:  { type: Number, min: 1 },  // 老字段：单段保底金币上限

  // 生效日期（北京日 YYYY-MM-DD），留空 = 立即生效
  effectiveFromDateStr: { type: String, default: '' },

  // 操作审计
  updatedBy:   { type: String, default: '' }, // admin.username
  updatedAt:   { type: Date,   default: Date.now },
  remark:      { type: String, default: '' }  // 可选备注（如"双11临时调到5万"）
});

schema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const WelfareDailyGuaranteeConfig = mongoose.model('WelfareDailyGuaranteeConfig', schema);

module.exports = WelfareDailyGuaranteeConfig;
