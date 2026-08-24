// ================================================================
// 超管专属 supervisorManage：团队长 / 组长 管理路由（8 条接口）
// 挂载：/api/admin/supervisor  →  最终 URL 例如 /api/admin/supervisor/team-leaders
// 权限：全部 SUPER_ADMIN（小写 superadmin，和 verification.superAdminOnly 一致）
// ================================================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Employee = require('../models/Employee');
const TeamGroup = require('../models/TeamGroup');
const { hashPassword, comparePassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');

// ---------- 工具：状态枚举 & 校验 ----------
// DB 内部兼容旧枚举 enabled/disabled（因为接口9 PUT /admin/account/:id/status 不改动）
// 对外（supervisor 接口）统一使用用户要求的新枚举 active/inactive
function _inStatus(s) {
  const n = String(s || '').trim().toLowerCase();
  if (n === 'active' || n === 'enabled') return 'enabled';
  if (n === 'inactive' || n === 'disabled') return 'disabled';
  return null; // 无效
}
function _outStatus(s) {
  const n = String(s || '').toLowerCase();
  if (n === 'active' || n === 'enabled') return 'active';
  return 'inactive';
}
const ROLE_NORMAL_ADMIN = 'NORMAL_ADMIN';
const ROLE_GROUP_LEADER = 'GROUP_LEADER';
const ROLE_ADMIN_MANAGER = 'ADMIN_MANAGER';

// ---------- 权限：只有 SUPER_ADMIN 放行 ----------
function _isSuper(req) {
  return !!(req && req.user && (req.user.role === 'superadmin' || String(req.user.role).toUpperCase() === 'SUPER_ADMIN'));
}
function superAdminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: '缺少认证' });
  if (!_isSuper(req)) return res.status(403).json({ success: false, message: '权限不足，仅超级管理员可操作。' });
  next();
}

// ---------- 权限：SUPER_ADMIN 或 ADMIN_MANAGER 放行 ----------
function _isAdminManager(req) {
  return !!(req && req.user && String(req.user.role).toUpperCase() === ROLE_ADMIN_MANAGER);
}
function superOrAdminManagerOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: '缺少认证' });
  if (!_isSuper(req) && !_isAdminManager(req)) return res.status(403).json({ success: false, message: '权限不足，仅超级管理员或高级管理员可操作。' });
  next();
}

// ---------- 数据范围过滤：返回当前用户能管理的团队长 ID 列表 ----------
// SUPER_ADMIN → null（不限制）
// ADMIN_MANAGER → managedTeamIds（限制范围）
async function _getScopeTeamIds(req) {
  if (_isSuper(req)) return null;
  if (_isAdminManager(req)) {
    const admin = await Admin.findById(req.user.id).select('managedTeamIds').lean();
    return admin?.managedTeamIds || [];
  }
  return [];
}

// ---------- 纯函数 1：GET /team-leaders（分页可选，默认全量）----------
async function _getTeamLeaders({ page, pageSize } = {}, scopeTeamIds = null) {
  const query = { role: ROLE_NORMAL_ADMIN };
  const hasScope = scopeTeamIds !== null && scopeTeamIds !== undefined;
  if (hasScope) {
    if (scopeTeamIds.length === 0) {
      // 高管未分配团队，直接返回空数据
      return { success: true, total: 0, data: [] };
    }
    query._id = { $in: scopeTeamIds };
  }
  const q = Admin.find(query);
  const total = await Admin.countDocuments(query);
  let cur = q;
  const pRaw = parseInt(page, 10);
  const psRaw = parseInt(pageSize, 10);
  const paged = Number.isFinite(pRaw) && pRaw > 0 && Number.isFinite(psRaw) && psRaw > 0;
  if (paged) cur = cur.skip((pRaw - 1) * psRaw).limit(psRaw);
  const docs = await cur.sort({ createdAt: -1 }).lean().exec();
  const data = docs.map(a => ({
    _id: String(a._id),
    role: ROLE_NORMAL_ADMIN,
    realName: a.realName || '',
    username: a.username || '',
    passwordPlain: a.passwordPlain || '',  // 只有 SUPER_ADMIN 调用此路由时才返回（路由层已挂 superAdminOnly）
    phone: a.phone || '',
    teamName: a.teamName || '',
    status: _outStatus(a.status),
    commission: +(a.commission || 0),
    createdAt: a.createdAt ? a.createdAt.toISOString() : null
  }));
  return { success: true, total, data };
}

