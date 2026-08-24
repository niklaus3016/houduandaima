const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const UserGold = require('../models/UserGold');
const Employee = require('../models/Employee');
const Admin = require('../models/Admin');
const Verification = require('../models/Verification');
const TeamGroup = require('../models/TeamGroup');
const GoldLog = require('../models/GoldLog');
const GroupLeaderLevelConfig = require('../models/GroupLeaderLevelConfig');
const TeamLeaderLevelConfig = require('../models/TeamLeaderLevelConfig');
const { generateToken, comparePassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');
const { uploadFile } = require('../services/storage');
const { get, set, clear } = require('../utils/cache');
// 🌿 复用团队Tab（/admin/dashboard/kpi）的KPI核心路径，保证「业绩Tab」和「团队Tab」
// 的 teamRevenue / directRevenue / indirectRevenue / commission 4 大口径 100%一致，
// 杜绝维护第三套计算逻辑导致的¥10万+ 偏差（fan杰晋升TL后历史组被旧try/catch兜底0漏算）。
const dashboardRouter = require('./dashboard');

// ==================== 组长职级体系 P1 常量配置（仅1档）====================
// 默认值（超管首次使用或恢复默认时用），真实线上值以 DB 为准
const GROUP_LEADER_LEVEL_CONFIG_DEFAULTS = [
  { level: 'P1', name: '初级组长', commission: 0.05, minRevenue: 0, targetRevenue: 100000 },
];
// 向后兼容常量名：TDD 测试脚本可能还在用这个名
const GROUP_LEADER_LEVEL_CONFIG = GROUP_LEADER_LEVEL_CONFIG_DEFAULTS;

// 配置内存缓存键 & TTL（超管改配置后会主动清）
const LEVEL_CONFIG_CACHE_KEY = 'gl_level_config';
const LEVEL_CONFIG_CACHE_TTL = 60 * 60 * 1000;

/**
 * 获取当前生效的职级配置（1 档 P1） + 最近更新时间。
 * 优先级：内存缓存 → DB → 默认值（首次会写 DB）。
 * 缓存里存 {list, updatedAt}，返回浅拷贝即可（list 对象只读，computeGroupLeaderLevel
 * 自己 [...cfg].sort 做了浅拷贝排序；response 序列化也不会改原对象引用）。
 *
 * ⚡ 性能优化点：之前每次 getLevelConfig() 都 JSON.parse(JSON.stringify) 深拷贝，
 *    之后 GET admin/level-config 又再查一次 updatedAt → 浪费 2 次 round-trip + CPU。
 *    现在一次返回，调用方直接解构 {list, updatedAt} = await getLevelConfig()。
 *
 * 向后兼容：若仅需 list，可用 (await getLevelConfig()).list；computeGroupLeaderLevel
 *           接收 cfg 参数即 list 数组，兼容原有签名。
 */
async function getLevelConfig() {
  const cached = get(LEVEL_CONFIG_CACHE_KEY);
  if (cached && cached && Array.isArray(cached.list) && cached.list.length === 1) {
    // 浅拷贝数组即可（元素是 readonly 的对象；需要修改的话请在外部自行深拷）
    return { list: cached.list.slice(), updatedAt: cached.updatedAt || null };
  }
  let doc = await GroupLeaderLevelConfig.findOne({ key: 'global' }).lean();
  if (!doc || !Array.isArray(doc.levels) || doc.levels.length !== 1) {
    doc = await GroupLeaderLevelConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: { levels: GROUP_LEADER_LEVEL_CONFIG_DEFAULTS, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  }
  const list = doc.levels.slice().sort((a, b) => a.minRevenue - b.minRevenue);
  const updatedAt = doc.updatedAt || null;
  set(LEVEL_CONFIG_CACHE_KEY, { list, updatedAt }, LEVEL_CONFIG_CACHE_TTL);
  return { list: list.slice(), updatedAt };
}

/**
 * 超管写完配置后清理所有关联缓存：
 *   1) 配置本身的 1 小时内存缓存
 *   2) 所有组长业绩 5 分钟缓存（下一次请求立刻按新档位算 level）
 *   3) 其它可能附带 level 字段的缓存：组长佣金统计/提成统计缓存（安全兜底）
 */
function invalidateLevelRelatedCaches() {
  // 组长端缓存
  clear(LEVEL_CONFIG_CACHE_KEY);
  clear('group-leader-performance-');
  clear('group-leader-commission-stats-');
  clear('group-leader-stats-');
  // 团队长端缓存
  clear(TEAM_LEADER_LEVEL_CONFIG_CACHE_KEY);
  clear('team-leader-performance-');
}

/**
 * 档位数组合法性校验（PUT 时调用）——组长1档 P1。
 * 返回 { ok, message }：ok=false 时 message 可直接返回给前端。
 * 规则：
 *   - 必须恰好 1 条（P1）
 *   - level 字段必须恰好是 P1
 *   - commission ∈ [0, 1]
 *   - P1 的 minRevenue 必须为 0
 *   - 同档 targetRevenue >= minRevenue
 */
function validateLevelConfigList(list) {
  if (!Array.isArray(list)) return { ok: false, message: 'list 必须为数组' };
  if (list.length !== 1) return { ok: false, message: '必须恰好配置 1 档（P1）' };
  const EXPECTED_LEVELS = ['P1'];
  // 每档字段 & 范围
  for (let i = 0; i < 1; i++) {
    const x = list[i];
    if (!x || typeof x !== 'object') return { ok: false, message: `第${i+1}条格式错误` };
    if (!EXPECTED_LEVELS.includes(x.level)) return { ok: false, message: `档位名仅支持 P1（第${i+1}条为${x.level}）` };
    if (typeof x.name !== 'string' || !x.name.trim()) return { ok: false, message: `第${i+1}条 name 不能为空` };
    if (typeof x.commission !== 'number' || x.commission < 0 || x.commission > 1) return { ok: false, message: `第${i+1}条 commission 必须在 0~1 之间` };
    if (typeof x.minRevenue !== 'number' || x.minRevenue < 0) return { ok: false, message: `第${i+1}条 minRevenue 必须 ≥ 0` };
    if (typeof x.targetRevenue !== 'number' || x.targetRevenue < 0) return { ok: false, message: `第${i+1}条 targetRevenue 必须 ≥ 0` };
    if (x.targetRevenue < x.minRevenue) return { ok: false, message: `第${i+1}条 targetRevenue 不能小于 minRevenue` };
  }
  // 严格递增 + P1 必须 0
  const asc = [...list].sort((a,b)=>a.minRevenue-b.minRevenue);
  if (asc[0].minRevenue !== 0) return { ok: false, message: 'P1（唯一档）minRevenue 必须等于 0' };
  if (asc[0].level !== 'P1') return { ok: false, message: '档位必须为 P1' };
  return { ok: true };
}

/**
 * 根据累计业绩（元，两位小数）计算组长职级。
 * 不做降级，取 totalRevenue >= minRevenue 的最高档。
 * 纯函数核心逻辑，在业绩看板末尾用已算出的 totalRevenue 调用即可。
 *
 * @param {number} totalRevenue 累计业绩（元，≥ 0）
 * @param {Array}  [cfg]        1 档配置数组，不传时默认常量（纯函数测试/兼容用）
 * @returns {Object} level 对象（11 字段）
 */
/**
 * 根据累计业绩（元，两位小数）计算组长职级。
 * 🔴 P0修复：传入的 cfg 是合并后的【完整8档】(P1 GL + P2~P8 TL)，不再只有 P1 1 条。
 * 公式与团队长完全对齐：找 tr >= minRevenue 的最高档；满级 = P8 且 tr >= P8.targetRevenue。
 * 手动档优先（manualLevel ∈ P1~P8 合法时，直接跳档，不管业绩多少）。
 * @pure
 */
function computeGroupLeaderLevel(totalRevenue, cfg, manualLevel) {
  const tr = +totalRevenue || 0;
  // 🔴 核心：cfg 现在是完整 8 条 (P1 GL + P2~P8 TL)，不是 1 条了！
  const useCfg = (cfg && Array.isArray(cfg) && cfg.length === 8)
    ? [...cfg].sort((a, b) => (a.minRevenue || 0) - (b.minRevenue || 0))
    : [
      // 兜底 8 条（生产环境 DB 配置找不到时的 fallback，确保恒 8 条不报错）
      ...GROUP_LEADER_LEVEL_CONFIG_DEFAULTS,
      ...TEAM_LEADER_LEVEL_CONFIG_DEFAULTS,
    ].sort((a, b) => (a.minRevenue || 0) - (b.minRevenue || 0));

  // 自动档：找 tr >= minRevenue 的最高档（P1~P8 全范围找）
  let curIdx = 0;
  for (let i = useCfg.length - 1; i >= 0; i--) {
    if (tr >= (useCfg[i].minRevenue || 0)) { curIdx = i; break; }
  }
  // 手动档处理（与团队长同款）
  let manual = false;
  let usedManualLevel = null;
  if (manualLevel) {
    const m = String(manualLevel).trim().toUpperCase();
    const mIdx = useCfg.findIndex(l => String(l.level || '').toUpperCase() === m);
    if (mIdx >= 0) { curIdx = mIdx; manual = true; usedManualLevel = useCfg[mIdx].level; }
  }
  const CUR = useCfg[curIdx];
  const NEXT = useCfg[curIdx + 1];
  const nextExists = !!NEXT;
  // 满级：P8（最后一档）且 tr >= P8.targetRevenue；手动档 P8 也算满级
  const isMaxLevel = manual
    ? (curIdx === useCfg.length - 1)
    : (curIdx === useCfg.length - 1) && (tr >= (CUR.targetRevenue || CUR.minRevenue || 0));

  let progressToNext;
  if (CUR.level !== 'P8') {
    const curMin = CUR.minRevenue || 0;
    const curTgt = CUR.targetRevenue || curMin;
    const denom = curTgt - curMin;
    progressToNext = denom > 0 ? ((tr - curMin) / denom) : (tr >= curTgt ? 1 : 0);
  } else {
    progressToNext = 1;
  }
  progressToNext = Math.max(0, Math.min(1, progressToNext));

  let revenueToNext;
  if (isMaxLevel) {
    revenueToNext = 0;
  } else {
    // 口径与团队长端严格一致：距离「当前档目标 CUR.targetRevenue」差额 = revenueToNext
    const curTgt = CUR.targetRevenue || CUR.minRevenue || 0;
    revenueToNext = Math.max(0, curTgt - tr);
  }

  // 后端明确口径：nextLevelThreshold = 当前档 CUR.targetRevenue（与团队长同款，revenueToNext + tr 配套）
  const nextLevelThreshold = CUR.targetRevenue || CUR.minRevenue || 0;
  const currentLevelMinRevenue    = CUR.minRevenue || 0;
  const currentLevelTargetRevenue = CUR.targetRevenue || currentLevelMinRevenue;
  const nextLevelMinRevenue       = nextExists ? (NEXT.minRevenue || 0) : null;

  const level = {
    currentLevel: CUR.level,
    currentLevelName: CUR.name,
    currentCommission: CUR.commission,
    currentLevelMinRevenue,
    currentLevelTargetRevenue,
    nextLevelMinRevenue,
    nextLevelThreshold,
    progressToNext,
    revenueToNext,
    isMaxLevel,
    upgradePending: false,
    // 手动档回传字段（与团队长端同结构）
    manualLevel: usedManualLevel,
    manualLevelSetAt: manual ? (new Date()) : null,  // 路由层若有真实 Admin.manualLevelSetAt 会覆盖这个兜底值
  };

  if (nextExists) {
    level.nextLevel = NEXT.level;
    level.nextLevelName = NEXT.name;
    level.nextCommission = NEXT.commission;
  } else {
    level.nextLevel = null;
    level.nextLevelName = null;
    level.nextCommission = null;
  }

  return level;
}
// ==================== 团队长职级体系 P2~P8 常量配置（7档）====================
const TEAM_LEADER_LEVEL_CONFIG_DEFAULTS = [
  { level: 'P2', name: '初级团队长', commission: 0.08, minRevenue:   30000, targetRevenue:  100000 },
  { level: 'P3', name: '中级团队长', commission: 0.10, minRevenue:  100000, targetRevenue:  200000 },
  { level: 'P4', name: '高级团队长', commission: 0.12, minRevenue:  200000, targetRevenue:  500000 },
  { level: 'P5', name: '资深团队长', commission: 0.14, minRevenue:  500000, targetRevenue: 1000000 },
  { level: 'P6', name: '专家团队长', commission: 0.16, minRevenue: 1000000, targetRevenue: 2000000 },
  { level: 'P7', name: '高级专家团队长', commission: 0.18, minRevenue: 2000000, targetRevenue: 3000000 },
  { level: 'P8', name: '首席团队长', commission: 0.20, minRevenue: 3000000, targetRevenue: 3000000 },
];
const TEAM_LEADER_LEVEL_CONFIG = TEAM_LEADER_LEVEL_CONFIG_DEFAULTS;
const TEAM_LEADER_LEVEL_CONFIG_CACHE_KEY = 'tl_level_config';
const TEAM_LEADER_LEVEL_CONFIG_CACHE_TTL = 60 * 60 * 1000; // 1h

async function getTeamLeaderLevelConfig() {
  const cached = get(TEAM_LEADER_LEVEL_CONFIG_CACHE_KEY);
  if (cached && cached && Array.isArray(cached.list) && cached.list.length === 7) {
    return {
      list: cached.list.slice(),
      updatedAt: cached.updatedAt || null,
      updatedBy: cached.updatedBy || ''
    };
  }
  let doc = await TeamLeaderLevelConfig.findOne({ key: 'global' }).lean();
  if (!doc || !Array.isArray(doc.levels) || doc.levels.length !== 7) {
    doc = await TeamLeaderLevelConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: { levels: TEAM_LEADER_LEVEL_CONFIG_DEFAULTS, updatedAt: new Date(), updatedBy: '' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  }
  const list = doc.levels.slice().sort((a, b) => a.minRevenue - b.minRevenue);
  const updatedAt = doc.updatedAt || null;
  const updatedBy = doc.updatedBy || '';
  set(TEAM_LEADER_LEVEL_CONFIG_CACHE_KEY, { list, updatedAt, updatedBy }, TEAM_LEADER_LEVEL_CONFIG_CACHE_TTL);
  return { list: list.slice(), updatedAt, updatedBy };
}

function validateTeamLeaderLevelConfigList(list) {
  if (!Array.isArray(list)) return { ok: false, message: 'list 必须为数组' };
  if (list.length !== 7) return { ok: false, message: '必须恰好配置 7 档（P2~P8）' };
  const EXPECTED_LEVELS = ['P2','P3','P4','P5','P6','P7','P8'];
  // 每档字段 & 范围
  for (let i = 0; i < 7; i++) {
    const x = list[i];
    if (!x || typeof x !== 'object') return { ok: false, message: `第${i+1}条格式错误` };
    if (!EXPECTED_LEVELS.includes(x.level)) return { ok: false, message: `档位名仅支持 P2/P3/P4/P5/P6/P7/P8（第${i+1}条为${x.level}）` };
    // name 允许空字符串（前端传空也可，兼容旧 TDD），但必须是 string 类型
    if (typeof x.name !== 'string') return { ok: false, message: `第${i+1}条 name 必须是字符串` };
    if (typeof x.commission !== 'number' || x.commission < 0 || x.commission > 1) return { ok: false, message: `第${i+1}条 commission 必须在 0~1 之间` };
    if (typeof x.minRevenue !== 'number' || x.minRevenue < 0) return { ok: false, message: `第${i+1}条 minRevenue 必须 ≥ 0` };
    if (typeof x.targetRevenue !== 'number' || x.targetRevenue < 0) return { ok: false, message: `第${i+1}条 targetRevenue 必须 ≥ 0` };
    if (x.targetRevenue < x.minRevenue) return { ok: false, message: `第${i+1}条 targetRevenue 不能小于 minRevenue` };
  }
  // 去重
  const seen = new Set();
  for (const x of list) {
    if (seen.has(x.level)) return { ok: false, message: `档位名重复: ${x.level}` };
    seen.add(x.level);
  }
  // 严格递增 + 衔接
  const asc = [...list].sort((a,b)=>a.minRevenue-b.minRevenue);
  if (asc[0].level !== 'P2') return { ok: false, message: '最低档必须是 P2' };
  for (let i = 1; i < 7; i++) {
    if (asc[i].minRevenue <= asc[i-1].minRevenue) return { ok: false, message: `第${i+1}档 minRevenue 必须比上一档大` };
    if (asc[i].commission <= asc[i-1].commission) return { ok: false, message: `第${i+1}档 commission 必须比上一档大` };
    // 衔接等式：asc[i].minRevenue === asc[i-1].targetRevenue（团队长要求严格衔接）
    if (asc[i].minRevenue !== asc[i-1].targetRevenue) return { ok: false, message: `档位区间出现空档：${asc[i-1].level}.targetRevenue != ${asc[i].level}.minRevenue` };
  }
  return { ok: true };
}

/**
 * 根据累计业绩（元）计算团队长职级（P2~P8，7档）。
 * 公式：找 tr >= minRevenue 的最高档；满级 = P8 且 tr >= P8.targetRevenue。
 * @pure
 */
function computeTeamLeaderLevel(totalRevenue, cfg, manualLevel) {
  const tr = +totalRevenue || 0;
  const useCfg = (cfg && Array.isArray(cfg) && cfg.length === 7)
    ? [...cfg].sort((a, b) => a.minRevenue - b.minRevenue)
    : TEAM_LEADER_LEVEL_CONFIG_DEFAULTS;

  // 自动档：找 tr >= minRevenue 的最高档
  let curIdx = 0;
  for (let i = useCfg.length - 1; i >= 0; i--) {
    if (tr >= useCfg[i].minRevenue) { curIdx = i; break; }
  }
  // 记住原始 manualLevel（调用方传进来的字符串，如果是合法档位→手动档，否则 undefined→自动）
  //   manual 布尔 = 是否真命中了手动档（用于满级判断 / 手动徽章 / 回传字段）
  let manual = false;
  let usedManualLevel = null;   // 实际生效的手动档字符串（如 "P5"），否则 null→自动
  // 手动档优先：若 manualLevel 合法命中（P2~P8），直接覆盖档位，不再管总业绩
  if (manualLevel) {
    const m = String(manualLevel).trim().toUpperCase();
    const mIdx = useCfg.findIndex(l => String(l.level || '').toUpperCase() === m);
    if (mIdx >= 0) { curIdx = mIdx; manual = true; usedManualLevel = useCfg[mIdx].level; }
  }
  const CUR = useCfg[curIdx];
  const NEXT = useCfg[curIdx + 1];
  const nextExists = !!NEXT;
  // 满级：P8（最后一档）且 tr >= P8.targetRevenue；手动档 P8 也算满级（业绩满足 P8.minRevenue 即可视为满级）
  const isMaxLevel = manual
    ? (curIdx === useCfg.length - 1)
    : (curIdx === useCfg.length - 1) && (tr >= CUR.targetRevenue);

  let progressToNext;
  if (CUR.level !== 'P8') {
    // 非 P8：进度=【当前档】区间内的完成比例：分子 tr−当前档minRevenue，分母 当前档targetRevenue−当前档minRevenue
    //   手动档场景：若 tr < 当前档最低达标线 → 进度钳到 0，不显示负数；≥target → 钳到 1
    const denom = CUR.targetRevenue - CUR.minRevenue;
    progressToNext = denom > 0 ? ((tr - CUR.minRevenue) / denom) : (tr >= CUR.targetRevenue ? 1 : 0);
  } else {
    // P8：满级，进度固定 1（不再推进）。若业务上需按 targetRevenue 再细分，这里可再调整
    progressToNext = 1;
  }
  progressToNext = Math.max(0, Math.min(1, progressToNext));

  let revenueToNext;
  if (isMaxLevel) {
    revenueToNext = 0;
  } else {
    // 距离「当前档目标」的差额 = 当前档 targetRevenue − 总业绩（和 progressToNext 口径配套：都是当前档 CUR.targetRevenue 作为完成目标）
    //   已超目标时归 0，不显示负值
    revenueToNext = Math.max(0, CUR.targetRevenue - tr);
  }

  // nextLevelThreshold：后端返回口径明确后向前兼容，值 = 当前档 targetRevenue = revenueToNext + tr 上限
  const nextLevelThreshold = CUR.targetRevenue;
  const currentLevelMinRevenue    = CUR.minRevenue;
  const currentLevelTargetRevenue = CUR.targetRevenue;
  const nextLevelMinRevenue       = nextExists ? NEXT.minRevenue : null;

  const level = {
    currentLevel: CUR.level,
    currentLevelName: CUR.name,
    currentCommission: CUR.commission,
    currentLevelMinRevenue,
    currentLevelTargetRevenue,
    nextLevelMinRevenue,
    nextLevelThreshold,
    progressToNext,
    revenueToNext,
    isMaxLevel,
    upgradePending: false,
    // ✅ 回传手动档信息：前端直接用 level.manualLevel != null 显示"手动/自动"徽章，不再需要 fallback 读 Admin 原表
    manualLevel: usedManualLevel,
    manualLevelSetAt: manual ? (new Date()) : null,  // 实际值会在路由层若有 Admin.manualLevelSetAt 字段再覆盖，这里给兜底防止 null 报错
  };

  if (nextExists) {
    level.nextLevel = NEXT.level;
    level.nextLevelName = NEXT.name;
    level.nextCommission = NEXT.commission;
  } else {
    level.nextLevel = null;
    level.nextLevelName = null;
    level.nextCommission = null;
  }

  return level;
}
// ==================== 团队长职级体系常量 / 函数 END ====================
// ==================== 职级体系常量 / 函数 END ====================

// 配置文件上传（临时存储）
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../temp');
    const fs = require('fs');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('文件类型不支持，仅支持 jpg, jpeg, png, pdf'));
  }
});

