const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  // 明文密码存储（只有 SUPER_ADMIN 权限的 GET 接口才会返回给前端展示）
  // 用途：超管管理页/组长卡片底部"用户名 + 密码明文"直接展示给下属开通账号
  passwordPlain: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    default: 'admin'
  },
  teamName: {
    type: String,
    default: ''
  },
  teamGroupId: {
    type: String,
    default: null
  },
  groupName: {
    type: String,
    default: null
  },
  commission: {
    type: Number,
    default: 0
  },
  realName: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  region: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    default: 'enabled'
  },
  // 团队长层级归属：下级TL -> 上级TL的_id（只对 role=NORMAL_ADMIN 的团队长有效）
  // 用于 D员工 上溯到最顶层TL算级差分账
  parentTlId: {
    type: String,
    default: null
  },
  // 晋升为团队长的时间（由晋升接口写入）
  // 用于判断「这个TL自己新发展的组长/组」：组.createdAt > promotedAt → 第3类员工，和上级TL无关
  promotedAt: {
    type: Date,
    default: null
  },
  // 职级 v2：手动指定档位（覆盖自动计算），null=自动按累计营收匹配
  // 可选值：P1（组长）/ P2~P8（团队长）
  manualLevel: {
    type: String,
    default: null
  },
  // 最近一次手动调档时间（审计/展示用）
  manualLevelSetAt: {
    type: Date,
    default: null
  },
  // ADMIN_MANAGER（高级管理员）专属：管理的团队长 ID 列表
  // 超管通过编辑高管页面分配团队长给高管
  // 高管只能看到/操作 managedTeamIds 范围内的团队数据
  managedTeamIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: []
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 添加索引
adminSchema.index({ username: 1 });

module.exports = mongoose.model('Admin', adminSchema);