// ---------- 纯函数 2：GET /group-leaders（从 TeamGroup 出发，关联 Admin 账号拿明文/手机号等）----------
async function _getGroupLeaders({ page, pageSize } = {}, scopeTeamIds = null) {
  const query = {};
  const hasScope = scopeTeamIds !== null && scopeTeamIds !== undefined;
  if (hasScope) {
    if (scopeTeamIds.length === 0) {
      // 高管未分配团队，直接返回空数据
      return { success: true, total: 0, data: [] };
    }
    query.teamLeaderId = { $in: scopeTeamIds };
  }
  const total = await TeamGroup.countDocuments(query);
  let cur = TeamGroup.find(query).sort({ createdAt: -1 });
  const pRaw = parseInt(page, 10);
  const psRaw = parseInt(pageSize, 10);
  const paged = Number.isFinite(pRaw) && pRaw > 0 && Number.isFinite(psRaw) && psRaw > 0;
  if (paged) cur = cur.skip((pRaw - 1) * psRaw).limit(psRaw);
  const tgs = await cur.lean().exec();

  // 批量关联 Admin（groupLeaderId 对应 admins._id）
  const ids = [...new Set(tgs.map(g => g.groupLeaderId).filter(Boolean))];
  const adminDocs = ids.length > 0 ? await Admin.find({ _id: { $in: ids } }).lean().exec() : [];
  const adminById = new Map(adminDocs.map(a => [String(a._id), a]));

  const data = tgs.map(tg => {
    const a = tg.groupLeaderId ? adminById.get(String(tg.groupLeaderId)) : null;
    return {
      _id: String(tg._id),                       // 组长关联记录主键 = TeamGroup._id
      role: ROLE_GROUP_LEADER,
      realName: (a && a.realName) ? a.realName : (tg.groupLeaderName || ''),
      groupLeaderId: tg.groupLeaderId ? String(tg.groupLeaderId) : null,
      username: a ? (a.username || '') : '',
      passwordPlain: a ? (a.passwordPlain || '') : '', // SUPER_ADMIN 专属
      phone: a ? (a.phone || '') : '',
      teamId: tg.teamLeaderId ? String(tg.teamLeaderId) : '', // 所属战队主键 = teamLeaderId（TeamGroup schema）
      teamName: tg.teamName || '',
      groupId: String(tg._id),                  // 小组主键 = 本主键
      groupName: tg.groupName || '',
      status: a ? _outStatus(a.status) : 'inactive',
      commission: +(tg.commission || 0),        // 只读（TeamGroup 存组长档位）
      createdAt: tg.createdAt ? tg.createdAt.toISOString() : null
      // ⚠️ 注意：这里没有 accountOpened 字段（按最新文档彻底删除）
    };
  });
  return { success: true, total, data };
}

// ---------- 纯函数 3：POST /team-leaders（新建团队长，admins 建一条 role=NORMAL_ADMIN）----------
async function _postTeamLeader(body = {}) {
  const { realName, username, passwordPlain, phone, teamName, commission } = body;
  if (!username || !String(username).trim()) return { statusCode: 400, success: false, message: '用户名必填' };
  if (!passwordPlain || String(passwordPlain).length < 6) return { statusCode: 400, success: false, message: '密码长度至少 6 位' };
  if (!teamName || !String(teamName).trim()) return { statusCode: 400, success: false, message: '战队名必填' };
  const c = +commission;
  if (!(c >= 0 && c <= 1)) return { statusCode: 400, success: false, message: '分成比例 commission 必须在 0~1 之间' };
  // 用户名唯一
  const dup = await Admin.findOne({ username: String(username).trim() }).lean().exec();
  if (dup) return { statusCode: 400, success: false, message: '用户名已存在' };
  // teamName 唯一（团队长）
  const dupTeam = await Admin.findOne({ role: ROLE_NORMAL_ADMIN, teamName: String(teamName).trim() }).lean().exec();
  if (dupTeam) return { statusCode: 400, success: false, message: '该战队名已被其他团队长占用' };

  const a = await new Admin({
    username: String(username).trim(),
    password: hashPassword(String(passwordPlain)),
    passwordPlain: String(passwordPlain), // 明文双写（用于 SUPER_ADMIN GET 返回）
    role: ROLE_NORMAL_ADMIN,
    realName: String(realName || ''),
    phone: String(phone || ''),
    teamName: String(teamName).trim(),
    status: 'enabled',   // 新建默认启用
    commission: c
  }).save();

  return {
    statusCode: 200,
    success: true,
    data: { _id: String(a._id), username: a.username, status: _outStatus(a.status), createdAt: a.createdAt.toISOString() }
  };
}