// 财务权限中间件
const financeMiddleware = (req, res, next) => {
  if (req.user.role !== 'finance' && req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '没有财务权限' });
  }
  next();
};

// 1. 认证相关接口

// 用户登录
router.post('/auth/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body;
    
    // 检查数据库连接状态
    if (mongoose.connection.readyState !== 1) {
      console.error('数据库未连接，连接状态:', mongoose.connection.readyState);
      return res.status(503).json({ success: false, message: '服务暂时不可用，请稍后重试' });
    }
    
    // 先检查是否为员工（员工直接登录，不需要密码）
    let user = await Employee.findOne({ employeeId });
    let userType = 'employee';
    
    // 如果不是员工，检查是否为超管（超管需要密码验证）
    if (!user) {
      user = await Admin.findOne({ username: employeeId });
      userType = 'admin';
      
      if (!user) {
        return res.status(401).json({ success: false, message: '账号不存在' });
      }
      
      // 验证超管密码
      const isPasswordValid = comparePassword(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: '账号或密码错误' });
      }
    }
    
    // 生成token
    const token = generateToken({
      id: user._id,
      username: userType === 'employee' ? user.employeeId : user.username,
      role: userType === 'employee' ? user.role : user.role
    });
    
    res.json({
      success: true,
      token,
      user: {
        userId: user._id.toString(),
        employeeId: userType === 'employee' ? user.employeeId : user.username,
        name: userType === 'employee' ? user.realName || '' : user.username
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    
    // 检查是否是数据库连接错误
    if (error.name === 'MongoNetworkError' || error.message.includes('connection') || error.message.includes('timed out')) {
      return res.status(503).json({ success: false, message: '服务暂时不可用，请稍后重试' });
    }
    
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 验证token
router.get('/auth/verify', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      userId: req.user.id,
      employeeId: req.user.username,
      name: req.user.username
    }
  });
});

// 2. 金币管理接口