// ---------- 纯函数 4：POST /group-leaders（新建组长 = admins GROUP_LEADER + TeamGroup 绑定 groupLeaderId 一步到位）----------
async function _postGroupLeader(body = {}) {
  const { realName, username, passwordPlain, phone, teamId, teamName, groupName, commission } = body;
  if (!username || !String(username).trim()) return { statusCode: 400, success: false, message: '用户名必填' };
  if (!passwordPlain || String(passwordPlain).length < 6) return { statusCode: 400, success: false, message: '密码长度至少 6 位' };
  if (!teamId || !String(teamId).trim()) return { statusCode: 400, success: false, message: '战队 teamId 必填' };
  if (!groupName || !String(groupName).trim()) return { statusCode: 400, success: false, message: '组别 groupName 必填' };
  const c = +commission;
  if (!(c >= 0 && c <= 1)) return { statusCode: 400, success: false, message: '分成比例 commission 必须在 0~1 之间' };

  const teamIdS = String(teamId).trim();
  // teamId 校验：必须是存在的 NORMAL_ADMIN
  const tl = await Admin.findById(teamIdS).lean().exec();
  if (!tl || tl.role !== ROLE_NORMAL_ADMIN) return { statusCode: 400, success: false, message: '战队不存在（teamId 必须是 NORMAL_ADMIN 的团队长 _id）' };

  // 用户名全局唯一
  if (await Admin.findOne({ username: String(username).trim() }).lean().exec()) {
    return { statusCode: 400, success: false, message: '用户名已存在' };
  }
  // 同 teamId 下 groupName 唯一
  const dupGroup = await TeamGroup.findOne({ teamLeaderId: teamIdS, groupName: String(groupName).trim() }).lean().exec();
  if (dupGroup) return { statusCode: 400, success: false, message: '该战队已存在同名组别' };

  const teamNameS = String(teamName || tl.teamName || '').trim();
  const realNameS = String(realName || '').trim();

  // -------- 一次"事务"：先建 admins 账号 → 再建 team_groups → 再回填 teamGroupId 给 admins --------
  const newAdmin = await new Admin({
    username: String(username).trim(),
    password: hashPassword(String(passwordPlain)),
    passwordPlain: String(passwordPlain),
    role: ROLE_GROUP_LEADER,
    realName: realNameS,
    phone: String(phone || ''),
    teamName: teamNameS,
    status: 'enabled',
    commission: c,
    groupName: String(groupName).trim()
  }).save();

  const groupLeaderIdS = String(newAdmin._id);

  const newTG = await new TeamGroup({
    teamLeaderId: teamIdS,
    teamName: teamNameS,
    groupName: String(groupName).trim(),
    groupLeaderId: groupLeaderIdS,
    groupLeaderName: realNameS || newAdmin.username,
    commission: c,
    status: 'active',
    memberCount: 0
  }).save();

  // 回填 teamGroupId（兼容 account.js 旧代码 / 组长账号的 groupName 已经设过）
  newAdmin.teamGroupId = String(newTG._id);
  await newAdmin.save();

  return {
    statusCode: 200,
    success: true,
    data: {
      _id: String(newTG._id),          // 组长关联主键 = TG._id
      groupLeaderId: groupLeaderIdS,   // 对应 admin._id
      username: newAdmin.username,
      status: _outStatus(newAdmin.status),
      createdAt: newTG.createdAt ? newTG.createdAt.toISOString() : null
    }
  };
}

// ---------- 纯函数 5：PUT /team-leaders/:id（6 字段可改；commission 传了也忽略；password 空=保留）----------
async function _putTeamLeader(id, body = {}) {
  if (!id) return { statusCode: 400, success: false, message: '缺少 teamLeaderId' };
  const a = await Admin.findById(String(id)).exec();
  if (!a) return { statusCode: 404, success: false, message: '团队长不存在' };
  if (a.role !== ROLE_NORMAL_ADMIN) return { statusCode: 400, success: false, message: '该 id 不是团队长' };

  // 允许改的 6 字段：realName / username / passwordPlain / phone / teamName / status
  if (body.realName !== undefined) a.realName = String(body.realName);
  if (body.phone !== undefined) a.phone = String(body.phone);
  if (body.teamName !== undefined) a.teamName = String(body.teamName).trim();

  if (body.username !== undefined) {
    const u = String(body.username).trim();
    if (u !== a.username) {
      const dup = await Admin.findOne({ username: u, _id: { $ne: a._id } }).lean().exec();
      if (dup) return { statusCode: 400, success: false, message: '用户名已存在' };
      a.username = u;
    }
  }
  if (body.passwordPlain && String(body.passwordPlain).length >= 6) {
    a.password = hashPassword(String(body.passwordPlain));
    a.passwordPlain = String(body.passwordPlain); // 明文同步更新
  }
  if (body.status !== undefined) {
    const s = _inStatus(body.status);
    if (!s) return { statusCode: 400, success: false, message: 'status 必须是 active / inactive' };
    a.status = s;
  }
  // ⚠️ 无论 body.commission 传什么：绝对不更新（分成比例按业绩自动升降档，不许手动编辑）
  // （此处对 body.commission 完全忽略，不读、不写、不报错）

  a.updatedAt = new Date();
  const saved = await a.save();
  return { statusCode: 200, success: true, data: { _id: String(saved._id), updatedAt: saved.updatedAt.toISOString() } };
}

// ---------- 纯函数 6：PUT /group-leaders/:id（id = TeamGroup._id；8 字段可改；commission 忽略）----------
async function _putGroupLeader(id, body = {}) {
  if (!id) return { statusCode: 400, success: false, message: '缺少组 id' };
  const tg = await TeamGroup.findById(String(id)).exec();
  if (!tg) return { statusCode: 404, success: false, message: '组不存在' };
  const glId = tg.groupLeaderId ? String(tg.groupLeaderId) : null;
  const a = glId ? await Admin.findById(glId).exec() : null;

  // ---- 组表字段：teamId/teamName/groupName ----
  let newTeamId = tg.teamLeaderId;
  if (body.teamId !== undefined) {
    const ntl = String(body.teamId).trim();
    const tl = await Admin.findById(ntl).lean().exec();
    if (!tl || tl.role !== ROLE_NORMAL_ADMIN) return { statusCode: 400, success: false, message: '新战队 teamId 不存在或不是团队长' };
    newTeamId = ntl;
    tg.teamLeaderId = ntl;
    if (body.teamName !== undefined) tg.teamName = String(body.teamName).trim();
    else tg.teamName = tl.teamName || tg.teamName;
  } else if (body.teamName !== undefined) {
    tg.teamName = String(body.teamName).trim();
  }
  if (body.groupName !== undefined) {
    const ngn = String(body.groupName).trim();
    if (!ngn) return { statusCode: 400, success: false, message: '组名不能为空' };
    // 同 teamId(newTeamId) 下 groupName 唯一，排除自己
    const dup = await TeamGroup.findOne({ teamLeaderId: String(newTeamId), groupName: ngn, _id: { $ne: tg._id } }).lean().exec();
    if (dup) return { statusCode: 400, success: false, message: '该战队已存在同名组别' };
    tg.groupName = ngn;
  }

  // ---- 管理员账号字段：realName / username / passwordPlain / phone / status ----
  if (a) {
    if (body.realName !== undefined) a.realName = String(body.realName);
    if (body.phone !== undefined) a.phone = String(body.phone);
    if (body.username !== undefined) {
      const u = String(body.username).trim();
      if (u !== a.username) {
        const dup = await Admin.findOne({ username: u, _id: { $ne: a._id } }).lean().exec();
        if (dup) return { statusCode: 400, success: false, message: '用户名已存在' };
        a.username = u;
      }
    }
    if (body.passwordPlain && String(body.passwordPlain).length >= 6) {
      a.password = hashPassword(String(body.passwordPlain));
      a.passwordPlain = String(body.passwordPlain);
    }
    if (body.status !== undefined) {
      const s = _inStatus(body.status);
      if (!s) return { statusCode: 400, success: false, message: 'status 必须是 active / inactive' };
      a.status = s;
    }
    a.updatedAt = new Date();
    // 组表的 groupLeaderName / teamName 冗余同步
    if (a.realName && tg.groupLeaderName !== a.realName) tg.groupLeaderName = a.realName;
    if (a.groupName !== tg.groupName) a.groupName = tg.groupName;
    if (a.teamName !== tg.teamName) a.teamName = tg.teamName;
    if (String(a.teamGroupId || '') !== String(tg._id)) a.teamGroupId = String(tg._id);
  }

  // ⚠️ 无论 body.commission 传什么：绝对不更新（创建时定死 + 晋升接口调整，不允许手动编辑）

  const updatedAt = new Date();
  tg.updatedAt = updatedAt;
  const savedTG = await tg.save();
  const savedA = a ? await a.save() : null;

  return {
    statusCode: 200,
    success: true,
    data: {
      _id: String(savedTG._id),
      updatedAt: updatedAt.toISOString(),
      groupLeaderId: savedA ? String(savedA._id) : (tg.groupLeaderId ? String(tg.groupLeaderId) : null)
    }
  };
}