// 获取用户金币信息
router.get('/user/gold', authMiddleware, async (req, res) => {
  try {
    const userGold = await UserGold.findOne({ employeeId: req.user.username });
    if (!userGold) {
      return res.json({
        success: true,
        data: {
          currentMonthGold: 0,
          lastMonthGold: 0,
          totalGold: 0
        }
      });
    }
    
    const totalGold = userGold.currentMonthGold + userGold.lastMonthGold;
    
    res.json({
      success: true,
      data: {
        currentMonthGold: userGold.currentMonthGold,
        lastMonthGold: userGold.lastMonthGold,
        totalGold
      }
    });
  } catch (error) {
    console.error('获取金币信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新用户金币
router.post('/user/gold/update', authMiddleware, async (req, res) => {
  try {
    const { currentMonthGold, lastMonthGold } = req.body;
    
    const userGold = await UserGold.findOneAndUpdate(
      { employeeId: req.user.username },
      { currentMonthGold, lastMonthGold },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, message: '金币更新成功' });
  } catch (error) {
    console.error('更新金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 3. 核销申请接口

// 提交核销申请
router.post('/verification/submit', authMiddleware, upload.single('invoiceFile'), async (req, res) => {
  // 确保返回JSON响应
  res.setHeader('Content-Type', 'application/json');
  
  try {
    console.log('开始处理核销申请提交');
    console.log('请求参数:', req.body);
    console.log('文件信息:', req.file);
    
    const { amount, alipayName, alipayAccount } = req.body;
    const invoiceFile = req.file;
    
    // 验证金额
    if (!amount || amount <= 0 || amount > 1500) {
      console.log('金额验证失败:', amount);
      return res.status(400).json({ success: false, message: '金额必须大于0且不超过1500元' });
    }
    
    // 验证文件
    if (!invoiceFile) {
      console.log('文件验证失败: 未上传文件');
      return res.status(400).json({ success: false, message: '请上传发票文件' });
    }
    
    // 检查用户金币
    console.log('检查用户金币信息:', req.user.username);
    const userGold = await UserGold.findOne({ employeeId: req.user.username });
    if (!userGold) {
      console.log('用户金币信息不存在:', req.user.username);
      return res.status(400).json({ success: false, message: '用户金币信息不存在' });
    }
    
    const requiredGold = parseFloat(amount) * 1000;
    const availableGold = userGold.currentMonthGold + userGold.lastMonthGold;
    
    console.log('金币检查:', { requiredGold, availableGold });
    if (availableGold < requiredGold) {
      console.log('金币不足:', { requiredGold, availableGold });
      return res.status(400).json({ success: false, message: '金币不足' });
    }
    
    // 上传文件（会自动处理对象存储失败的情况，回退到本地存储）
    const objectName = `invoices/${invoiceFile.filename}`;
    console.log('开始上传文件:', invoiceFile.path);
    console.log('目标对象:', objectName);
    
    let fileUrl;
    try {
      fileUrl = await uploadFile(invoiceFile.path, objectName);
      console.log('文件上传成功，URL:', fileUrl);
    } catch (uploadError) {
      console.error('文件上传失败:', uploadError);
      // 即使文件上传失败，也继续执行，使用默认路径
      const randomFileName = 'invoiceFile-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.file';
      fileUrl = `/uploads/invoices/${randomFileName}`;
      console.log('使用默认文件路径:', fileUrl);
    }
    
    // 创建核销申请
    console.log('用户信息:', req.user);
    console.log('用户ID类型:', typeof req.user.id);
    
    let verification;
    try {
      verification = new Verification({
        userId: req.user.id.toString(), // 确保userId是字符串类型
        employeeId: req.user.username,
        amount: parseFloat(amount), // 确保amount是数字类型
        invoiceFile: fileUrl,
        alipayName: alipayName || '',
        alipayAccount: alipayAccount || '',
        status: 'pending'
      });
      
      console.log('保存核销申请到数据库');
      await verification.save();
      console.log('核销申请保存成功，ID:', verification._id.toString());
    } catch (dbError) {
      console.error('数据库操作失败:', dbError);
      // 清理临时文件
      if (req.file) {
        try {
          const fs = require('fs');
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (unlinkError) {
          console.error('删除临时文件错误:', unlinkError.message);
        }
      }
      return res.status(500).json({ 
        success: false, 
        message: '数据库操作失败',
        error: dbError.message 
      });
    }
    
    // 删除临时文件
    try {
      const fs = require('fs');
      if (fs.existsSync(invoiceFile.path)) {
        console.log('删除临时文件:', invoiceFile.path);
        fs.unlinkSync(invoiceFile.path);
        console.log('临时文件删除成功');
      } else {
        console.log('临时文件不存在，跳过删除');
      }
    } catch (unlinkError) {
      console.error('删除临时文件错误:', unlinkError.message);
      // 即使删除临时文件失败，也继续执行
    }
    
    console.log('返回成功响应');
    res.json({
      success: true,
      message: '核销申请提交成功',
      verificationId: verification._id.toString()
    });
  } catch (error) {
    console.error('提交核销申请错误:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    
    // 清理临时文件
    if (req.file) {
      try {
        const fs = require('fs');
        if (fs.existsSync(req.file.path)) {
          console.log('删除临时文件:', req.file.path);
          fs.unlinkSync(req.file.path);
          console.log('临时文件删除成功');
        } else {
          console.log('临时文件不存在，跳过删除');
        }
      } catch (unlinkError) {
        console.error('删除临时文件错误:', unlinkError.message);
      }
    }
    
    // 确保返回JSON响应
    try {
      res.status(500).json({ 
        success: false, 
        message: '服务器错误',
        error: error.message // 添加错误信息，便于前端诊断
      });
    } catch (responseError) {
      console.error('返回响应错误:', responseError);
      // 即使返回响应失败，也确保连接被关闭
      res.end();
    }
  }
});

// 获取核销记录
router.get('/verification/records', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    const query = { employeeId: req.user.username };
    if (status) {
      query.status = status;
    }
    
    const records = await Verification.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await Verification.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        records: records.map(record => ({
          id: record._id.toString(),
          amount: record.amount,
          status: record.status,
          date: record.createdAt,
          alipayName: record.alipayName,
          alipayAccount: record.alipayAccount,
          invoiceUrl: record.invoiceFile,
          rejectReason: record.remark
        })),
        total
      }
    });
  } catch (error) {
    console.error('获取核销记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取核销详情
router.get('/verification/records/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const verification = await Verification.findOne({ _id: id, employeeId: req.user.username });
    if (!verification) {
      return res.status(404).json({ success: false, message: '核销记录不存在' });
    }
    
    res.json({
      success: true,
      data: {
        id: verification._id.toString(),
        amount: verification.amount,
        status: verification.status,
        date: verification.createdAt,
        alipayName: verification.alipayName,
        alipayAccount: verification.alipayAccount,
        invoiceUrl: verification.invoiceFile,
        rejectReason: verification.remark
      }
    });
  } catch (error) {
    console.error('获取核销详情错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 4. 财务处理接口

// 获取待处理核销申请
router.get('/verification/admin/pending', authMiddleware, financeMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const records = await Verification.find({ status: 'pending' })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await Verification.countDocuments({ status: 'pending' });
    
    res.json({
      success: true,
      data: {
        records: records.map(record => ({
          id: record._id.toString(),
          employeeId: record.employeeId,
          amount: record.amount,
          status: record.status,
          date: record.createdAt,
          alipayName: record.alipayName,
          alipayAccount: record.alipayAccount,
          invoiceUrl: record.invoiceFile,
          rejectReason: record.remark
        })),
        total
      }
    });
  } catch (error) {
    console.error('获取待处理核销申请错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新核销状态
router.put('/verification/admin/:id/status', authMiddleware, financeMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;
    
    // 验证状态
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态' });
    }
    
    const verification = await Verification.findById(id);
    if (!verification) {
      return res.status(404).json({ success: false, message: '核销记录不存在' });
    }
    
    // 如果审核通过，扣除用户金币
    if (status === 'approved') {
      const userGold = await UserGold.findOne({ employeeId: verification.employeeId });
      if (userGold) {
        const requiredGold = verification.amount * 1000;
        const availableGold = userGold.currentMonthGold + userGold.lastMonthGold;
        
        if (availableGold >= requiredGold) {
          // 优先扣除上月金币
          if (userGold.lastMonthGold >= requiredGold) {
            userGold.lastMonthGold -= requiredGold;
          } else {
            const remaining = requiredGold - userGold.lastMonthGold;
            userGold.lastMonthGold = 0;
            userGold.currentMonthGold -= remaining;
          }
          await userGold.save();
        }
      }
    }
    
    // 更新核销状态
    verification.status = status;
    verification.remark = remark;
    await verification.save();
    
    res.json({ success: true, message: '状态更新成功' });
  } catch (error) {
    console.error('更新核销状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取已处理核销记录
router.get('/verification/admin/list', authMiddleware, financeMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    } else {
      query.status = { $in: ['approved', 'rejected'] };
    }
    
    const records = await Verification.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await Verification.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        records: records.map(record => ({
          id: record._id.toString(),
          employeeId: record.employeeId,
          amount: record.amount,
          status: record.status,
          date: record.createdAt,
          alipayName: record.alipayName,
          alipayAccount: record.alipayAccount,
          invoiceUrl: record.invoiceFile,
          rejectReason: record.remark
        })),
        total
      }
    });
  } catch (error) {
    console.error('获取已处理核销记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取核销统计
router.get('/verification/admin/stats', authMiddleware, financeMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    
    const records = await Verification.find(query);
    
    const totalAmount = records.reduce((sum, record) => sum + record.amount, 0);
    const pendingCount = records.filter(record => record.status === 'pending').length;
    const approvedCount = records.filter(record => record.status === 'approved').length;
    const rejectedCount = records.filter(record => record.status === 'rejected').length;
    
    const pendingAmount = records
      .filter(record => record.status === 'pending')
      .reduce((sum, record) => sum + record.amount, 0);
    
    const approvedAmount = records
      .filter(record => record.status === 'approved')
      .reduce((sum, record) => sum + record.amount, 0);
    
    const rejectedAmount = records
      .filter(record => record.status === 'rejected')
      .reduce((sum, record) => sum + record.amount, 0);
    
    res.json({
      success: true,
      data: {
        totalAmount,
        pendingCount,
        approvedCount,
        rejectedCount,
        pendingAmount,
        approvedAmount,
        rejectedAmount
      }
    });
  } catch (error) {
    console.error('获取核销统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取北京时间（UTC+8）
function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

// 获取时间范围
function getTimeRange(range) {
  const now = new Date();
  const beijingNow = getBeijingDate(now);
  let startTime, endTime;

  if (range === 'today') {
    // 今天（北京时间）
    startTime = new Date(beijingNow);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  } else if (range === 'yesterday') {
    // 昨天（北京时间）
    startTime = new Date(beijingNow);
    startTime.setUTCDate(startTime.getUTCDate() - 1);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  } else if (range === 'week') {
    // 本周一（北京时间）
    const dayOfWeek = beijingNow.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startTime = new Date(beijingNow);
    startTime.setUTCDate(startTime.getUTCDate() + mondayOffset);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = now;
  } else if (range === 'month') {
    // 本月1日（北京时间）
    startTime = new Date(beijingNow);
    startTime.setUTCDate(1);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = now;
  } else {
    // 默认今天
    startTime = new Date(beijingNow);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  }

  return { startTime, endTime };
}

// 获取多个时间范围的函数
function getMultipleTimeRanges() {
  const now = new Date();
  const beijingNow = getBeijingDate(now);
  
  // 今日
  const todayStart = new Date(beijingNow);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartTime = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
  const todayEndTime = new Date(todayStartTime);
  todayEndTime.setUTCDate(todayEndTime.getUTCDate() + 1);
  
  // 本月
  const monthStart = new Date(beijingNow);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartTime = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000);
  const monthEndTime = now;
  
  // 上月
  const lastMonthStart = new Date(beijingNow);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);
  lastMonthStart.setUTCDate(1);
  lastMonthStart.setUTCHours(0, 0, 0, 0);
  const lastMonthStartTime = new Date(lastMonthStart.getTime() - 8 * 60 * 60 * 1000);
  
  const lastMonthEnd = new Date(beijingNow);
  lastMonthEnd.setUTCDate(1);
  lastMonthEnd.setUTCHours(0, 0, 0, 0);
  const lastMonthEndTime = new Date(lastMonthEnd.getTime() - 8 * 60 * 60 * 1000);
  
  // 累计（限制为最近90天，避免全表扫描）
  const allStartTime = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const allEndTime = now;
  
  return {
    today: { startTime: todayStartTime, endTime: todayEndTime },
    month: { startTime: monthStartTime, endTime: monthEndTime },
    lastMonth: { startTime: lastMonthStartTime, endTime: lastMonthEndTime },
    all: { startTime: allStartTime, endTime: allEndTime }
  };
}

// ================================================================
// 🔴 P0 FIX：组长「我的收益」接口 100% 对齐 TL 端扁平结构 + 同口径
//    统一复用 dashboard.computeNewKpi（同一套 SQL 同一张流水表）
//    返回 17 扁平字段(4组别名) + detail 嵌套过渡期兼容结构
// ================================================================
// 统一 helper：根据 Admin 文档 + scope(TL/GL)，构建扁平收益对象结构
//    - computeKpiFn：dashboard.computeNewKpi（或纯函数替代）
//    - 算 range = today/yesterday/week/month/lastMonth/all(=total)
//    - availableBalance = 上月收益 - 该用户历史上已成功提现(status=1)的金额
// ================================================================
async function _buildCommissionStatsFlat(scope, adminDoc, computeKpiFn) {
  if (!computeKpiFn) throw new Error('_buildCommissionStatsFlat: computeKpiFn is required');
  const AdminModel = adminDoc.constructor;
  const WithdrawRecord = mongoose.model('WithdrawRecord');
  const n2 = v => +(+v || 0).toFixed(2);

  // 1. 并行算 6 个 range 的佣金（开业至今累计 total = range='all'）
  const rangeKeys = ['today','yesterday','week','month','lastMonth','all'];
  const kpis = await Promise.all(rangeKeys.map(r => computeKpiFn(scope, r)));
  const raw = {};
  rangeKeys.forEach((r, i) => {
    const k = r === 'all' ? 'total' : r;
    raw[k] = {
      revenue:       n2(kpis[i]?.teamRevenue),
      commission:    n2(kpis[i]?.teamCommission),
      directComm:    n2(kpis[i]?.directCommission),
      indirectComm:  n2(kpis[i]?.indirectCommission || 0),
      groupsComm:    scope.kind === 'TL' ? n2((kpis[i]?._debug?.indirect||0) && kpis[i]?.indirectCommission) : 0, // (TL间接提成已含下属TL组)
      subTlComm:     scope.kind === 'TL' ? n2(kpis[i]?.indirectCommission || 0) : 0, // TL：indirectCommission已含 groups + subordinateTL
    };
  });

  // 2. availableBalance = MAX(0, lastMonth（动态计算） - 本月已提现金额)
  //    本月已提现 = status in [0, 1]（待处理 + 已通过），且 createTime 在本月范围内
  //    说明：现在是8月，用户提现的是上月（7月）的收益，所以要扣减本月（8月）已发起的提现
  const timeRanges = getMultipleTimeRanges();
  let currentMonthWithdrawn = 0;
  try {
    const adminUsername = adminDoc.username;
    if (adminUsername) {
      const wdAgg = await WithdrawRecord.aggregate([
        { $match: { 
          userId: adminUsername, 
          type: 'admin', 
          status: { $in: [0, 1] },
          createTime: { $gte: timeRanges.month.startTime, $lt: timeRanges.month.endTime }
        } },
        { $group: { _id: null, sumAmount: { $sum: '$amount' } } }
      ]).exec();
      currentMonthWithdrawn = +(wdAgg?.[0]?.sumAmount || 0);
    }
  } catch (e) {
    console.warn('[commission-stats availableBalance] 算本月已提现金额时警告（非致命，兜底0）：', e.message || e);
    currentMonthWithdrawn = 0;
  }
  const lastMonthCommission = n2(raw.lastMonth.commission);
  const availableBalance = n2(Math.max(0, lastMonthCommission - currentMonthWithdrawn));

  // 3. 构建扁平 17 字段
  const today  = n2(raw.today.commission);
  const month  = n2(raw.month.commission);
  const lastM  = n2(raw.lastMonth.commission);  // 动态计算的上月 teamCommission
  const total  = n2(raw.total.commission);

  const flat = {
    // 今日
    today, todayCommission: today, todayEarnings: today,
    // 本月
    month, monthCommission: month, monthEarnings: month,
    // 上月（含下划线老写法兼容）
    lastMonth: lastM, lastMonthCommission: lastM, lastMonthEarnings: lastM, last_month: lastM,
    // 开业至今累计
    total, totalCommission: total, totalEarnings: total,
    // 可提现
    availableBalance,
  };

  // 4. Debug 附加（对账用，不影响前端解析）
  flat.directCommission    = raw.today.directComm;   // 今日直推提成
  flat.indirectCommission  = raw.today.indirectComm; // 今日间推提成
  if (scope.kind === 'TL') {
    flat.groupsCommission         = raw.today.groupsComm;   // TL 今日: 下属组长组贡献
    flat.subordinateTlCommission  = raw.today.subTlComm;    // TL 今日: 下属TL直推贡献
  }
  flat.userId = String(adminDoc._id); // 防串数据 debug

  // 5. 过渡期 detail 嵌套兼容（保留老前端 today.totalCommission 路径，JSON key 不重复）
  //    timeRange 字段保留（老前端可能在用），和以前结构一致
  // 注：timeRanges 已在上方声明，此处直接复用
  const detail = {
    today: {
      totalEarnings: today, totalCommission: today,
      totalGold: Math.round(today * 1000), // 近似参考值
      timeRange: timeRanges ? {
        startTime: timeRanges.today.startTime.toISOString(),
        endTime:   timeRanges.today.endTime.toISOString()
      } : undefined,
    },
    month: {
      totalEarnings: month, totalCommission: month,
      totalGold: Math.round(month * 1000),
      timeRange: timeRanges ? {
        startTime: timeRanges.month.startTime.toISOString(),
        endTime:   timeRanges.month.endTime.toISOString()
      } : undefined,
    },
    lastMonth: {
      totalEarnings: lastM, totalCommission: lastM,
      totalGold: Math.round(lastM * 1000),
      timeRange: timeRanges ? {
        startTime: timeRanges.lastMonth.startTime.toISOString(),
        endTime:   timeRanges.lastMonth.endTime.toISOString()
      } : undefined,
    },
    // 把旧接口里的组元信息也塞到 detail 下（过渡期前端可能展示）
    _meta: {
      groupName: adminDoc.teamGroupId ? (scope.kind === 'GL' ? scope.teamGroupId : undefined) : undefined,
      groupLeaderName: adminDoc.realName || adminDoc.username,
      commissionRate: adminDoc.commission ?? 0,
      memberCount: relatedEmps_length_cache || 0,  // 后面路由层回算填充
      cached: false,
    },
  };

  return { flat, detail, raw };
}
// 供 TDD / 跨路由复用的「组长 commission-stats 核心计算」（剥离 req.user，纯 adminId 维度）
let relatedEmps_length_cache = 0; // 临时缓存（函数级，避免循环引用）
async function computeGroupLeaderCommissionStats(adminId) {
  // 1. Admin 校验（⚠️ const Admin 必须在使用前！TDZ 错误！）
  const AdminModel = mongoose.model('Admin');
  const currentAdmin = await AdminModel.findById(adminId).select('_id username realName role teamGroupId commission manualLevel').lean().exec();
  if (!currentAdmin) throw new Error('用户不存在');
  if (!currentAdmin.teamGroupId) throw new Error('您不是组长，没有权限');
  currentAdmin.constructor = AdminModel; // 防止 lean() 丢失 constructor

  // 2. 拿 GL scope（与业绩接口完全一致的 scope 结构）
  const scope = { kind: 'GL', adminId: String(currentAdmin._id), teamGroupId: String(currentAdmin.teamGroupId) };
  // 3. 计算佣金（使用 dashboard 统一 computeNewKpi）
  const dashboard = require('./dashboard');
  const computeKpiFn = (s, r) => dashboard.computeNewKpi(s, r);
  // 先缓存员工数给 detail 用
  const Employee = mongoose.model('Employee');
  const tgId = String(currentAdmin.teamGroupId);
  const adminIdStr = String(currentAdmin._id);
  const rel = await Employee.find({
    $or: [
      { teamGroupId: tgId }, { teamGroupId: adminIdStr },
      { parentId: adminIdStr },
    ]
  }).select('_id').lean().limit(5000);
  relatedEmps_length_cache = rel.length;
  const { flat, detail } = await _buildCommissionStatsFlat(scope, currentAdmin, computeKpiFn);
  detail._meta.memberCount = rel.length;
  relatedEmps_length_cache = 0; // 清临时缓存
  return { flat, detail };
}
router.computeGroupLeaderCommissionStats = computeGroupLeaderCommissionStats;
// 让 TL 端 dashboard.js 复用统一的扁平结构构建逻辑（保证两端字段完全一致，无漂移）
router._buildCommissionStatsFlatExported = _buildCommissionStatsFlat;
// 供 TDD 调用的便捷接口（直接返回给前端的 data 扁平结构 + detail）
router._TEST_getGlCommissionStats = async function _testGetGl(adminId) {
  const { flat, detail } = await computeGroupLeaderCommissionStats(adminId);
  return { ...flat, detail };
};

/**
 * 组长专用接口：获取自己组的佣金收益（Settings.tsx 「我的收益」组长端）
 * 🔴 新口径：100% 对齐 TL 端 /admin/dashboard/team-leader/commission（字段名 + 计算口径 + 结构）
 *    - 17 扁平字段（today/todayCommission/todayEarnings / month... / lastMonth+last_month / total... / availableBalance）
 *    - detail 嵌套：过渡期保留老前端路径（today.totalCommission 不报错）
 *    - 统一使用 dashboard.computeNewKpi（同一套 SQL 流水表计算，杜绝偏差）
 * v2 缓存 key：强制刷新旧数据（与老 group-leader-commission-stats-* 彻底隔离）
 */
router.get('/group-leader/commission-stats', authMiddleware, async (req, res) => {
  try {
    const cacheKey = `group-leader-commission-stats-v2-${req.user.id}`;
    const cached = get(cacheKey);
    if (cached) {
      // 缓存命中 → 只更新 timeRange（动态），其余字段复用
      const responseData = { success: true, cached: true, ...cached.flat, detail: { ...cached.detail } };
      if (getMultipleTimeRanges) {
        const tr = getMultipleTimeRanges();
        for (const rng of ['today','month','lastMonth']) {
          if (responseData.detail[rng]) {
            responseData.detail[rng].timeRange = {
              startTime: tr[rng].startTime.toISOString(),
              endTime:   tr[rng].endTime.toISOString(),
            };
          }
        }
      }
      return res.json(responseData);
    }
    // 计算 + 缓存 15 分钟（同以前 TTL）
    const { flat, detail } = await computeGroupLeaderCommissionStats(req.user.id);
    set(cacheKey, { flat, detail }, 15 * 60 * 1000);
    res.json({ success: true, cached: false, ...flat, detail });
  } catch (error) {
    console.error('[group-leader/commission-stats v2] 失败:', error.message || error);
    if (/不存在|没有权限/.test(error.message || '')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '服务器错误：组长佣金收益计算失败' });
  }
});

// ==================== 工具函数：组长业绩看板 ====================

// 取北京时间当前月的 "昨天"（用于 operatingDays、daysPassed、daily 截止）
function getBeijingYesterdayEnd() {
  const bjNow = getBeijingDate();
  // 北京时间昨天的整天 = [昨天0点, 今天0点)
  const todayBJ0 = new Date(bjNow);
  todayBJ0.setUTCHours(0, 0, 0, 0);
  const end = new Date(todayBJ0.getTime() - 8 * 60 * 60 * 1000); // 今天北京0点的UTC
  const yesterdayStart = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { yesterdayStart, yesterdayEnd: end };
}

// 把 YYYY-MM-DD (北京日期字符串) → 当天的 [UTC startTime, UTC endTime)
function beijingDayRange(yyyy, mm, dd) {
  // mm: 1-based
  const utcDate = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0));
  const startTime = new Date(utcDate.getTime() - 8 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
  return { startTime, endTime };
}

// 北京年月 → 本月第一天和下月第一天（UTC）
function beijingMonthRange(yyyy, mm /*1-based*/) {
  const firstBJ0 = new Date(Date.UTC(yyyy, mm - 1, 1, 0, 0, 0));
  const startTime = new Date(firstBJ0.getTime() - 8 * 60 * 60 * 1000);
  const nextMonthFirst = new Date(Date.UTC(yyyy, mm, 1, 0, 0, 0)); // mm自动进位
  const endTime = new Date(nextMonthFirst.getTime() - 8 * 60 * 60 * 1000);
  // 计算本月总天数
  const daysInMonth = new Date(yyyy, mm, 0).getDate();
  return { startTime, endTime, daysInMonth };
}

// 生成 monthly 骨架 (按 monthCount 从当前月向前补)
function buildMonthlySkeleton(monthCount) {
  const months = [];
  const bjNow = getBeijingDate();
  const curY = bjNow.getUTCFullYear();
  const curM = bjNow.getUTCMonth() + 1; // 1-based
  // 起点：至少覆盖今年1月~本月，再向前补足 monthCount 个月
  let y = curY;
  let m = curM;
  const needed = Math.max(monthCount, curM);
  for (let i = 0; i < needed; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push({ month: key, revenue: 0, _y: y, _m: m });
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }
  // 正序返回（旧→新）
  return months.reverse();
}

// 生成 daily 骨架（指定年月 1日 → 昨天）
function buildDailySkeleton(yyyy, mm /*1-based*/) {
  const { daysInMonth } = beijingMonthRange(yyyy, mm);
  const bjNow = getBeijingDate();
  const curY = bjNow.getUTCFullYear();
  const curM = bjNow.getUTCMonth() + 1;
  const curD = bjNow.getUTCDate();

  // 昨天（北京日）
  let endDay;
  if (yyyy === curY && mm === curM) {
    // 当前月：截止到昨天
    endDay = Math.max(0, curD - 1); // 如果今天是1号，则endDay=0，还没过任何天
  } else if (yyyy < curY || (yyyy === curY && mm < curM)) {
    // 过去的月份：全月
    endDay = daysInMonth;
  } else {
    // 未来月份
    endDay = 0;
  }

  const daily = [];
  for (let d = 1; d <= endDay; d++) {
    const date = `${yyyy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    daily.push({ date, revenue: 0 });
  }
  return { daily, daysPassed: endDay, daysInMonth };
}

// 组长业绩看板（第一阶段：只做业绩数据，不含职级）
// ⭐ 抽纯函数：团队长端会循环调用此函数，取各组的 rawGold（整数金币相加不会有舍入误差）后汇总，
//    保证组长端、团队长端的组业绩 G_g 分毫不差，避免对账失败。
async function getGroupLeaderPerformance(adminId, opts = {}) {
  const monthCount = parseInt(opts.monthCount, 10) || 12;
  let yyyy, mm;
  const ym = opts.yearMonth;
  const bjNow = getBeijingDate();
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split('-').map(Number);
    yyyy = y; mm = m;
  } else {
    yyyy = bjNow.getUTCFullYear();
    mm = bjNow.getUTCMonth() + 1;
  }

  // 1. 组长身份校验：Admin + teamGroupId；同时带出手动档字段（manualLevel / manualLevelSetAt）和 commission
  const adminDoc = await Admin.findById(adminId).select('_id teamGroupId manualLevel manualLevelSetAt commission').lean().exec();
  if (!adminDoc) throw new Error('用户不存在');
  if (!adminDoc.teamGroupId) throw new Error('您不是组长，没有权限');

  // 2. 并行：TeamGroup + Employee + 团队长职级配置（兜底模型A历史TL_rate用）
  let tlCfgDoc = null;
  try {
    const TLConfModel = mongoose.models.TeamLeaderLevelConfig || require('../models/TeamLeaderLevelConfig');
    tlCfgDoc = await TLConfModel.findOne({ key: 'global' }).select('levels').lean().exec();
  } catch (_) { tlCfgDoc = null; }
  const [group, employees] = await Promise.all([
    TeamGroup.findById(adminDoc.teamGroupId).select('_id createdAt groupName commission teamLeaderId').lean().exec(),
    Employee.find({
      $or: [
        { teamGroupId: adminDoc.teamGroupId.toString() },
        { teamGroupId: adminDoc.teamGroupId },
        { teamGroupId: adminDoc._id.toString() },
        { teamGroupId: adminDoc._id }
      ]
    }).lean().select('employeeId').exec()
  ]);
  if (!group) throw new Error('组不存在');
  const employeeIds = employees.map(e => e.employeeId);

  const COMM = +group.commission || 0;
  // ========== rateExpr（组长自己那份：GL版本，展示给组长端） ==========
  const rateExpr = {
    $cond: [
      { $and: [ { $gt: [ { $ifNull: ['$commissionRate', 0] }, 0 ] }, { $lte: [ { $ifNull: ['$commissionRate', 0] }, 1 ] } ] },
      '$commissionRate',
      COMM
    ]
  };
  // ========== tlRateExpr（团队长分层那份：模型A总包抵扣 TL spread） ==========
  //   1) 新订单（pre save 已固化 tlCommissionRate∈(0,1]）→ 用它（100% 不追溯）
  //   2) 历史订单（tlCommissionRate 没值）→ 兜底近似模型A：max(0, TL_rate_forContext − GL_rateExpr)
  //        其中 TL_rate_forContext = 团队长职级最低档 P5.commission（与 pre save 的 D/G 固化 TL_rate 完全一致）
  const sortedLevels = (tlCfgDoc && Array.isArray(tlCfgDoc.levels) && tlCfgDoc.levels.length)
    ? [...tlCfgDoc.levels].sort((a,b) => (a.minRevenue||0)-(b.minRevenue||0))
    : [];
  const TL_RATE_DEFAULT = 0.20; // 历史兼容兜底（无配置时代理默认 20%）
  const tlRateForContext = (sortedLevels[0] && typeof sortedLevels[0].commission === 'number')
    ? +sortedLevels[0].commission
    : TL_RATE_DEFAULT;
  const tlRateExpr = {
    $cond: [
      { $and: [ { $gt: [ { $ifNull: ['$tlCommissionRate', 0] }, 0 ] }, { $lte: [ { $ifNull: ['$tlCommissionRate', 0] }, 1 ] } ] },
      '$tlCommissionRate',
      { $max: [ 0, { $subtract: [ tlRateForContext, rateExpr ] } ] }
    ]
  };

  // 3. 时间范围
  const { startTime: dailyStart, endTime: dailyEndUTC, daysInMonth } = beijingMonthRange(yyyy, mm);
  const { yesterdayEnd } = getBeijingYesterdayEnd();
  const dailyQueryEnd = new Date(Math.min(dailyEndUTC.getTime(), yesterdayEnd.getTime()));
  const monthlySkeleton = buildMonthlySkeleton(monthCount);
  const firstMonth = monthlySkeleton[0];
  const { startTime: monthlyStartUTC } = beijingMonthRange(firstMonth._y, firstMonth._m);
  const lastMonth = monthlySkeleton[monthlySkeleton.length - 1];
  const lastY = lastMonth._y, lastM = lastMonth._m;
  const nextFirstUTC = new Date(Date.UTC(lastM === 12 ? lastY + 1 : lastY, lastM === 12 ? 0 : lastM, 1));
  const monthlyEndUTC = new Date(nextFirstUTC.getTime() - 8 * 60 * 60 * 1000);

  // 4. 累计业绩起点 - 限制为最近90天，避免全表扫描
  const accStart = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const accEnd = yesterdayEnd;

  const monthlyPipeline = [
    { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: monthlyStartUTC, $lt: monthlyEndUTC } } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m',
            date: { $add: ['$createTime', 8 * 60 * 60 * 1000] },
            timezone: 'UTC'
          }
        },
        totalGold: { $sum: '$gold' },
        totalCommissionGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', rateExpr] }, 0] } },
        totalTlCommissionGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', tlRateExpr] }, 0] } }   // TL 分层 commission（模型A spread）
      }
    }
  ];
  const dailyPipeline = [
    { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: dailyStart, $lt: dailyQueryEnd } } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $add: ['$createTime', 8 * 60 * 60 * 1000] },
            timezone: 'UTC'
          }
        },
        totalGold: { $sum: '$gold' },
        totalCommissionGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', rateExpr] }, 0] } },
        totalTlCommissionGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', tlRateExpr] }, 0] } }   // TL 分层 commission（模型A spread）
      }
    }
  ];
  const accPipeline = [
    { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: accStart, $lt: accEnd } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ];
  const [monthlyRaw, dailyRaw, accRaw] = await Promise.all([
    GoldLog.aggregate(monthlyPipeline).exec(),
    GoldLog.aggregate(dailyPipeline).exec(),
    GoldLog.aggregate(accPipeline).exec()
  ]);

  // 5. 组织数据（金币层返回，方便上层加总）
  const accGold = accRaw[0]?.totalGold || 0;
  const totalRevenue = +(accGold / 1000).toFixed(2);

  const foundedBJ = new Date(group.createdAt.getTime() + 8 * 60 * 60 * 1000);
  const teamFoundedAt = `${foundedBJ.getUTCFullYear()}-${String(foundedBJ.getUTCMonth() + 1).padStart(2, '0')}-${String(foundedBJ.getUTCDate()).padStart(2, '0')}`;
  const yStdBJ = new Date(bjNow);
  yStdBJ.setUTCDate(yStdBJ.getUTCDate() - 1);
  yStdBJ.setUTCHours(0, 0, 0, 0);
  const foundedDayStart = new Date(Date.UTC(foundedBJ.getUTCFullYear(), foundedBJ.getUTCMonth(), foundedBJ.getUTCDate()));
  const yesterdayDayStart = new Date(Date.UTC(yStdBJ.getUTCFullYear(), yStdBJ.getUTCMonth(), yStdBJ.getUTCDate()));
  const operatingDays = Math.max(0, Math.round((yesterdayDayStart - foundedDayStart) / (24 * 60 * 60 * 1000)) + 1);

  const summary = { totalRevenue, teamFoundedAt, operatingDays };

  // 6. daily 骨架 + 舍入补齐（revenue 和 commission（GL版 + TL版）分别对齐全月合计）
  let totalGoldMonth = 0;
  let totalCommissionGoldMonth = 0;
  let totalTlCommissionGoldMonth = 0;
  dailyRaw.forEach(r => {
    totalGoldMonth += (r.totalGold || 0);
    totalCommissionGoldMonth += (r.totalCommissionGold || 0);
    totalTlCommissionGoldMonth += (r.totalTlCommissionGold || 0);
  });
  const { daily: dailyArr, daysPassed } = buildDailySkeleton(yyyy, mm);
  const dailyMapGold = {};
  const dailyMapCommissionGold = {};
  const dailyMapTlCommGold = {};
  dailyRaw.forEach(r => {
    dailyMapGold[r._id] = r.totalGold || 0;
    dailyMapCommissionGold[r._id] = r.totalCommissionGold || 0;
    dailyMapTlCommGold[r._id] = r.totalTlCommissionGold || 0;
  });
  dailyArr.forEach(d => {
    d.revenue = +(((dailyMapGold[d.date] || 0)) / 1000).toFixed(2);
    d.commission = +(((dailyMapCommissionGold[d.date] || 0)) / 1000).toFixed(2);
    // TL版commission仅团队长端复用_rawGold时使用，组长端display不暴露
  });

  const targetRevenue = +(totalGoldMonth / 1000).toFixed(2);
  const targetCommission = +(totalCommissionGoldMonth / 1000).toFixed(2);
  const rawDailySumRevenue = +dailyArr.reduce((s, d) => s + d.revenue, 0);
  const rawDailySumCommission = +dailyArr.reduce((s, d) => s + d.commission, 0);
  const diffCentsRevenue = Math.round((targetRevenue - rawDailySumRevenue) * 100);
  const diffCentsCommission = Math.round((targetCommission - rawDailySumCommission) * 100);
  if (dailyArr.length > 0) {
    if (diffCentsRevenue !== 0) {
      dailyArr[dailyArr.length - 1].revenue = +(dailyArr[dailyArr.length - 1].revenue + diffCentsRevenue / 100).toFixed(2);
    }
    if (diffCentsCommission !== 0) {
      dailyArr[dailyArr.length - 1].commission = +(dailyArr[dailyArr.length - 1].commission + diffCentsCommission / 100).toFixed(2);
    }
  }
  const curMonthRevenue = targetRevenue;
  const curMonthCommission = targetCommission;
  const curMonthTlCommission = +(totalTlCommissionGoldMonth / 1000).toFixed(2);
  const dailyAvg = +(daysPassed > 0 ? (curMonthRevenue / daysPassed).toFixed(2) : 0);
  const currentMonth = {
    yearMonth: `${yyyy}-${String(mm).padStart(2, '0')}`,
    daysInMonth,
    daysPassed,
    revenue: curMonthRevenue,
    commission: curMonthCommission,  // GL 版（组长展示用）
    dailyAvg
  };

  // 7. monthly 填充
  const monthlyMapGold = {};
  const monthlyMapCommissionGold = {};
  const monthlyMapTlCommGold = {};
  monthlyRaw.forEach(r => {
    monthlyMapGold[r._id] = r.totalGold || 0;
    monthlyMapCommissionGold[r._id] = r.totalCommissionGold || 0;
    monthlyMapTlCommGold[r._id] = r.totalTlCommissionGold || 0;
  });
  monthlySkeleton.forEach(mo => {
    const key = mo.month;
    if (key === currentMonth.yearMonth) {
      mo.revenue = curMonthRevenue;
      mo.commission = curMonthCommission;  // GL 版 display
    } else {
      mo.revenue = +(((monthlyMapGold[key] || 0)) / 1000).toFixed(2);
      mo.commission = +(((monthlyMapCommissionGold[key] || 0)) / 1000).toFixed(2);  // GL 版 display
    }
    delete mo._y;
    delete mo._m;
  });
  const monthly = monthlySkeleton.map(({ month, revenue, commission }) => ({ month, revenue, commission }));

  // 8. 职级 + levelConfig（🔴 核心：GL 端 levelConfig 由 P1-GL 档 + P2~P8-TL 档合并成完整8条，与团队长端结构完全一致）
  //    并行取：getLevelConfig()（GL P1 配置） + getTeamLeaderLevelConfig()（TL P2~P8 配置）
  const [glCfgRaw, tlCfgRaw] = await Promise.all([
    getLevelConfig(),
    getTeamLeaderLevelConfig(),
  ]);
  // 格式化：每条配置统一保留 6 个关键字段，并补齐 role 字段（便于前端识别档位归属）
  const glList = Array.isArray(glCfgRaw?.list) && glCfgRaw.list.length > 0
    ? glCfgRaw.list.slice(0, 1).map(l => ({
        level: l.level || 'P1',
        name:  l.name  || GROUP_LEADER_LEVEL_CONFIG_DEFAULTS[0].name,
        commission: l.commission ?? GROUP_LEADER_LEVEL_CONFIG_DEFAULTS[0].commission,
        minRevenue:   l.minRevenue   ?? GROUP_LEADER_LEVEL_CONFIG_DEFAULTS[0].minRevenue,
        targetRevenue:l.targetRevenue?? GROUP_LEADER_LEVEL_CONFIG_DEFAULTS[0].targetRevenue,
        role: l.role || 'GROUP_LEADER',
      }))
    : [ { ...GROUP_LEADER_LEVEL_CONFIG_DEFAULTS[0], role: 'GROUP_LEADER' } ];

  const tlList = Array.isArray(tlCfgRaw?.list) && tlCfgRaw.list.length > 0
    ? tlCfgRaw.list.map(l => ({
        level: l.level,
        name:  l.name,
        commission: l.commission,
        minRevenue:   l.minRevenue   ?? 0,
        targetRevenue:l.targetRevenue?? (l.minRevenue ?? 0),
        role: l.role || 'NORMAL_ADMIN',
      }))
    : TEAM_LEADER_LEVEL_CONFIG_DEFAULTS.map(l => ({ ...l, role: 'NORMAL_ADMIN' }));

  // 🔴 合并：GL P1 + TL P2~P8 = 8 条完整职级（按 minRevenue 升序排序，稳定结果）
  const mergedList = [...glList, ...tlList].sort((a, b) => a.minRevenue - b.minRevenue);

  // updatedAt / updatedBy：两者取更新时间更晚的那个（与 TL 端 levelConfig 结构同构）
  const glTime = glCfgRaw?.updatedAt ? new Date(glCfgRaw.updatedAt).getTime() : 0;
  const tlTime = tlCfgRaw?.updatedAt ? new Date(tlCfgRaw.updatedAt).getTime() : 0;
  const mergedUpdatedAt = new Date(Math.max(glTime, tlTime, Date.now()));
  const mergedUpdatedBy = (glTime >= tlTime ? (glCfgRaw?.updatedBy || '') : (tlCfgRaw?.updatedBy || '')) || '';

  // 计算组长当前 level（传 mergedList 完整8档 + Admin.manualLevel）
  const level = computeGroupLeaderLevel(totalRevenue, mergedList, adminDoc.manualLevel);

  // 🔴 如果是手动档 → 用 Admin.manualLevelSetAt 真实字段覆盖兜底值（否则保持 original）
  if (level.manualLevel && adminDoc.manualLevelSetAt) {
    level.manualLevelSetAt = adminDoc.manualLevelSetAt;
  }

  // 🔴 懒触发晋升：如果匹配到团队长档位（P2~P8）但当前角色仍是组长 → 自动晋升
  const curLevel = level.currentLevel || '';
  if (['P2','P3','P4','P5','P6','P7','P8'].includes(curLevel.toUpperCase()) && 
      String(adminDoc.role || '').toUpperCase() !== 'NORMAL_ADMIN') {
    try {
      await promoteGroupLeaderToTeamLeaderLocal(adminId, 'lazy_auto_upgrade');
      level.upgradePending = true;
    } catch (e) {
      console.error(`[getGroupLeaderPerformance] 懒触发晋升失败 ${adminId}:`, e.message || e);
    }
  }

  const levelConfig = {
    list: mergedList,
    updatedAt: mergedUpdatedAt,
    updatedBy: mergedUpdatedBy || 'system',
  };

  return {
    data: {
      summary,
      monthly,
      daily: dailyArr,
      currentMonth,
      level,
      levelConfig
    },
    // ⭐ 团队长端复用：原始金币加总，避免元级舍入误差累计
    _rawGold: {
      accGold,                           // 累计（至昨日）金币
      totalGoldMonth,                    // 当月金币
      totalCommissionGoldMonth,          // 当月提成金币（GL版：sum(gold*commissionRate)）
      totalTlCommissionGoldMonth,        // 当月提成金币（TL版：模型A spread，sum(gold*tlRateExpr)）
      currentMonthTlCommission: curMonthTlCommission, // 当月 TL commission（元，display用）
      monthlyMapGold,                    // {YYYY-MM: gold} 各月原始金币（含当月）
      monthlyMapCommissionGold,          // {YYYY-MM: commissionGold} 各月提成金币（GL版）
      monthlyMapTlCommGold,              // {YYYY-MM: commissionGold} 各月提成金币（TL版，模型A spread）
      dailyMapGold,                      // {YYYY-MM-DD: gold} 各日原始金币
      dailyMapCommissionGold,            // {YYYY-MM-DD: commissionGold} 各日提成金币（GL版）
      dailyMapTlCommGold,                // {YYYY-MM-DD: commissionGold} 各日提成金币（TL版，模型A spread）
      currentMonthYearMonth: currentMonth.yearMonth,
      yyyy, mm, daysInMonth, daysPassed,
      groupCreatedAt: group.createdAt,   // 组成立时间
      groupName: group.groupName || '',
      groupCommission: COMM,             // 当前组展示用比例（GL版）
      tlRateForContext,                  // TL_rate 历史兜底用的比例（≈P5.commission）
    }
  };
}

/**
 * 解析目标用户（支持 3 种输入）：
 *   1. Admin._id
 *   2. Admin.username （=组长 employeeId，最常用）
 *   3. Employee.employeeId → 再通过 Admin.username 对应找到管理员
 * 返回 { _id, username, role, teamGroupId, status } 或 null
 */
async function resolveTargetAdmin(userQueryStr) {
  const q = (userQueryStr || '').trim();
  if (!q) return null;
  const fields = '_id username role teamGroupId status';
  // 1) Admin._id
  try {
    const byId = await Admin.findById(q).select(fields).lean();
    if (byId) return byId;
  } catch (_) {}
  // 2) Admin.username (= employeeId)
  const byName = await Admin.findOne({ username: q }).select(fields).lean();
  if (byName) return byName;
  // 3) Employee.employeeId 兜底 → Admin.username
  const emp = await Employee.findOne({ employeeId: q }).select('employeeId').lean();
  if (emp?.employeeId) {
    const byEmp = await Admin.findOne({ username: emp.employeeId }).select(fields).lean();
    if (byEmp) return byEmp;
  }
  return null;
}

router.get('/group-leader/performance', authMiddleware, async (req, res) => {
  try {
    const monthCount = parseInt(req.query.monthCount, 10) || 12;
    const yearMonth = req.query.yearMonth;
    const yyyy = (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) ? Number(yearMonth.slice(0,4)) : null;
    const mm = (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) ? Number(yearMonth.slice(5,7)) : null;

    const jwtRole = req.user?.role;
    const jwtId = String(req.user?.id || '');
    const userIdRaw = (req.query.userId != null) ? String(req.query.userId).trim() : '';
    const isViewAsOther = userIdRaw !== '';

    let targetAdmin;
    let targetUserId;

    if (isViewAsOther) {
      // ===== 【A】看别人模式 =====
      if (jwtRole === 'GROUP_LEADER') {
        return res.status(403).json({ code: 403, success: false, message: '组长角色只能查看本人业绩', data: null });
      }
      targetAdmin = await resolveTargetAdmin(userIdRaw);
      if (!targetAdmin) {
        return res.status(404).json({ code: 404, success: false, message: '目标组长不存在', data: null });
      }
      if (targetAdmin.status === 'disabled') {
        return res.status(404).json({ code: 404, success: false, message: '目标组长不存在', data: null });
      }
      const targetRole = String(targetAdmin.role || '').toUpperCase().trim();
      // ================================================================
      // 🌿 B2方案 兼容分支：目标角色是 NORMAL_ADMIN（sub TL / 团队长小团队长）
      //   前端团队卡片的"业绩▸"按钮，传下来的 groupLeaderId 若是团队长本人的 id
      //   （如"洁然如初代理"的 groupLeaderId=fanjie._id，或"直推成员"的 groupLeaderId=cuiId）
      //   → 用 getTeamLeaderPerformance 返回该团队长的**完整业绩总览**（B2：看负责人职级&整体业绩）
      // ================================================================
      if (targetRole === 'NORMAL_ADMIN') {
        const targetAdminIdStr = targetAdmin._id.toString();
        const viewerRole = (jwtRole || '').toString().toUpperCase().trim();
        const viewerIsSuper = /SUPER/i.test(viewerRole);
        const viewerIsTL = /NORMAL/.test(viewerRole) || /NORMAL_ADMIN/i.test(jwtRole);
        const viewerIsAdminManager = viewerRole === 'ADMIN_MANAGER';
        let viewerOK = false;
        if (viewerIsSuper) viewerOK = true;
        else if (viewerIsAdminManager) {
          const viewerAdmin = await Admin.findById(jwtId).select('managedTeamIds').lean();
          const managedIds = viewerAdmin?.managedTeamIds?.map(id => String(id)) || [];
          viewerOK = managedIds.includes(targetAdminIdStr);
        }
        else if (viewerIsTL) {
          // 团队长查看：必须是自己 OR 自己的递归下属 TL（parentTlId 链条能连回 viewer）
          if (targetAdminIdStr === String(jwtId)) viewerOK = true;
          else viewerOK = await _isDescendantTeamLeader(targetAdminIdStr, String(jwtId));
        } else if (/GROUP_LEADER/i.test(jwtRole)) {
          // 组长：禁止看团队长详情
          viewerOK = false;
        }
        if (!viewerOK) {
          return res.status(403).json({ code: 403, success: false, message: '无权查看该团队长的业绩（非本战队或非其上级）', data: null });
        }
        const perfCacheKey = `glp_compat_tl_${targetAdminIdStr}_mc=${monthCount}_yy=${yyyy||'NA'}_mm=${mm||'NA'}`;
        const cachedCompat = get(perfCacheKey);
        if (cachedCompat) return res.json({ code: 0, success: true, message: 'ok（NORMAL_ADMIN兼容分支）', _targetRoleHint: 'NORMAL_ADMIN_SUB_TL', data: cachedCompat });
        const { data } = await getTeamLeaderPerformance(targetAdminIdStr, { monthCount, yearMonth: yyyy && mm ? `${yyyy}-${String(mm).padStart(2,'0')}` : undefined });
        try { set(perfCacheKey, data, 5*60*1000); } catch(_) {}
        return res.json({ code: 0, success: true, message: 'ok（NORMAL_ADMIN兼容分支：返回负责人整体业绩）', _targetRoleHint: 'NORMAL_ADMIN_SUB_TL', data });
      }
      // 下面是 GROUP_LEADER 分支（零回归，逻辑未动）
      if (targetRole !== 'GROUP_LEADER') {
        return res.status(404).json({ code: 404, success: false, message: '目标角色不是组长或团队长，无法查看业绩看板', data: null });
      }
      if (!targetAdmin.teamGroupId) {
        return res.status(404).json({ code: 404, success: false, message: '目标组长不存在或尚未绑定小组', data: null });
      }
      // 团队长：强校验目标组长必须归属自己战队
      if (jwtRole === 'NORMAL_ADMIN') {
        const tg = await TeamGroup.findById(targetAdmin.teamGroupId).select('_id teamLeaderId').lean();
        if (!tg) {
          return res.status(404).json({ code: 404, success: false, message: '目标组长不存在或尚未绑定小组', data: null });
        }
        if (String(tg.teamLeaderId) !== jwtId) {
          return res.status(403).json({ code: 403, success: false, message: '无权查看该组长的业绩（非本战队）', data: null });
        }
      }
      // ADMIN_MANAGER：检查目标组长所属团队是否在管理范围内
      if (jwtRole === 'ADMIN_MANAGER') {
        const viewerAdmin = await Admin.findById(jwtId).select('managedTeamIds').lean();
        const managedIds = viewerAdmin?.managedTeamIds?.map(id => String(id)) || [];
        if (managedIds.length === 0) {
          return res.status(403).json({ code: 403, success: false, message: '无权查看该组长的业绩（未分配管理团队）', data: null });
        }
        const tg = await TeamGroup.findById(targetAdmin.teamGroupId).select('_id teamLeaderId').lean();
        if (!tg) {
          return res.status(404).json({ code: 404, success: false, message: '目标组长不存在或尚未绑定小组', data: null });
        }
        if (!managedIds.includes(String(tg.teamLeaderId))) {
          return res.status(403).json({ code: 403, success: false, message: '无权查看该组长的业绩（非管理范围内的团队）', data: null });
        }
      }
      // SUPER_ADMIN：无战队校验，放行
      targetUserId = targetAdmin._id.toString();
    } else {
      // ===== 【B】自看模式（原接口行为，零回归）=====
      if (jwtRole !== 'GROUP_LEADER') {
        return res.status(403).json({ code: 403, success: false, message: '仅组长角色可查看本人业绩看板；团队长请通过 ?userId=xxx 查看旗下组长业绩', data: null });
      }
      targetAdmin = await Admin.findById(jwtId).select('_id username role teamGroupId status').lean();
      if (!targetAdmin || targetAdmin.status === 'disabled' || !targetAdmin.teamGroupId) {
        return res.status(404).json({ code: 404, success: false, message: '未找到组长信息或尚未绑定小组', data: null });
      }
      targetUserId = targetAdmin._id.toString();
    }

    // ⚡ 缓存命中前置：key 用 targetUserId（= 谁的业绩），与登录人 jwtUser.id 解耦！
    //    TL看/超管看/组长自己看 → 同一份 key，一起命中，也不会互相污染
    const cacheKey = `group-leader-performance-${targetUserId}-${monthCount}-${yyyy||'curY'}-${mm||'curM'}`;
    const cached = get(cacheKey);
    if (cached) {
      return res.json({ code: 0, message: 'ok', data: cached });
    }

    // getGroupLeaderPerformance 返回结构：{ data: {summary/monthly/daily/currentMonth/level/levelConfig}, _rawGold: {...} }
    const { data } = await getGroupLeaderPerformance(targetUserId, { monthCount, yearMonth });

    try { set(cacheKey, data, 5 * 60 * 1000); } catch (_) { /* 忽略 */ }

    return res.json({ code: 0, message: 'ok', data });
  } catch (error) {
    console.error('获取组长业绩看板失败:', error);
    return res.status(500).json({ code: 500, message: error.message || '服务器错误', data: null });
  }
});

// ==================== 团队长业绩看板（仅业绩，暂不含职级） ====================
// 统计口径：Total = D + Σ_g G_g
//   D     = 用户(parentId=teamLeader._id 且 不属于下属任何组的 employee) 的业绩
//   G_g   = 下属每一个组 g 的组长端已算好业绩（直接复用 getGroupLeaderPerformance，绝不重算，保证对账 1:1）

/**
 * 纯函数：团队长业绩看板（第一阶段，level/levelConfig = null）
 * @param {string} teamLeaderId - Admin._id（role=NORMAL_ADMIN）
 * @param {{ monthCount?: number }} opts
 * @returns {Promise<{ data: object }>}
 */
async function getTeamLeaderPerformance(teamLeaderId, opts = {}) {
  const monthCount = parseInt(opts.monthCount, 10) || 12;

  const bjNow = getBeijingDate();
  const curY = bjNow.getUTCFullYear();
  const curM = bjNow.getUTCMonth() + 1; // 1-based
  const yyyy = curY;
  const mm   = curM;

  // 1. 团队长身份：role = NORMAL_ADMIN + 团队信息（取 createdAt / teamName / 战队成立时间）
  //    也带 manualLevel / manualLevelSetAt / commission：用作「手动档优先」判级、手动档回传与 teamLeaderRateForD 兜底（老数据兼容）
  const tlAdmin = await Admin.findById(teamLeaderId).select('_id role teamName realName createdAt promotedAt manualLevel manualLevelSetAt commission').lean().exec();
  if (!tlAdmin) throw new Error('团队长账号不存在');
  if (tlAdmin.role !== 'NORMAL_ADMIN') throw new Error('无权限：仅团队长可访问');

  // ================================================================
  // 🌿 2~7. 核心三集合 + Rate公式 100% 复用 dashboard.computeNewKpi：
  //    保证「业绩 Tab」与「团队 Tab（KPI）」两个独立接口的
  //    teamRevenue / directRevenue / indirectRevenue / commission
  //    4 大口径逐笔一致，杜绝第二套逻辑导致 fan杰晋升TL后历史组
  //    「洁然如初代理」55人 ¥104,520 被 try/catch 兜底为 0 的漏算。
  //    时间段仍沿用业绩Tab原有业务语义（成立日累计/北京本月/monthCount
  //    月骨架），不硬套 KPI range，避免与「团队成立至今累计」语义冲突。
  // ================================================================
  const tlIdStr = teamLeaderId.toString();
  // 2. TL 兜底率 = TL Admin.commission（KPI 同款，取到 0 就 0）
  const tlFallbackRate = +tlAdmin.commission || 0;
  // 3. KPI 同款集合函数：直属D / 组长组G员工 / 下属一层TL的直属D bucket
  const directDIds = await dashboardRouter._getTLDirectDIds(tlIdStr);
  const subGIds    = await dashboardRouter._getTLSubGroupGIds(tlIdStr);
  const subTlAdms  = await Admin.find({ parentTlId: tlIdStr, role: /NORMAL_ADMIN|normal_admin/i })
    .select('_id commission').lean();
  const subTlBuckets = []; // [{ids, rate}]  每个下属一层 TL 单独按其率聚合（KPI同款）
  for (const t of subTlAdms) {
    const ids = await dashboardRouter._getTLDirectDIds(String(t._id));
    subTlBuckets.push({ ids, rate: +t.commission || 0 });
  }
  // 4. Rate 公式（KPI 同款导出函数，不再手写 $let/$cond）
  const dRate = dashboardRouter._dRateExpr(tlFallbackRate);
  const gRate = dashboardRouter._ptlRateExprForSubordinate(0.05, Math.max(0, tlFallbackRate - 0.05));

  // 5. 时间窗（业绩Tab业务语义保留，不跟随 KPI）
  // 5a. daily: 北京本月 1 号 → 昨天
  const { startTime: dailyStart, endTime: dailyEndUTC, daysInMonth } = beijingMonthRange(yyyy, mm);
  const { yesterdayEnd } = getBeijingYesterdayEnd();
  const dailyQueryEnd = new Date(Math.min(dailyEndUTC.getTime(), yesterdayEnd.getTime()));
  // 5b. monthly: monthCount 月骨架首月首日 → 最后一月月底
  const monthlySkeleton = buildMonthlySkeleton(monthCount);
  const firstMonth = monthlySkeleton[0];
  const { startTime: monthlyStartUTC } = beijingMonthRange(firstMonth._y, firstMonth._m);
  const lastMonth = monthlySkeleton[monthlySkeleton.length - 1];
  const lastY = lastMonth._y, lastM = lastMonth._m;
  const nextFirstUTC = new Date(Date.UTC(lastM === 12 ? lastY + 1 : lastY, lastM === 12 ? 0 : lastM, 1));
  const monthlyEndUTC = new Date(nextFirstUTC.getTime() - 8 * 60 * 60 * 1000);
  // 5c. 累计: 战队成立日 → 昨天（限制为最近90天，避免全表扫描）
  // ⚡ 修复：晋升的团队长，累计起点应取下属员工最早的入职时间，而非账号创建时间
  const teamFoundedUTC = tlAdmin.createdAt ? new Date(tlAdmin.createdAt) : new Date(Date.now() - 90 * 24 * 3600 * 1000);
  let accStart = new Date(Math.max(teamFoundedUTC.getTime(), Date.now() - 90 * 24 * 3600 * 1000));
  const accEnd = yesterdayEnd;
  
  // 若该团队长是从组长晋升的（有 promotedAt），则查找下属员工最早的入职时间作为累计起点
  if (tlAdmin.promotedAt) {
    try {
      const earliestEmp = await Employee.findOne({ 
        $or: [
          { parentId: tlIdStr },
          { teamGroupId: tlIdStr }
        ] 
      }).sort({ createdAt: 1 }).select('createdAt').lean();
      if (earliestEmp && earliestEmp.createdAt) {
        const empCreatedUTC = new Date(earliestEmp.createdAt);
        accStart = new Date(Math.min(accStart.getTime(), empCreatedUTC.getTime()));
      }
    } catch (_) { /* 忽略 */ }
  }

  // 6. 聚合工具：monthly/daily 分桶聚合；acc 总量直接走 dashboard._aggGold
  async function bucketAggregate(ids, start, end, rateExpr, fmt) {
    if (!ids || !ids.length) return {};
    const rows = await GoldLog.aggregate([
      { $match: { employeeId: { $in: ids }, createTime: { $gte: start, $lt: end } } },
      { $group: {
        _id: { $dateToString: { format: fmt, date: { $add: ['$createTime', 8*3600*1000] }, timezone: 'UTC' } },
        g: { $sum: '$gold' },
        c: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', rateExpr] }, 0] } },
      } }
    ]).exec();
    const out = {};
    rows.forEach(r => { if (r._id) out[r._id] = { g: +r.g||0, c: +r.c||0 }; });
    return out;
  }
  function mergeBucket(dst, src) {
    if (!src) return;
    Object.entries(src).forEach(([k, v]) => {
      if (!dst[k]) dst[k] = { g: 0, c: 0 };
      dst[k].g += v.g || 0;
      dst[k].c += v.c || 0;
    });
  }
  function sumAggArr(arr) {
    return arr.reduce((a,b)=>({
      totalGold: (a.totalGold||0) + (b.totalGold||0),
      totalCommissionGold: (a.totalCommissionGold||0) + (b.totalCommissionGold||0),
      count: (a.count||0) + (b.count||0),
    }), {totalGold:0, totalCommissionGold:0, count:0});
  }
  // 6a. acc 总量（summary / 佣金合计）
  const accDirect = await dashboardRouter._aggGold(directDIds, accStart, accEnd, dRate);
  const accSubG   = await dashboardRouter._aggGold(subGIds,    accStart, accEnd, gRate);
  const accSubTlArr = await Promise.all(subTlBuckets.map(b =>
    dashboardRouter._aggGold(b.ids, accStart, accEnd,
      dashboardRouter._ptlRateExprForSubordinate(b.rate, Math.max(0, tlFallbackRate - b.rate)))));
  const accSubTl = sumAggArr(accSubTlArr);
  // 6b. monthly 分桶 YYYY-MM
  const [mDir, mSubG, ...mSubTlArr] = await Promise.all([
    bucketAggregate(directDIds, monthlyStartUTC, monthlyEndUTC, dRate, '%Y-%m'),
    bucketAggregate(subGIds,    monthlyStartUTC, monthlyEndUTC, gRate, '%Y-%m'),
    ...subTlBuckets.map(b => bucketAggregate(b.ids, monthlyStartUTC, monthlyEndUTC,
      dashboardRouter._ptlRateExprForSubordinate(b.rate, Math.max(0, tlFallbackRate - b.rate)), '%Y-%m')),
  ]);
  const monthlyMap = {};
  mergeBucket(monthlyMap, mDir); mergeBucket(monthlyMap, mSubG);
  mSubTlArr.forEach(x => mergeBucket(monthlyMap, x));
  // 6c. daily 分桶 YYYY-MM-DD
  const [dDir, dSubG, ...dSubTlArr] = await Promise.all([
    bucketAggregate(directDIds, dailyStart, dailyQueryEnd, dRate, '%Y-%m-%d'),
    bucketAggregate(subGIds,    dailyStart, dailyQueryEnd, gRate, '%Y-%m-%d'),
    ...subTlBuckets.map(b => bucketAggregate(b.ids, dailyStart, dailyQueryEnd,
      dashboardRouter._ptlRateExprForSubordinate(b.rate, Math.max(0, tlFallbackRate - b.rate)), '%Y-%m-%d')),
  ]);
  const dailyMap = {};
  mergeBucket(dailyMap, dDir); mergeBucket(dailyMap, dSubG);
  dSubTlArr.forEach(x => mergeBucket(dailyMap, x));
  // 6d. 汇总金币/提成（D + ΣG + 下属一层TL直属D）
  const directAccGold = +accDirect.totalGold || 0;
  const groupsAccGold = +accSubG.totalGold   || 0;
  const subTlAccGold  = +accSubTl.totalGold  || 0;
  const directAccComm = +accDirect.totalCommissionGold || 0;
  const groupsAccComm = +accSubG.totalCommissionGold   || 0;
  const subTlAccComm  = +accSubTl.totalCommissionGold  || 0;
  const totalAccGold = directAccGold + groupsAccGold + subTlAccGold;
  const totalAccComm = directAccComm + groupsAccComm + subTlAccComm;
  // 7. 金额（元，4 舍 5 入 2 位）
  const directRevenue       = +(directAccGold / 1000).toFixed(2);
  const groupsRevenue       = +(groupsAccGold / 1000).toFixed(2);
  const subordinateTlRevenue = +(subTlAccGold  / 1000).toFixed(2);
  // ✅ 间推 = 组长组G + 下属一层TL直属D（2级封顶拿提成部分）
  //    保证 directRevenue + indirectRevenue === totalRevenue 恒成立
  //    避免前端只读 groupsRevenue 或只读 subordinateTlRevenue 导致漏算 8~9 万差额
  const indirectRevenue     = +(groupsRevenue + subordinateTlRevenue).toFixed(2);
  const totalRevenue        = +(totalAccGold  / 1000).toFixed(2);
  const totalCommission     = +(totalAccComm  / 1000).toFixed(2);

  // 9. 战队成立时间（ISO 字符串）+ 运营天数（北京时区整日段相减，不含两端都算+1，避免多2天）
  //    例：2026-03-10 03:21 UTC = 2026-03-10 11:21 BJ → 北京成立日=3月10日；今天BJ=7月11日 → 运营123天？
  //    严格：(BJ今日北京日期的UTC 0点) - (BJ成立日北京日期的UTC 0点)，再/86400000得整日差，+1表示"成立当天算1天"
  const teamFoundedAt = teamFoundedUTC.toISOString();
  const foundedBJDate = (() => {
    const d = new Date(teamFoundedUTC.getTime() + 8*3600*1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  })();
  const todayBJDate = (() => {
    const d = new Date(bjNow.getTime() + 8*3600*1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  })();
  const operatingDays = Math.max(1, Math.floor((todayBJDate - foundedBJDate) / 86400000) + 1);

  const summary = {
    totalRevenue,
    totalCommission,
    directRevenue,
    indirectRevenue,     // ✅ 间推业绩 = groupsRevenue + subordinateTlRevenue 合并，前端直接读
    groupsRevenue,       // 保留：组长组G员工业绩（间推中的一部分，调试用）
    subordinateTlRevenue,// 保留：下属一层TL直属D员工业绩（间推中的另一部分，调试用）
    teamFoundedAt,
    operatingDays,
    teamName: tlAdmin.teamName || ''
  };
  // 对账 1：totalRevenue === directRevenue + indirectRevenue（严格 ≤0.005 差）
  //        indirectRevenue 内部是 groupsRevenue + subordinateTlRevenue，等价于 direct+groups+subTl === total
  if (Math.abs(totalRevenue - (directRevenue + indirectRevenue)) >= 0.005) {
    summary.totalRevenue = +(directRevenue + indirectRevenue).toFixed(2);
  }

  // 10. daily 骨架（本月 1 号 → 昨天），从 dailyMap 桶读取 D+G+subTl 合并好的 {g, c}
  const { daily: dailyArr, daysPassed } = buildDailySkeleton(yyyy, mm);
  let totalGoldMonth = 0;
  let totalCommGoldMonth = 0;
  dailyArr.forEach(d => {
    const b = dailyMap[d.date] || { g: 0, c: 0 };
    totalGoldMonth     += b.g;
    totalCommGoldMonth += b.c;
    d.revenue    = +(b.g / 1000).toFixed(2);
    d.commission = +(b.c / 1000).toFixed(2);
  });

  const targetRevenue    = +(totalGoldMonth / 1000).toFixed(2);
  const targetCommission = +(totalCommGoldMonth / 1000).toFixed(2);
  const rawDailySumRevenue    = +dailyArr.reduce((s, d) => s + d.revenue, 0);
  const rawDailySumCommission = +dailyArr.reduce((s, d) => s + d.commission, 0);
  const diffCentsRevenue    = Math.round((targetRevenue    - rawDailySumRevenue)    * 100);
  const diffCentsCommission = Math.round((targetCommission - rawDailySumCommission) * 100);
  if (dailyArr.length > 0) {
    const last = dailyArr[dailyArr.length - 1];
    if (diffCentsRevenue !== 0) {
      last.revenue = +(last.revenue + diffCentsRevenue / 100).toFixed(2);
    }
    if (diffCentsCommission !== 0) {
      last.commission = +(last.commission + diffCentsCommission / 100).toFixed(2);
    }
  }
  const curMonthRevenue    = targetRevenue;
  const curMonthCommission = targetCommission;
  const dailyAvg = +(daysPassed > 0 ? (curMonthRevenue / daysPassed).toFixed(2) : 0);
  const currentMonth = {
    yearMonth: `${yyyy}-${String(mm).padStart(2,'0')}`,
    daysInMonth,
    daysPassed,
    revenue: curMonthRevenue,
    commission: curMonthCommission,
    dailyAvg
  };

  // 11. monthly 骨架（monthCount 月：正序） → 读 monthlyMap = D+G+subTl 已合并的 {g, c}
  monthlySkeleton.forEach(mo => {
    const k = mo.month;
    // 当月：优先用 daily 加总得到的 curMonthRevenue（与 daily 严格一致，避免桶间舍入/范围差）
    if (k === currentMonth.yearMonth) {
      mo.revenue    = curMonthRevenue;
      mo.commission = curMonthCommission;
    } else {
      const b = monthlyMap[k] || { g: 0, c: 0 };
      mo.revenue    = +(b.g / 1000).toFixed(2);
      mo.commission = +(b.c / 1000).toFixed(2);
    }
    delete mo._y;
    delete mo._m;
  });
  const monthly = monthlySkeleton.map(({ month, revenue, commission }) => ({ month, revenue, commission }));

  // 12. weekday 补到 daily（保留字段，正确或 0 都行，前端目前不渲染）
  dailyArr.forEach(d => {
    const [y,m,dd] = d.date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m-1, dd) + 8*3600*1000); // 北京当天 UTC+8
    // 北京当天是周几：JS getUTCDay —— dt 的 UTC 时间 = 北京当天 08:00；北京当天 00:00 UTC+8 = UTC 前一天 16:00
    // 简单：北京日期转星期 = 把「北京日期字符串 → UTC+0 0点，然后加 8h，再 getUTCDay」这样 UTC 日期+08:00 = 北京当天 08:00，星期和北京一致
    d.weekday = (new Date(Date.UTC(y, m-1, dd, 8, 0, 0))).getUTCDay();
  });

  // 13. 职级（第二阶段：填实 14 字段 + 7 档 levelConfig，与档表同步）
  //    关键：档表 getTeamLeaderLevelConfig() 与 computeTeamLeaderLevel() 用同一个 list，
  //    再一起写进缓存 → 下次缓存 hit 时 level 和 levelConfig 原子性保持一致，
  //    不会出现「判级用旧档但 levelConfig 显示新档」的不一致 bug。
  //    注意：levelConfig 返回结构必须是 {list:[{P2~P8}], updatedAt, updatedBy}，不要只返回数组（前端 TeamLeaderPerformance.tsx L? 用 data.levelConfig.list 渲染 7 个彩圈）
  const tlLevelCfgRaw = await getTeamLeaderLevelConfig();
  const tlLevelCfgList = Array.isArray(tlLevelCfgRaw) ? tlLevelCfgRaw
    : ( Array.isArray(tlLevelCfgRaw?.list) ? tlLevelCfgRaw.list : []);
  const level = computeTeamLeaderLevel(summary.totalRevenue, tlLevelCfgList, tlAdmin?.manualLevel);
  // ✅ 用 Admin 原表存的 manualLevelSetAt 覆盖 compute 函数的 new Date() 兜底值，前端显示"手动/自动"徽章和设置时间准确
  if (level && tlAdmin?.manualLevel && tlAdmin?.manualLevelSetAt) {
    level.manualLevelSetAt = tlAdmin.manualLevelSetAt;
  }
  const levelConfig = {
    list: tlLevelCfgList,
    updatedAt: tlLevelCfgRaw?.updatedAt || null,
    updatedBy: tlLevelCfgRaw?.updatedBy || null,
  };

  return {
    data: {
      summary,
      monthly,
      daily: dailyArr,
      currentMonth,
      level,           // 14 子字段（P2~P8）
      levelConfig,     // {list: 7档完整列表, updatedAt, updatedBy}，与超管 GET /admin/team-leader/level-config 逐字段一致
      // ✅ 顶层别名：方便前端/TDD 直接取，不影响旧 summary 字段兼容
      totalRevenue: summary.totalRevenue,
      totalCommission: summary.totalCommission,
      directRevenue: summary.directRevenue,     // ✅ 新增顶层别名：直推业绩（和 data.summary.directRevenue 同一值）
      indirectRevenue: summary.indirectRevenue  // ✅ 新增顶层别名：间推业绩（= groups + subTl 合并）
    }
  };
}

router.get('/team-leader/performance', authMiddleware, async (req, res) => {
  try {
    const viewerJwtId = String(req.user?.id || '');
    const viewerJwtRole = (req.user?.role || '').toString().toLowerCase();
    const currentViewer = await Admin.findById(viewerJwtId).select('_id role status username').lean();
    if (!currentViewer || currentViewer.status === 'disabled') {
      return res.status(403).json({ success: false, message: '用户不存在或已禁用' });
    }
    const viewerRole = (currentViewer.role || '').toString().toLowerCase();

    // 解析 userId 参数：缺失=看自己；有值=代理查看
    const userIdRaw = (req.query.userId != null) ? String(req.query.userId).trim() : '';
    const viewAs = userIdRaw !== '';
    const monthCount = parseInt(req.query.monthCount, 10) || 12;

    // 解析目标人
    let targetAdminId = viewerJwtId;   // 默认看自己
    if (viewAs) {
      let targetAdmin = null;
      try { targetAdmin = await Admin.findById(mongoose.Types.ObjectId.isValid(userIdRaw) ? userIdRaw : viewerJwtId).select('_id role status username').lean(); } catch(_){}
      // 兼容 userId 传 username / userId(user表的userId字符串) 的情况
      if (!targetAdmin) {
        targetAdmin = await Admin.findOne({ $or: [{ username: userIdRaw }, { userId: userIdRaw }] }).select('_id role status username').lean();
      }
      if (!targetAdmin || targetAdmin.status === 'disabled') return res.status(404).json({ success: false, message: '目标团队长不存在或已禁用' });
      const tRole = (targetAdmin.role || '').toString().toLowerCase();
      if (tRole !== 'normal_admin') return res.status(403).json({ success: false, message: '目标角色不是团队长，无法查看团队长业绩看板' });
      targetAdminId = targetAdmin._id.toString();

      // 权限判断：
      //   superadmin：放行
      //   ADMIN_MANAGER：目标团队长必须在自己的 managedTeamIds 中
      //   NORMAL_ADMIN：目标团队长必须是自己的「递归下属TL」（parentTlId链最终能通到viewer）
      if (viewerRole !== 'superadmin') {
        if (viewerRole === 'admin_manager') {
          // 高管：目标团队长必须在自己的 managedTeamIds 中
          const viewerAdmin = await Admin.findById(viewerJwtId).select('managedTeamIds').lean();
          const managedIds = viewerAdmin?.managedTeamIds || [];
          // 转换为字符串数组进行比较
          const managedIdStrings = managedIds.map(id => String(id));
          if (!managedIdStrings.includes(targetAdminId)) {
            return res.status(403).json({ success: false, message: '无权查看该团队长的业绩（不在您管理的团队范围内）' });
          }
        } else if (viewerRole === 'normal_admin') {
          // viewer 是 NORMAL_ADMIN 看别人 → 必须是自己或自己递归下属TL
          if (targetAdminId !== viewerJwtId) {
            const allowed = await _isDescendantTeamLeader(targetAdminId, viewerJwtId);
            if (!allowed) return res.status(403).json({ success: false, message: '无权查看该团队长的业绩（非本战队或非其上级）' });
          }
        } else {
          return res.status(403).json({ success: false, message: '无权代理查看团队长业绩' });
        }
      }
    } else {
      // 看自己：必须是 NORMAL_ADMIN 或者 superadmin 看自己（但 superadmin 不是 TL 直接拦）
      if (viewerRole !== 'normal_admin') {
        return res.status(403).json({ success: false, message: '无权限：仅团队长可访问团队长业绩接口（代理查看请传 ?userId=xxx）' });
      }
      targetAdminId = viewerJwtId;
    }

    // ⚡ 缓存前置：Key 绑定 viewer（身份）+ target（数据谁的）双维度，彻底防越权
    const cacheKey = `team-leader-performance-v2-viewer=${viewerJwtId}-target=${targetAdminId}-mc=${monthCount}`;
    const cached = get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const { data } = await getTeamLeaderPerformance(targetAdminId, { monthCount });

    try { set(cacheKey, data, 5 * 60 * 1000); } catch (_) { /* 忽略 */ }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[team-leader/performance] 异常:', err);
    return res.status(500).json({ success: false, message: err.message || '服务器错误' });
  }
});

// 辅助：判断 candidateId 是否属于 ancestorId 的「递归下属团队长」
// 权限链 = parentTlId 链（正式字段） +  TeamGroup.teamLeaderId 兜底（晋升TL时老数据 parentTlId 未回填的兼容）
async function _isDescendantTeamLeader(candidateId, ancestorId) {
  const a = String(ancestorId);
  const c = String(candidateId);
  if (a === c) return true;
  const visited = new Set([c]);
  let cur = c;
  // 最多跳 20 级（防止脏数据成环），2级封顶设计实际上最多跳2次
  for (let i = 0; i < 20; i++) {
    // 每一轮：从 cur 向上找"直接上级团队长候选集合"（可能有 1~2 个：parentTlId + TeamGroup.teamLeaderId）
    const adm = await Admin.findById(cur).select('parentTlId').lean();
    if (!adm) return false;
    const parents = new Set();
    if (adm.parentTlId) parents.add(String(adm.parentTlId));
    // 兜底：cur 当组长时挂过 TeamGroup 的，teamLeaderId 视为实际上级（兼容晋升 TL 但 parentTlId 未回填的老数据）
    try {
      const hisGroups = await TeamGroup.find({
        $or: [{ groupLeaderId: cur }, { groupLeaderId: new mongoose.Types.ObjectId(cur) }]
      }).select('teamLeaderId').lean();
      for (const g of hisGroups) {
        if (g.teamLeaderId) {
          const tl = String(g.teamLeaderId);
          // self-loop 防护：teamLeaderId 不能指向自己，否则跳过
          if (tl !== cur && tl !== c) parents.add(tl);
        }
      }
    } catch (_) {}
    if (parents.size === 0) return false;
    if (parents.has(a)) return true;
    // 任选一个未访问过的继续追（多数情况下只有1个上级），若全部访问过则终止
    let picked = null;
    for (const p of parents) {
      if (!visited.has(p)) { picked = p; break; }
    }
    if (!picked) return false;
    visited.add(picked);
    cur = picked;
  }
  return false;
}

// 组长专用接口：获取组提成和平均金币
// 性能注意：禁止 GoldLog.find 全量拉到 JS 内存。使用一次聚合 $cond+$sum 分桶算 range + 昨日
router.get('/group-leader/stats', authMiddleware, async (req, res) => {
  try {
    const { range = 'today' } = req.query;

    const cacheKey = `group-leader-stats-${req.user.id}-${range}`;
    const cachedData = get(cacheKey);
    if (cachedData) return res.json(cachedData);

    // 1. 必须先查 Admin（才拿得到 teamGroupId）
    const currentAdmin = await Admin.findById(req.user.id).lean();
    if (!currentAdmin) return res.status(404).json({ success: false, message: '用户不存在' });
    if (!currentAdmin.teamGroupId) return res.status(403).json({ success: false, message: '您不是组长，没有权限访问此接口' });

    // 2. 并行：TeamGroup + Employee
    const fanjieUserId = currentAdmin._id.toString();
    const fanjieTeamGroupId = currentAdmin.teamGroupId;
    const [group, employees] = await Promise.all([
      TeamGroup.findById(fanjieTeamGroupId).lean().exec(),
      Employee.find({
        $or: [
          { teamGroupId: fanjieTeamGroupId.toString() },
          { teamGroupId: fanjieTeamGroupId },
          { teamGroupId: fanjieUserId },
          { teamGroupId: currentAdmin._id }
        ]
      }).lean().select('employeeId').exec()
    ]);
    if (!group) return res.status(404).json({ success: false, message: '组不存在' });

    const employeeIds = employees.map(e => e.employeeId);
    const memberCount = employees.length;
    const COMM = +group.commission || 0;
    const rateExpr = {
      $cond: [
        { $and: [ { $gt: [ { $ifNull: ['$commissionRate', 0] }, 0 ] }, { $lte: [ { $ifNull: ['$commissionRate', 0] }, 1 ] } ] },
        '$commissionRate',
        COMM
      ]
    };

    // 3. 时间范围：range 区间 + 昨日区间，取并集一次查完
    const { startTime: rStart, endTime: rEnd } = getTimeRange(range);
    const { startTime: yStart, endTime: yEnd } = getTimeRange('yesterday');
    const aggStart = new Date(Math.min(rStart.getTime(), yStart.getTime()));
    const aggEnd   = new Date(Math.max(rEnd.getTime(),   yEnd.getTime()));

    const curCond = { $and: [{ $gte: ['$createTime', rStart] }, { $lt: ['$createTime', rEnd] }] };
    const ystCond = { $and: [{ $gte: ['$createTime', yStart] }, { $lt: ['$createTime', yEnd] }] };

    // 4. 聚合：一次 $group 里按命中桶分别累加 gold/count/commissionGold
    const pipeline = [
      { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: aggStart, $lt: aggEnd } } },
      { $project: { _id: 0, gold: 1, createTime: 1, commissionRate: 1 } },
      {
        $group: {
          _id: null,
          curGold:           { $sum: { $cond: [ curCond, '$gold', 0 ] } },
          curCount:          { $sum: { $cond: [ curCond, 1,      0 ] } },
          curCommissionGold: { $sum: { $cond: [ curCond, { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', rateExpr] }, 0] }, 0 ] } },
          ystGold:           { $sum: { $cond: [ ystCond, '$gold', 0 ] } },
          ystCount:          { $sum: { $cond: [ ystCond, 1,      0 ] } },
          ystCommissionGold: { $sum: { $cond: [ ystCond, { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', rateExpr] }, 0] }, 0 ] } }
        }
      }
    ];
    const [agg] = await GoldLog.aggregate(pipeline).exec();

    const curGold           = +(agg?.curGold           || 0);
    const curCount          = +(agg?.curCount          || 0);
    const curCommissionGold = +(agg?.curCommissionGold || 0);
    const ystGold           = +(agg?.ystGold           || 0);
    const ystCount          = +(agg?.ystCount          || 0);
    const ystCommissionGold = +(agg?.ystCommissionGold || 0);

    const totalEarnings       = curGold / 1000;
    const yesterdayEarnings   = ystGold / 1000;
    // 关键：commission = sum(gold * rate) / 1000，不再 * 当前组 COMM（避免追溯）
    const totalCommission     = curCommissionGold / 1000;
    const yesterdayCommission = ystCommissionGold / 1000;

    // 增长率（和原实现完全一致）
    const calcGrowth = (c, p) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);

    const responseData = {
      success: true,
      data: {
        groupName: group.groupName,
        groupLeaderName: group.groupLeaderName || currentAdmin.realName || currentAdmin.username,
        memberCount,
        totalAdExposure: curCount,
        totalGold: curGold,
        totalEarnings,
        totalCommission,
        earningsGrowthRate:   calcGrowth(totalEarnings,     yesterdayEarnings),
        commissionGrowthRate: calcGrowth(totalCommission,   yesterdayCommission),
        adExposureGrowthRate: calcGrowth(curCount,          ystCount)
      }
    };

    set(cacheKey, responseData, 15 * 60 * 1000);
    res.json(responseData);
  } catch (error) {
    console.error('获取组长统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================================
// 11. 超管：组长职级档位配置（4 个接口 + 权限边界）
// 路由前缀：/api/admin/group-leader/level-config
// ============================================================

function superAdminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: '缺少认证' });
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '权限不足，仅超级管理员可配置职级档位' });
  }
  next();
}

// 11.1 GET /api/admin/group-leader/level-config  超管查询当前档位
router.get('/admin/group-leader/level-config', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    // ⚡ 优化：getLevelConfig() 已返回 updatedAt，省掉额外的 GroupLeaderLevelConfig 查询
    const { list, updatedAt } = await getLevelConfig();
    res.json({
      success: true,
      data: { list, updatedAt }
    });
  } catch (error) {
    console.error('获取职级配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 11.2 GET /api/admin/group-leader/level-config/default  超管查看默认值（「恢复默认」按钮回显
router.get('/admin/group-leader/level-config/default', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    res.json({
      success: true,
      data: { list: JSON.parse(JSON.stringify(GROUP_LEADER_LEVEL_CONFIG_DEFAULTS)) }
    });
  } catch (error) {
    console.error('获取职级默认值错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 11.3 PUT /api/admin/group-leader/level-config  超管整体覆写档位（4 条）
router.put('/admin/group-leader/level-config', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { list } = req.body || {};
    const v = validateLevelConfigList(list);
    if (!v.ok) {
      return res.status(400).json({ success: false, message: v.message });
    }
    // 写入 DB（单文档 upsert）
    await GroupLeaderLevelConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: { levels: list, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    // 立即让配置 & 所有组长业绩缓存失效：下一次请求立刻用新档位算 level
    invalidateLevelRelatedCaches();
    // 🔒 档位变更立即同步所有 Admin.commission，避免老值污染
    const updated = await recomputeAllAdminsCommission('gl_level_config_put');
    // 返回更新后的值
    const { list: updatedList } = await getLevelConfig();
    res.json({
      success: true,
      message: `档位配置保存成功，所有组长职级已立即按新档位刷新（同步更新${updated}人佣金率）`,
      data: { list: updatedList }
    });
  } catch (error) {
    console.error('写入职级配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 11.4 POST /api/admin/group-leader/level-config/reset  超管一键恢复默认
router.post('/admin/group-leader/level-config/reset', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    await GroupLeaderLevelConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: { levels: GROUP_LEADER_LEVEL_CONFIG_DEFAULTS, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    invalidateLevelRelatedCaches();
    await recomputeAllAdminsCommission('gl_level_config_reset');
    const { list: updated } = await getLevelConfig();
    res.json({
      success: true,
      message: '职级档位已恢复默认，所有组长佣金率已同步刷新',
      data: { list: updated }
    });
  } catch (error) {
    console.error('重置职级配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================================
// 12. 超管：团队长职级档位配置（3 个接口 + 权限边界）
// 路由前缀：/api/admin/team-leader/level-config
// ============================================================

// 12.1 GET /api/admin/team-leader/level-config  超管查询当前档位
router.get('/admin/team-leader/level-config', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { list, updatedAt, updatedBy } = await getTeamLeaderLevelConfig();
    res.json({
      success: true,
      data: { list, updatedAt, updatedBy }
    });
  } catch (error) {
    console.error('获取团队长职级配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 12.2 PUT /api/admin/team-leader/level-config  超管整体覆写档位（4 条 P5~P8）
router.put('/admin/team-leader/level-config', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { list } = req.body || {};
    const v = validateTeamLeaderLevelConfigList(list);
    if (!v.ok) {
      return res.status(400).json({ success: false, message: v.message });
    }
    const who = (req.user && req.user.username) ? String(req.user.username) : 'superadmin';
    await TeamLeaderLevelConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: { levels: list, updatedAt: new Date(), updatedBy: who } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    // 清缓存三件套：配置 + 所有团队长 perf（下一请求立即重算新档位 + 新 level）
    invalidateLevelRelatedCaches();
    // 🔒 档位变更立即同步所有 Admin.commission
    const updatedCountTL = await recomputeAllAdminsCommission('tl_level_config_put');
    const { list: updated } = await getTeamLeaderLevelConfig();
    res.json({
      success: true,
      message: `团队长档位配置保存成功，所有团队长佣金率已同步刷新（更新${updatedCountTL}人）`,
      data: { list: updated }
    });
  } catch (error) {
    console.error('写入团队长职级配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 12.3 POST /api/admin/team-leader/level-config/reset  超管一键恢复默认
router.post('/admin/team-leader/level-config/reset', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const who = (req.user && req.user.username) ? String(req.user.username) : 'superadmin';
    await TeamLeaderLevelConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: { levels: TEAM_LEADER_LEVEL_CONFIG_DEFAULTS, updatedAt: new Date(), updatedBy: who } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    invalidateLevelRelatedCaches();
    await recomputeAllAdminsCommission('tl_level_config_reset');
    const { list: updated } = await getTeamLeaderLevelConfig();
    res.json({
      success: true,
      message: '团队长职级档位已恢复默认，所有团队长佣金率已同步刷新',
      data: { list: updated }
    });
  } catch (error) {
    console.error('重置团队长职级配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================================
// 13. PUT /api/admin/promote/group-leader-to-team-leader
//     【超管】组长晋升为团队长（3层级分账事务接口）
//
//  原子执行 5 步（MongoDB单实例无事务，用「快照+回滚」保证一致性）：
//   1) Admin.role 从 GROUP_LEADER → NORMAL_ADMIN；parentTlId=原战队TL._id；promotedAt=now
//   2) 该组长名下所有 TeamGroup：status='disbanded'，dissolvedAt=now（解散老组）
//   3) 老组所有 Employee：teamGroupId=null；parentId=晋升后TL._id（变成D直属，继续和上级TL相关）
//   4) 可选：记录操作日志（此处省略，和其他调整接口对齐）
//   5) 清所有相关缓存：组长/团队长业绩、职级配置缓存
//
//  Body:
//    groupLeaderId: String(required) —— 组长Admin._id
//    targetLevel?:   'P5'|'P6'|'P7'|'P8'（默认P5，预留扩展，暂时不强制）
// ============================================================
// ============================================================
// 【晋升接口抽本地函数】供懒触发晋升 / 手动调档跨角色时调用，不走HTTP
// 返回 Promise<any>，成功返回 {groupLeaderDoc, newTlDoc, dissolvedGroupCount, migratedEmployeeCount}
// 失败抛 {code, message}，不写 response
// ============================================================
async function promoteGroupLeaderToTeamLeaderLocal(groupLeaderId, who = 'system_lazy_upgrade', targetLevel = null) {
  groupLeaderId = String(groupLeaderId || '').trim();
  if (!groupLeaderId) throw { code: 400, message: '缺少 groupLeaderId' };
  let snapshot = null;
  try {
    // 🔧 加固：select 必须取出 parentTlId / promotedAt，避免空值覆盖已有值
    const gl = await Admin.findById(groupLeaderId).select('_id username role teamGroupId teamName parentTlId promotedAt commission manualLevel manualLevelSetAt').lean();
    if (!gl) throw { code: 404, message: 'groupLeaderId 不存在' };
    const roleNorm = (gl.role || '').toLowerCase();
    if (roleNorm === 'normal_admin') {
      // 已经是团队长，直接返回（幂等，懒触发时重复调用不报错）
      return { already: true, groupLeaderDoc: gl, newTlDoc: gl, dissolvedGroupCount: 0, migratedEmployeeCount: 0 };
    }
    if (roleNorm !== 'group_leader') throw { code: 400, message: `该帐号 role=${gl.role}，不是组长，无法晋升为团队长` };

    const oldGroups = await TeamGroup.find({ groupLeaderId: gl._id.toString() })
      .select('_id teamLeaderId status dissolvedAt').lean();

    // ============================================================
    // 🔒 三级兜底 parentTlId 绑定 —— 绝对不允许"组长升TL后脱离原战队"
    //    兜底1：老 TeamGroup.teamLeaderId（最优先，规范化存储）
    //    兜底2：老 Admin.parentTlId（幂等重入 / 手动调档跨角色的历史值）
    //    兜底3：从 Employee.teamGroupId=组长ID 的老员工中反推上级TL
    //           （员工.parentId ∈ NORMAL_ADMIN 集合者 → 即上级TL）
    // ============================================================
    let parentTlId = null;
    // 兜底1
    const parentTlFromGroup = oldGroups.map(g => g.teamLeaderId).find(t => !!t);
    if (parentTlFromGroup) parentTlId = String(parentTlFromGroup);
    // 兜底2（兜底1取不到时）
    if (!parentTlId && gl.parentTlId) parentTlId = String(gl.parentTlId);
    // 兜底3（兜底1/2都取不到且该组长原本有下属员工 → 必然属于某个战队 → 必须绑定）
    if (!parentTlId) {
      const myOldEmps = await Employee.find({ teamGroupId: gl._id.toString() }).select('parentId').lean();
      if (myOldEmps.length > 0) {
        const candParentIds = Array.from(new Set(myOldEmps.map(e => e.parentId).filter(Boolean).map(String)));
        if (candParentIds.length > 0) {
          const candAdmins = await Admin.find({
            _id: { $in: candParentIds.map(id => new mongoose.Types.ObjectId(id)) },
            role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
          }).select('_id').lean();
          if (candAdmins.length > 0) parentTlId = candAdmins[0]._id.toString();
        }
      }
    }
    // 断言：有老组(oldGroups>0) → 说明原来有战队归属，最终 parentTlId 必须非空（否则上报警告但不中断）
    if (oldGroups.length > 0 && !parentTlId) {
      console.warn(`[promote晋升] ⚠️ 组长 ${gl.username} 有${oldGroups.length}个老组但找不到上级TL，parentTlId仍为null！请检查老数据 TeamGroup.teamLeaderId / Employee.teamGroupId`);
    }
    const oldGroupIds = oldGroups.map(g => g._id.toString());
    // 🔴 关键修复：兼容两种存储方式（规范=teamGroupId=TeamGroup._id / 老习惯=teamGroupId=组长Admin._id）
    //    只要员工 teamGroupId 命中"组长Admin._id 或 任一组TeamGroup._id"，都算该组长的老员工 → 迁为TL直属D
    const empQuery = { $or: [{ teamGroupId: gl._id.toString() }] };
    if (oldGroupIds.length) empQuery.$or.push({ teamGroupId: { $in: oldGroupIds } });
    const empList = await Employee.find(empQuery).select('_id employeeId teamGroupId parentId').lean();
    const oldEmpIds = empList.map(e => e._id);

    // 🔧 加固：finalPromotedAt 保留已有 promotedAt；snapshot 保存真实值用于回滚不破坏
    const finalPromotedAt = gl.promotedAt || new Date();

    // ============================================================
    // 🔒 晋升同步更新 Admin.commission 为新档位对应率
    //    绝对不能让晋升后 commission 还是老值（如 fanjie=18% 老P7）污染后续 GoldLog 固化
    //    算法：晋升后按新 TL 的当前真实业绩跑 computeTeamLeaderLevel 算出正确档位率
    // ============================================================
    let newCommission = TEAM_LEADER_LEVEL_CONFIG_DEFAULTS[0].commission; // 默认 P2=8% 兜底
    let newManualLevel = null;
    try {
      const tlCfg = await getTeamLeaderLevelConfig();
      // 算业绩：本人直属D员工 + 各组G + 下属TL.D（刚晋升下属TL=0，主要是迁成D的老员工业绩）
      let accGold = 0;
      try {
        const myGroups = await TeamGroup.find({ teamLeaderId: gl._id.toString() }).select('_id').lean();
        const myGroupIds = myGroups.map(g => g._id.toString());
        const myGroupLeaderGroups = await TeamGroup.find({ groupLeaderId: gl._id.toString() }).select('_id').lean();
        const allGroupIds = Array.from(new Set([...myGroupIds, ...myGroupLeaderGroups.map(g=>g._id.toString())]));
        const directEmps = await Employee.find({ parentId: gl._id.toString() }).select('employeeId teamGroupId').lean();
        const directIds = directEmps.filter(e=>{
          const g = e.teamGroupId ? String(e.teamGroupId) : '';
          return !g || !allGroupIds.includes(g);
        }).map(e=>e.employeeId).filter(Boolean);
        const groupEmps = await Employee.find({ teamGroupId: { $in: allGroupIds.concat([gl._id.toString()]) } }).select('employeeId').lean();
        const groupIds = groupEmps.map(e=>e.employeeId).filter(Boolean);
        const allEmpIds = Array.from(new Set([...directIds, ...groupIds]));
        if (allEmpIds.length) {
          const GoldLogM = mongoose.model('GoldLog');
          const agg = await GoldLogM.aggregate([{ $match: { employeeId: { $in: allEmpIds }, gold: { $gt: 0 } } }, { $group: { _id: null, s: { $sum: '$gold' } } }]);
          accGold = agg[0]?.s || 0;
        }
      } catch(_) {}
      const totalRev = accGold / 1000;
      const lv = computeTeamLeaderLevel(totalRev, tlCfg);
      newCommission = +lv.currentCommission;
      // 🔒 若调用方传了 targetLevel（P2~P8）→ 强制按该档位率设置 commission（同时记 manualLevel）
      //    用于「晋升时直接指定档位」的管理端场景（如晋升时顺带给到P5）
      if (targetLevel) {
        const tlNorm = String(targetLevel).trim().toUpperCase();
        const tlCfgList = Array.isArray(tlCfg?.list) ? tlCfg.list : TEAM_LEADER_LEVEL_CONFIG_DEFAULTS;
        const hit = tlCfgList.find(l => String(l.level || '').toUpperCase() === tlNorm);
        if (hit && typeof hit.commission === 'number') {
          newCommission = +hit.commission;
          newManualLevel = tlNorm;
        }
      }
    } catch(_) {}

    snapshot = {
      glRole: gl.role,
      glTeamGroupId: typeof gl.teamGroupId !== 'undefined' ? (gl.teamGroupId ? String(gl.teamGroupId) : null) : undefined,
      oldGroups: oldGroups.map(g => ({ _id: g._id, status: g.status, dissolvedAt: g.dissolvedAt })),
      oldEmps: empList.map(e => ({ _id: e._id, teamGroupId: e.teamGroupId, parentId: e.parentId })),
      glParentTlId: gl.parentTlId || null,
      glPromotedAt: gl.promotedAt || null,
      glCommission: typeof gl.commission === 'number' ? gl.commission : null,
      glManualLevel: typeof gl.manualLevel === 'string' ? gl.manualLevel : null,
      glManualLevelSetAt: gl.manualLevelSetAt || null,
    };
    const updGl = await Admin.findByIdAndUpdate(gl._id, {
      // 🔧 加固：parentTlId 已优先兜底 gl.parentTlId；finalPromotedAt 绝不覆盖历史 promotedAt
      // 🔒 commission 更新为新晋TL档位对应率（防止老值污染）
      // 🔒 teamGroupId 清空：原来组长时代绑定的TeamGroup._id，升为TL后应脱离，否则会被误判为"组长视角"
      // 🔒 若传了 targetLevel 则 manualLevel=targetLevel（保留手动调档记录）
      $set: Object.assign(
        { role: 'NORMAL_ADMIN', parentTlId, promotedAt: finalPromotedAt,
          commission: newCommission, updatedAt: new Date(),
          teamGroupId: null  // ← 晋升后解除组长时代的战队绑定
        },
        newManualLevel ? { manualLevel: newManualLevel, manualLevelSetAt: new Date() } : {}
      )
    }, { new: true }).select('_id role parentTlId promotedAt commission manualLevel teamGroupId').lean();
    if (oldGroupIds.length) {
      await TeamGroup.updateMany({ _id: { $in: oldGroupIds } }, { $set: { status: 'disbanded', dissolvedAt: finalPromotedAt } });
    }
    if (oldEmpIds.length) {
      await Employee.updateMany({ _id: { $in: oldEmpIds } }, { $set: { teamGroupId: null, parentId: gl._id.toString() } });
    }
    invalidateLevelRelatedCaches();
    return {
      already: false,
      groupLeaderDoc: gl,
      newTlDoc: updGl,
      dissolvedGroupCount: oldGroups.length,
      migratedEmployeeCount: empList.length,
      promotedAt: finalPromotedAt,
      promotedBy: who
    };
  } catch (error) {
    console.error('[promoteGroupLeaderToTeamLeaderLocal] 出错回滚：', error.message || error);
    try {
      if (snapshot) {
        const rollbackSet = {
          role: snapshot.glRole,
          parentTlId: snapshot.glParentTlId,
          promotedAt: snapshot.glPromotedAt,
          updatedAt: new Date()
        };
        if ('glTeamGroupId' in snapshot) rollbackSet.teamGroupId = snapshot.glTeamGroupId; // 回滚 teamGroupId 到晋升前值
        if (typeof snapshot.glCommission === 'number') rollbackSet.commission = snapshot.glCommission;
        if (snapshot.glManualLevel) rollbackSet.manualLevel = snapshot.glManualLevel;
        if (snapshot.glManualLevelSetAt) rollbackSet.manualLevelSetAt = snapshot.glManualLevelSetAt;
        else {
          rollbackSet.manualLevel = null;
          rollbackSet.manualLevelSetAt = null;
        }
        await Admin.findByIdAndUpdate(groupLeaderId, { $set: rollbackSet });
        for (const g of snapshot.oldGroups || []) {
          await TeamGroup.findByIdAndUpdate(g._id, { $set: { status: g.status || 'active', dissolvedAt: g.dissolvedAt } });
        }
        for (const e of snapshot.oldEmps || []) {
          await Employee.findByIdAndUpdate(e._id, { $set: { teamGroupId: e.teamGroupId, parentId: e.parentId } });
        }
        invalidateLevelRelatedCaches();
      }
    } catch (rbErr) {
      console.error('[promoteGroupLeaderToTeamLeaderLocal] 回滚失败，请手动处理：', rbErr.message || rbErr);
    }
    const e = (typeof error === 'object' && error.code) ? error : { code: 500, message: error.message || '晋升错误' };
    throw e;
  }
}

// ============================================================
// 13. PUT /api/admin/promote/group-leader-to-team-leader
//     【超管】组长晋升为团队长（3层级分账事务接口）
// ============================================================
router.put('/admin/promote/group-leader-to-team-leader', authMiddleware, superAdminOnly, async (req, res) => {
  const groupLeaderId = String(req.body?.groupLeaderId || '').trim();
  if (!groupLeaderId) return res.status(400).json({ success: false, message: '缺少必填参数 groupLeaderId' });
  const who = (req.user?.username) || 'superadmin';
  const targetLevel = req.body?.targetLevel || null;
  try {
    const r = await promoteGroupLeaderToTeamLeaderLocal(groupLeaderId, who, targetLevel);
    res.json({
      success: true,
      message: r.already
        ? `该组长已是团队长，无需重复晋升`
        : `组长 ${r.groupLeaderDoc.username} 晋升为团队长，老组${r.dissolvedGroupCount}个解散，老员工${r.migratedEmployeeCount}人转为直属D`,
      data: { ...r, promotedBy: who }
    });
  } catch (e) {
    res.status(e.code || 400).json({ success: false, message: e.message || '晋升失败' });
  }
});

// ====================================================================
// 【职级 v2】统一 8 档职级配置 + 自动匹配 + 懒触发晋升 + 手动调档
// ====================================================================
const LEVEL_V2_DEFAULTS = [
  { level: 'P1', minRevenue: 0,       commission: 0.05, role: 'GROUP_LEADER' },
  { level: 'P2', minRevenue: 30000,   commission: 0.08, role: 'NORMAL_ADMIN' },
  { level: 'P3', minRevenue: 100000,  commission: 0.10, role: 'NORMAL_ADMIN' },
  { level: 'P4', minRevenue: 200000,  commission: 0.12, role: 'NORMAL_ADMIN' },
  { level: 'P5', minRevenue: 500000,  commission: 0.14, role: 'NORMAL_ADMIN' },
  { level: 'P6', minRevenue: 1000000, commission: 0.16, role: 'NORMAL_ADMIN' },
  { level: 'P7', minRevenue: 2000000, commission: 0.18, role: 'NORMAL_ADMIN' },
  { level: 'P8', minRevenue: 3000000, commission: 0.20, role: 'NORMAL_ADMIN' },
];
const LEVEL_V2_SYSTEM_KEY = 'level_config_v2';
const LEVEL_V2_CACHE_KEY = 'lvl_v2_cache';
const LEVEL_V2_CACHE_TTL = 60 * 60 * 1000;
async function getLevelConfigV2() {
  const cached = get(LEVEL_V2_CACHE_KEY);
  if (cached && Array.isArray(cached.list) && cached.list.length === 8) {
    return { list: cached.list.slice(), updatedAt: cached.updatedAt || null, updatedBy: cached.updatedBy || '' };
  }
  let list = null, updatedAt = null, updatedBy = '';
  try {
    const SystemConfig = mongoose.models.SystemConfig || require('../models/SystemConfig');
    const doc = await SystemConfig.findOne({ key: LEVEL_V2_SYSTEM_KEY }).lean();
    if (doc && Array.isArray(doc.value?.levels) && doc.value.levels.length === 8) {
      list = doc.value.levels;
      updatedAt = doc.updatedAt || null;
      updatedBy = doc.value?.updatedBy || '';
    }
  } catch (_) {}
  if (!list) list = LEVEL_V2_DEFAULTS.map(x => ({ ...x }));
  list = list.slice().sort((a, b) => (a.minRevenue || 0) - (b.minRevenue || 0));
  set(LEVEL_V2_CACHE_KEY, { list, updatedAt, updatedBy }, LEVEL_V2_CACHE_TTL);
  return { list, updatedAt, updatedBy };
}
async function saveLevelConfigV2(levels, operatorName = '') {
  if (!Array.isArray(levels) || levels.length !== 8) {
    throw new Error('levels 必须是长度为 8 的数组');
  }
  // 合法性校验：P1~P8 按序，minRevenue 递增，commission ∈ (0,1]
  const sorted = levels.slice().sort((a,b) => Number(a.minRevenue||0) - Number(b.minRevenue||0));
  const expectedLevels = ['P1','P2','P3','P4','P5','P6','P7','P8'];
  sorted.forEach((lv, i) => {
    if (lv.level !== expectedLevels[i]) throw new Error(`档位顺序错误，第${i}位应为${expectedLevels[i]}`);
    if (typeof lv.commission !== 'number' || lv.commission <= 0 || lv.commission > 1) {
      throw new Error(`${lv.level} commission 范围 (0,1]`);
    }
  });
  const saved = sorted.map(lv => ({ level: lv.level, minRevenue: Number(lv.minRevenue)||0, commission: +lv.commission, role: lv.role || (lv.level === 'P1' ? 'GROUP_LEADER' : 'NORMAL_ADMIN') }));
  try {
    const SystemConfig = mongoose.models.SystemConfig || require('../models/SystemConfig');
    const updatedAt = new Date();
    await SystemConfig.findOneAndUpdate(
      { key: LEVEL_V2_SYSTEM_KEY },
      { $set: { value: { levels: saved, updatedBy: operatorName || '' }, updatedAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    console.error('[saveLevelConfigV2] 保存失败：', e.message || e);
    throw new Error('职级配置保存失败：' + (e.message || ''));
  }
  try { clear(); } catch (_) {}
  invalidateLevelRelatedCaches();
  return { list: saved };
}

/**
 * 统一职级匹配（v2）：manual优先 → 自动按累计营收匹配
 *   - adminOrAdminId: Admin._id 或 Admin 文档 或 null
 *   - totalRevenue: 累计营收（分？元？统一按「元」，minRevenue 单位元）
 *   - options.allowLazy: true 时，若匹配到 TL 档位但当前是组长，自动懒触发晋升
 */
async function computeLevel(adminOrAdminId = null, totalRevenue = 0, { allowLazy = true } = {}) {
  const cfg = await getLevelConfigV2();
  const list = cfg.list; // 按 minRevenue 升序
  let adminDoc = null;
  if (adminOrAdminId) {
    adminDoc = typeof adminOrAdminId === 'object' && adminOrAdminId._id
      ? adminOrAdminId
      : await Admin.findById(adminOrAdminId).select('_id role manualLevel commission parentTlId teamGroupId promotedAt username').lean();
  }
  // ① 手动档优先
  if (adminDoc?.manualLevel) {
    const match = list.find(l => l.level === adminDoc.manualLevel);
    if (match) {
      // 手动档如果是 TL 档（P2~P8）但角色仍为 GROUP_LEADER → 懒触发晋升
      if (allowLazy && match.role === 'NORMAL_ADMIN' && String(adminDoc.role || '').toUpperCase() === 'GROUP_LEADER') {
        try { await promoteGroupLeaderToTeamLeaderLocal(adminDoc._id, 'manual_level_upgrade'); } catch (_) {}
        // 刷新一下 adminDoc
        adminDoc = await Admin.findById(adminDoc._id).select('_id role manualLevel commission parentTlId teamGroupId promotedAt').lean() || adminDoc;
      }
      return { ...match, manual: true, adminDoc };
    }
  }
  // ② 自动：找到最高一档满足 minRevenue ≤ totalRevenue
  totalRevenue = Number(totalRevenue) || 0;
  let matched = list[0]; // 兜底 P1
  for (let i = list.length - 1; i >= 0; i--) {
    if (totalRevenue >= Number(list[i].minRevenue || 0)) { matched = list[i]; break; }
  }
  // 懒触发晋升：自动档 role=TL 且当前角色=GROUP_LEADER → 晋升
  if (allowLazy && adminDoc && matched.role === 'NORMAL_ADMIN' && String(adminDoc.role || '').toUpperCase() === 'GROUP_LEADER') {
    try { await promoteGroupLeaderToTeamLeaderLocal(adminDoc._id, 'lazy_auto_upgrade'); } catch (_) {}
    adminDoc = await Admin.findById(adminDoc._id).select('_id role manualLevel commission parentTlId teamGroupId promotedAt').lean() || adminDoc;
  }
  return { ...matched, manual: false, adminDoc };
}

// ---- v2 职级配置接口（GET/PUT）（超管） ----
router.get('/admin/level-config/v2', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const r = await getLevelConfigV2();
    res.json({ success: true, data: r });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || '读取失败' });
  }
});
router.put('/admin/level-config/v2', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const levels = req.body?.levels;
    const who = (req.user?.username) || 'superadmin';
    const r = await saveLevelConfigV2(levels, who);
    invalidateLevelRelatedCaches();
    const updateCount = await recomputeAllAdminsCommission('v2_level_config_put');
    res.json({ success: true, data: { list: r.list }, message: `新8档职级配置已保存（同步刷新${updateCount}人佣金率）` });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '保存失败' });
  }
});

// ---- 超管手动调档：抽成本地函数供懒触发/TDD/手动接口共用 ----
async function setAdminManualLevelLocal(adminId, level, who = 'superadmin') {
  adminId = String(adminId || '').trim();
  if (!adminId) throw { code: 400, message: '缺少 adminId' };
  const levelNorm = level === null ? null : String(level || '').trim() || null;
  const allowed = ['P1','P2','P3','P4','P5','P6','P7','P8', null];
  if (!allowed.includes(levelNorm)) {
    throw { code: 400, message: 'level 必须是 P1~P8 或 null（恢复自动）' };
  }
  const admin = await Admin.findById(adminId).select('_id username role commission manualLevel teamGroupId parentTlId').lean();
  if (!admin) throw { code: 404, message: 'adminId 不存在' };
  const roleNow = String(admin.role || '').toUpperCase();
  // 🔴 TL 不允许手动降回 P1 组长
  if (roleNow === 'NORMAL_ADMIN' && levelNorm === 'P1') {
    throw {
      code: 400,
      message: 'TL 不允许降回组长 P1；最低仅可降为 TL P2（8%）'
    };
  }
  let newCommission = admin.commission;
  let newRole = admin.role;
  let newLevel = levelNorm;
  const cfg = await getLevelConfigV2();
  if (levelNorm === null) {
    newCommission = roleNow === 'NORMAL_ADMIN' ? cfg.list[1].commission : cfg.list[0].commission;
  } else {
    const matched = cfg.list.find(l => l.level === levelNorm);
    if (!matched) throw { code: 400, message: 'level 不存在' };
    newCommission = +matched.commission;
    newRole = matched.role;
    // 跨角色晋升（P1 → P2~P8）
    if (roleNow === 'GROUP_LEADER' && matched.role === 'NORMAL_ADMIN') {
      await promoteGroupLeaderToTeamLeaderLocal(admin._id, 'manual_upgrade_' + who);
    }
  }
  const updatedAt = new Date();
  await Admin.findByIdAndUpdate(admin._id, {
    $set: {
      manualLevel: newLevel,
      manualLevelSetAt: newLevel === null ? null : updatedAt,
      commission: newCommission,
      role: newRole,
      updatedAt
    }
  });
  invalidateLevelRelatedCaches();
  return {
    _id: admin._id.toString(),
    oldManualLevel: admin.manualLevel,
    newManualLevel: newLevel,
    oldCommission: admin.commission,
    newCommission,
    newRole,
    message: newLevel === null ? '已取消手动指定' : `已手动指定为 ${newLevel}（${(newCommission*100).toFixed(1)}%）`
  };
}
// 导出 setAdminManualLevelLocal 放到后面 module.exports=router 之后，避免被覆盖

// ---- 超管手动调档 PUT /api/admin/:adminId/manual-level ----
router.put('/admin/:adminId/manual-level', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const adminId = req.params.adminId;
    const level = req.body?.level;
    const who = (req.user?.username) || 'superadmin';
    const r = await setAdminManualLevelLocal(adminId, level, who);
    res.json({ success: true, message: r.message, data: r });
  } catch (e) {
    console.error('[PUT /admin/:id/manual-level] err:', e.message || e);
    res.status(e.code || 500).json({ success: false, message: e.message || '调档失败' });
  }
});

// ============================================================
// 🔒 档位配置变更触发：批量聚合所有员工gold → 计算每个Admin业绩 → 重算commission
//    性能优化（避免每个Admin跑一次业绩大SQL：一次GoldLog聚合搞定所有TL/GL）
//    每次档位 PUT/RESET 后调用，防止 Admin.commission 老值污染 GoldLog 固化
// ============================================================
async function recomputeAllAdminsCommission(who = 'config_update') {
  const START = Date.now();
  try {
    const tlCfg = await getTeamLeaderLevelConfig();
    const glCfg = await getLevelConfig();
    const allAdmins = await Admin.find({
      role: { $in: ['NORMAL_ADMIN', 'normal_admin', 'GROUP_LEADER', 'group_leader'] },
      username: { $nin: ['admin', 'testest001'] }
    }).select('_id username role commission parentTlId manualLevel').lean();
    if (allAdmins.length === 0) return 0;

    // ============ 关键：统一调用 getTeamLeaderPerformance / getGroupLeaderPerformance 取真实业绩口径 ============
    //  业绩口径=「分账固化+2级封顶+谁拿了提成算谁业绩」，绝对不能自己写revOfAdmin瞎算！
    //  虽然对每个Admin单独查询的方式稍慢，但32个Admin约6-8秒完全可接受，且100%与用户看到的页面/接口数据一致。
    // =========================================================================================================
    let updatedCount = 0;
    for (const a of allAdmins) {
      try {
        const roleNorm = (a.role || '').toLowerCase();
        // 1. 取真实业绩totalRevenue（与接口/页面100%一致）
        let totalRev = 0;
        if (roleNorm === 'normal_admin') {
          const perf = await getTeamLeaderPerformance(a._id.toString(), { allowLazy: false });
          totalRev = +(perf?.data?.summary?.totalRevenue || perf?.data?.currentMonth?.revenue || perf?.summary?.totalRevenue || 0);
        } else {
          const perf = await getGroupLeaderPerformance(a._id.toString(), { allowLazy: false });
          totalRev = +(perf?.data?.summary?.totalRevenue || perf?.data?.currentMonth?.commission || perf?.summary?.totalRevenue || 0);
          if (!totalRev) {
            // 兼容getGroupLeaderPerformance字段路径：currentMonth.commission是组长当月拿了提成的业绩总和（sum gold×commissionRate=6%，不对）
            // 退而求其次：取sum(gold)口径，用summary.totalRevenue作为真实业绩
            const summary = perf?.data?.summary || perf?.summary || {};
            totalRev = +(summary.totalRevenue || (typeof summary.totalGold === 'number'? summary.totalGold/1000: 0));
          }
        }
        // 2. manualLevel手动调档绝对优先
        let expected;
        let hitManual = false;
        if (a.manualLevel && typeof a.manualLevel === 'string') {
          const normLvl = String(a.manualLevel).trim().toUpperCase();
          const cfgList = roleNorm === 'normal_admin' ? (Array.isArray(tlCfg?.list)?tlCfg.list:[]) : (Array.isArray(glCfg?.list)?glCfg.list:[]);
          const hit = cfgList.find(l => String(l.level||'').toUpperCase() === normLvl);
          if (hit && typeof hit.commission === 'number') {
            expected = +hit.commission;
            hitManual = true;
          }
        }
        // 3. 无手动调档时按「真实业绩 → 档位 → 佣金率」自动算（100%和页面level一致）
        if (!hitManual) {
          const lv = roleNorm === 'normal_admin'
            ? computeTeamLeaderLevel(totalRev, tlCfg)
            : computeGroupLeaderLevel(totalRev, glCfg);
          expected = +lv.currentCommission;
        }
        if (Math.abs((+a.commission || 0) - expected) > 1e-9) {
          await Admin.findByIdAndUpdate(a._id, { $set: { commission: expected, updatedAt: new Date() } });
          updatedCount++;
          if (hitManual) console.log(`  [recompute] manualLevel强制：username=${a.username} manualLevel=${a.manualLevel} commission→${(expected*100).toFixed(1)}%`);
          else console.log(`  [recompute] 自动档位：username=${a.username} 业绩¥${(totalRev||0).toLocaleString('zh-CN',{maximumFractionDigits:0})} commission→${(expected*100).toFixed(1)}%（老值${(+a.commission||0)*100}%）`);
        }
      } catch(e) { console.warn(`  [recompute] ${a.username}(${a._id})刷新失败跳过：`, e.message||e); }
    }
    const ms = Date.now() - START;
    console.log(`[recomputeAllAdminsCommission(${who})] 耗时${ms}ms 刷新 ${updatedCount}/${allAdmins.length} commission 个 Admin`);
    return updatedCount;
  } catch (e) {
    console.error('[recomputeAllAdminsCommission] 刷新失败，不阻塞：', e.message || e);
    return 0;
  }
}

module.exports = router;
// 导出职级常量与纯函数（便于 TDD 测试脚本复用 + 其它路由未来调用）
module.exports.GROUP_LEADER_LEVEL_CONFIG = GROUP_LEADER_LEVEL_CONFIG;
module.exports.GROUP_LEADER_LEVEL_CONFIG_DEFAULTS = GROUP_LEADER_LEVEL_CONFIG_DEFAULTS;
module.exports.computeGroupLeaderLevel = computeGroupLeaderLevel;
module.exports.getLevelConfig = getLevelConfig;
module.exports.invalidateLevelRelatedCaches = invalidateLevelRelatedCaches;
module.exports.validateLevelConfigList = validateLevelConfigList;
// 团队长职级导出
module.exports.TEAM_LEADER_LEVEL_CONFIG = TEAM_LEADER_LEVEL_CONFIG;
module.exports.TEAM_LEADER_LEVEL_CONFIG_DEFAULTS = TEAM_LEADER_LEVEL_CONFIG_DEFAULTS;
// 业绩查询函数导出：供 TDD 脚本本地调用（同进程同连接，避免 HTTP 跨库/跨缓存问题）
if (typeof getTeamLeaderPerformance !== 'undefined') {
  module.exports.getTeamLeaderPerformance = getTeamLeaderPerformance;
}
if (typeof getGroupLeaderPerformance !== 'undefined') {
  module.exports.getGroupLeaderPerformance = getGroupLeaderPerformance;
}
module.exports.computeTeamLeaderLevel = computeTeamLeaderLevel;
module.exports.getTeamLeaderLevelConfig = getTeamLeaderLevelConfig;
module.exports.validateTeamLeaderLevelConfigList = validateTeamLeaderLevelConfigList;
// ============ 职级 v2 导出（供 TDD/外部调用） ============
module.exports.computeLevel = computeLevel;
module.exports.getLevelConfigV2 = getLevelConfigV2;
module.exports.saveLevelConfigV2 = saveLevelConfigV2;
module.exports.LEVEL_V2_DEFAULTS = LEVEL_V2_DEFAULTS;
module.exports.promoteGroupLeaderToTeamLeaderLocal = promoteGroupLeaderToTeamLeaderLocal;
module.exports.setAdminManualLevelLocal = setAdminManualLevelLocal;
module.exports.recomputeAllAdminsCommission = recomputeAllAdminsCommission;
// 简化版：读 Admin.commission（手动调档/自动晋升后均已更新此字段，GoldLog.pre('save') 可取到最新值）
module.exports.getGroupLeaderCommission = async function getGroupLeaderCommission(glId) {
  if (!glId) return 0.05;
  try {
    const doc = await Admin.findById(glId).select('commission').lean();
    if (doc && typeof doc.commission === 'number' && doc.commission > 0) return +doc.commission;
  } catch (_) {}
  return 0.05;
};
module.exports.getTeamLeaderCommission = async function getTeamLeaderCommission(tlId) {
  if (!tlId) return 0.08;
  try {
    const doc = await Admin.findById(tlId).select('commission').lean();
    if (doc && typeof doc.commission === 'number' && doc.commission > 0) return +doc.commission;
  } catch (_) {}
  return 0.08;
};