// ---------- 纯函数 7：DELETE /team-leaders/:id【方式 A：只删账号+清引用，不删组和员工】----------
async function _deleteTeamLeader(id) {
  if (!id) return { statusCode: 400, success: false, message: '缺少 teamLeaderId' };
  const sId = String(id);
  const a = await Admin.findById(sId).exec();
  if (!a) return { statusCode: 404, success: false, message: '团队长不存在' };
  // ① 删账号
  await Admin.findByIdAndDelete(sId).exec();
  // ② team_groups：teamLeaderId = sId 的，teamLeaderId 置空，teamName 保留
  await TeamGroup.updateMany({ teamLeaderId: sId }, { $set: { teamLeaderId: null } }).exec();
  // ③ employees：parentId=sId 或 teamId=sId 的，parentId 置空，teamId 置空，员工本身保留
  await Employee.updateMany(
    { $or: [ { parentId: sId }, { teamId: sId } ] },
    { $set: { parentId: '', teamId: '' } }
  ).exec();

  return { statusCode: 200, success: true, message: '删除成功（级联清理悬空引用：teamGroups.teamLeaderId=NULL / employees.parentId&teamId=空）' };
}

// ---------- 纯函数 8：DELETE /group-leaders/:id（id = TeamGroup._id，级联删 admins 里的管理员账号避免僵尸）----------
async function _deleteGroupLeader(id) {
  if (!id) return { statusCode: 400, success: false, message: '缺少组 id' };
  const sId = String(id);
  const tg = await TeamGroup.findById(sId).exec();
  if (!tg) return { statusCode: 404, success: false, message: '组不存在' };
  const glId = tg.groupLeaderId ? String(tg.groupLeaderId) : null;
  // ① 删组记录
  await TeamGroup.findByIdAndDelete(sId).exec();
  // ② 删关联的 GROUP_LEADER 管理员账号（避免僵尸）
  if (glId) await Admin.findByIdAndDelete(glId).exec();
  // ③ employees：teamGroupId = sId 的置空（员工本人保留，暂时归无组）
  await Employee.updateMany(
    { teamGroupId: sId },
    { $set: { teamGroupId: null, groupName: null } }
  ).exec();

  return { statusCode: 200, success: true, message: '删除成功（级联删 admin 僵尸账号 + employees 组归属置空）' };
}

// ---------- 工具：把纯函数结果写 res ----------
function _send(res, r) {
  const code = r.statusCode || 200;
  const body = { success: !!r.success, message: r.message || '', ...(r.data !== undefined ? { data: r.data } : {}) };
  if (r.total !== undefined) body.total = r.total;
  if (r.data !== undefined && Array.isArray(r.data) && !body.total) body.total = r.data.length;
  return res.status(code).json(body);
}

// ---------- 挂载 8 条 HTTP 路由（全部 authMiddleware + superAdminOnly）----------
router.get('/team-leaders', authMiddleware, superOrAdminManagerOnly, async (req, res) => {
  try {
    const scopeTeamIds = await _getScopeTeamIds(req);
    const r = await _getTeamLeaders(req.query || {}, scopeTeamIds);
    return res.json(r);
  } catch (e) { console.error('[supervisor] GET team-leaders 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});
router.get('/group-leaders', authMiddleware, superOrAdminManagerOnly, async (req, res) => {
  try {
    const scopeTeamIds = await _getScopeTeamIds(req);
    const r = await _getGroupLeaders(req.query || {}, scopeTeamIds);
    return res.json(r);
  } catch (e) { console.error('[supervisor] GET group-leaders 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});
router.post('/team-leaders', authMiddleware, superOrAdminManagerOnly, async (req, res) => {
  try { 
    const result = await _postTeamLeader(req.body || {});
    // 如果是高管创建，自动加入其 managedTeamIds
    if (_isAdminManager(req) && result.data) {
      await Admin.findByIdAndUpdate(req.user.id, { $push: { managedTeamIds: result.data._id } });
    }
    return _send(res, result); 
  }
  catch (e) { console.error('[supervisor] POST team-leaders 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});
router.post('/group-leaders', authMiddleware, superOrAdminManagerOnly, async (req, res) => {
  try { return _send(res, await _postGroupLeader(req.body || {})); }
  catch (e) { console.error('[supervisor] POST group-leaders 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});
router.put('/team-leaders/:teamLeaderId', authMiddleware, superOrAdminManagerOnly, async (req, res) => {
  try { return _send(res, await _putTeamLeader(req.params.teamLeaderId, req.body || {})); }
  catch (e) { console.error('[supervisor] PUT team-leaders 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});
router.put('/group-leaders/:id', authMiddleware, superOrAdminManagerOnly, async (req, res) => {
  try { return _send(res, await _putGroupLeader(req.params.id, req.body || {})); }
  catch (e) { console.error('[supervisor] PUT group-leaders 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});
router.delete('/team-leaders/:id', authMiddleware, superOrAdminManagerOnly, async (req, res) => {
  try { 
    const result = await _deleteTeamLeader(req.params.id);
    // 从所有高管的 managedTeamIds 中移除
    await Admin.updateMany(
      { role: ROLE_ADMIN_MANAGER },
      { $pull: { managedTeamIds: mongoose.Types.ObjectId(req.params.id) } }
    );
    return _send(res, result); 
  }
  catch (e) { console.error('[supervisor] DELETE team-leaders 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});
router.delete('/group-leaders/:id', authMiddleware, superOrAdminManagerOnly, async (req, res) => {
  try { return _send(res, await _deleteGroupLeader(req.params.id)); }
  catch (e) { console.error('[supervisor] DELETE group-leaders 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});

// ============ ADMIN_MANAGER CRUD（超管专属）============

// POST /admin-managers - 超管创建高管
router.post('/admin-managers', authMiddleware, superAdminOnly, async (req, res) => {
  try { 
    const { realName, username, passwordPlain, phone, teamName, commission, managedTeamIds = [] } = req.body;
    
    if (!realName || !username || !passwordPlain) {
      return res.status(400).json({ success: false, message: '姓名、用户名、密码必填' });
    }
    if (passwordPlain.length < 6) {
      return res.status(400).json({ success: false, message: '密码长度至少6位' });
    }
    
    // 检查用户名唯一性
    const exists = await Admin.findOne({ username });
    if (exists) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    
    // 创建高管账号
    const hashed = await hashPassword(passwordPlain);
    const newAdmin = await Admin.create({
      username,
      password: hashed,
      passwordPlain,
      role: ROLE_ADMIN_MANAGER,
      realName,
      phone: phone || '',
      teamName: teamName || '',
      commission: commission || 0,
      status: 'enabled',
      managedTeamIds: managedTeamIds.filter(id => id && mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id))
    });
    
    return res.json({ success: true, data: {
      _id: String(newAdmin._id),
      username: newAdmin.username,
      status: _outStatus(newAdmin.status),
      createdAt: newAdmin.createdAt.toISOString()
    }});
  }
  catch (e) { console.error('[supervisor] POST admin-managers 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});

// GET /admin-managers - 超管获取高管列表
router.get('/admin-managers', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const query = { role: ROLE_ADMIN_MANAGER };
    const total = await Admin.countDocuments(query);
    let cur = Admin.find(query).sort({ createdAt: -1 });
    const pRaw = parseInt(page, 10);
    const psRaw = parseInt(pageSize, 10);
    const paged = Number.isFinite(pRaw) && pRaw > 0 && Number.isFinite(psRaw) && psRaw > 0;
    if (paged) cur = cur.skip((pRaw - 1) * psRaw).limit(psRaw);
    
    const docs = await cur.lean().exec();
    const data = docs.map(a => ({
      _id: String(a._id),
      role: ROLE_ADMIN_MANAGER,
      realName: a.realName || '',
      username: a.username || '',
      passwordPlain: a.passwordPlain || '',
      phone: a.phone || '',
      teamName: a.teamName || '',
      status: _outStatus(a.status),
      commission: +(a.commission || 0),
      managedTeamIds: (a.managedTeamIds || []).map(id => String(id)),
      createdAt: a.createdAt ? a.createdAt.toISOString() : null
    }));
    
    return res.json({ success: true, total, data });
  }
  catch (e) { console.error('[supervisor] GET admin-managers 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});

// PUT /admin-managers/:id - 超管编辑高管（含分配团队）
router.put('/admin-managers/:id', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { realName, username, passwordPlain, phone, teamName, status, managedTeamIds = [] } = req.body;
    const id = req.params.id;
    
    const update = {};
    if (realName !== undefined) update.realName = realName;
    if (username !== undefined) update.username = username;
    if (passwordPlain !== undefined && passwordPlain !== '') {
      update.password = await hashPassword(passwordPlain);
      update.passwordPlain = passwordPlain;
    }
    if (phone !== undefined) update.phone = phone;
    if (teamName !== undefined) update.teamName = teamName;
    if (status !== undefined) update.status = _inStatus(status);
    if (managedTeamIds !== undefined) {
      // 验证并转换 ObjectId，过滤无效 ID
      update.managedTeamIds = managedTeamIds
        .filter(id => id && mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
    }
    
    const updated = await Admin.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!updated) {
      return res.json({ success: false, message: '高管不存在' });
    }
    
    return res.json({ success: true, data: {
      _id: String(updated._id),
      updatedAt: updated.updatedAt.toISOString()
    }});
  }
  catch (e) { console.error('[supervisor] PUT admin-managers 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});

// DELETE /admin-managers/:id - 超管删除高管
router.delete('/admin-managers/:id', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await Admin.findByIdAndDelete(id);
    if (!deleted) {
      return res.json({ success: false, message: '高管不存在' });
    }
    return res.json({ success: true, data: { _id: String(deleted._id) } });
  }
  catch (e) { console.error('[supervisor] DELETE admin-managers 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});

// PUT /admin-managers/:id/managed-teams - 超管分配团队给高管（单独接口，方便前端操作）
router.put('/admin-managers/:id/managed-teams', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { teamIds } = req.body;
    const id = req.params.id;
    
    if (!Array.isArray(teamIds)) {
      return res.status(400).json({ success: false, message: 'teamIds 必须是数组' });
    }
    
    const updated = await Admin.findByIdAndUpdate(
      id,
      { managedTeamIds: teamIds.filter(tid => tid && mongoose.Types.ObjectId.isValid(tid)).map(tid => new mongoose.Types.ObjectId(tid)) },
      { new: true }
    ).lean();
    
    if (!updated) {
      return res.json({ success: false, message: '高管不存在' });
    }
    
    return res.json({ success: true, data: {
      _id: String(updated._id),
      managedTeamIds: (updated.managedTeamIds || []).map(id => String(id))
    }});
  }
  catch (e) { console.error('[supervisor] PUT admin-managers/managed-teams 错误:', e); return res.status(500).json({ success: false, message: '服务器错误' }); }
});

// ---------- 导出（TDD 直接调用纯函数验证）----------
router._getTeamLeaders = _getTeamLeaders;
router._getGroupLeaders = _getGroupLeaders;
router._postTeamLeader = _postTeamLeader;
router._postGroupLeader = _postGroupLeader;
router._putTeamLeader = _putTeamLeader;
router._putGroupLeader = _putGroupLeader;
router._deleteTeamLeader = _deleteTeamLeader;
router._deleteGroupLeader = _deleteGroupLeader;
router._isSuper = _isSuper;
router._superAdminOnly = superAdminOnly;
router._util = { _inStatus, _outStatus, _isSuper };

module.exports = router;
