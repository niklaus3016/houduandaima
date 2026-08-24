const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const TeamGroup = require('../models/TeamGroup');
const CommissionHistory = require('../models/CommissionHistory');
const { hashPassword, comparePassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');
const { clear, get, set } = require('../utils/cache');
const verification = require('./verification');

// 获取管理员列表
router.get('/admins', authMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    
    const role = req.user.role;
    const isSuper = role === 'superadmin' || String(role).toUpperCase() === 'SUPER_ADMIN';
    const isAdminManager = String(role).toUpperCase() === 'ADMIN_MANAGER';
    
    if (!isSuper && !isAdminManager) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    // 构建缓存键
    let cacheKey = `account_admins_${search || 'all'}`;
    if (isAdminManager) {
      const admin = await Admin.findById(req.user.id).select('managedTeamIds').lean();
      const scopeTeamIds = admin?.managedTeamIds || [];
      cacheKey += `_admin_${scopeTeamIds.length > 0 ? scopeTeamIds.sort().join('_') : 'empty'}`;
    }
    
    const cached = get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    let query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { realName: { $regex: search, $options: 'i' } },
        { teamName: { $regex: search, $options: 'i' } }
      ];
    }
    
    // 高管只能看到自己管理的团队长和组长
    if (isAdminManager) {
      const admin = await Admin.findById(req.user.id).select('managedTeamIds').lean();
      const scopeTeamIds = admin?.managedTeamIds || [];
      if (scopeTeamIds.length === 0) {
        // 高管未分配团队，直接返回空数据
        const result = { success: true, data: [] };
        set(cacheKey, result, 5 * 60 * 1000);
        return res.json(result);
      }
      query.$or = [
        { role: 'NORMAL_ADMIN', _id: { $in: scopeTeamIds } },
        { role: 'GROUP_LEADER', teamLeaderId: { $in: scopeTeamIds } }
      ];
    }
    
    const admins = await Admin.find(query);
    
    // 导入TeamGroup模型
    const TeamGroup = require('../models/TeamGroup');
    
    // 收集所有组长账号的teamGroupId
    const teamGroupIds = admins
      .filter(admin => admin.role === 'GROUP_LEADER' && admin.teamGroupId)
      .map(admin => admin.teamGroupId);
    
    // 批量查询TeamGroup记录
    let teamGroupsMap = {};
    if (teamGroupIds.length > 0) {
      try {
        const teamGroups = await TeamGroup.find({ _id: { $in: teamGroupIds } });
        teamGroupsMap = teamGroups.reduce((map, group) => {
          map[group._id.toString()] = group.groupName || '';
          return map;
        }, {});
      } catch (err) {
        console.error('批量获取组长组别错误:', err);
      }
    }
    
    // 构建管理员详情列表
    const adminsWithDetails = admins.map(admin => {
      let groupName = '';
      
      // 对于组长账号，从缓存中获取groupName
      if (admin.role === 'GROUP_LEADER' && admin.teamGroupId) {
        groupName = teamGroupsMap[admin.teamGroupId.toString()] || '';
      }
      
      return {
        _id: admin._id,
        username: admin.username,
        role: admin.role,
        teamName: admin.teamName || '',
        groupName: groupName,
        realName: admin.realName || '',
        phone: admin.phone || '',
        region: admin.region || '',
        status: admin.status || 'enabled',
        createdAt: admin.createdAt,
        lastLoginAt: admin.lastLoginAt || null
      };
    });
    
    const result = {
      success: true,
      admins: adminsWithDetails
    };
    
    // 缓存5分钟
    set(cacheKey, result, 5 * 60 * 1000);
    
    res.json(result);
  } catch (error) {
    console.error('获取管理员列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 添加管理员（团队长账号）
router.post('/add-admin', authMiddleware, async (req, res) => {
  try {
    const { username, password, teamName, realName, phone, region, role, teamGroupId, groupName } = req.body;
    
    const userRole = req.user.role;
    const isSuper = userRole === 'superadmin' || String(userRole).toUpperCase() === 'SUPER_ADMIN';
    const isAdminManager = String(userRole).toUpperCase() === 'ADMIN_MANAGER';
    const isNormalAdmin = String(userRole).toUpperCase() === 'NORMAL_ADMIN';
    
    // 权限检查：超级管理员可以创建任何管理员，高管可以创建团队长和组长，团队长只能创建自己团队的组长
    if (!isSuper && !isAdminManager && !isNormalAdmin) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    // 团队长只能创建自己团队的组长（禁止 TL 用老接口创建另一个 TL 账号）
    if (isNormalAdmin) {
      // 🔒 团队长通过老接口只能创建 GROUP_LEADER 组长，不允许创建 NORMAL_ADMIN（避免权限提升）
      req.body.role = 'GROUP_LEADER';
      // 锁定所属战队 = TL 自己的 teamName（防前端乱传）
      if (req.user.id) {
        const callerTL = await Admin.findById(req.user.id).select('teamName _id').lean();
        if (callerTL?.teamName) req.body.teamName = callerTL.teamName;
        // 老接口没限制 teamGroupId 必须属于 callerTL，这里也加上：前端传 teamGroupId 要校验该组的 teamLeaderId==callerTL._id
        if (req.body.teamGroupId) {
          try {
            const tg = await TeamGroup.findById(req.body.teamGroupId).select('teamLeaderId').lean();
            if (tg && String(tg.teamLeaderId) !== String(callerTL._id)) {
              return res.status(403).json({ success: false, message: '权限不足：该组不属于您，只能开通自己团队下的组长' });
            }
          } catch (_) { /* teamGroupId 格式错了继续往下，建组时报错 */ }
        }
      }
    }
    
    // 高管创建团队长时，自动加入其 managedTeamIds
    if (isAdminManager && role === 'NORMAL_ADMIN') {
      // 保存原始 body，后面在创建成功后更新 managedTeamIds
      req.body._adminManagerId = req.user.id;
    }

    if (!username || !password) {
      return res.status(400).json({ success: false, message: '缺少必要参数：用户名和密码' });
    }

    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const newAdmin = new Admin({
      username,
      password: hashPassword(password),
      role: req.body.role || 'admin',
      teamName: teamName || '',
      teamGroupId: teamGroupId || null,
      groupName: groupName || null,
      realName: realName || '',
      phone: phone || '',
      region: region || '',
      status: 'enabled'
    });

    await newAdmin.save();
    
    // 高管创建团队长时，自动加入其 managedTeamIds
    if (req.body._adminManagerId && newAdmin.role === 'NORMAL_ADMIN') {
      await Admin.findByIdAndUpdate(req.body._adminManagerId, {
        $push: { managedTeamIds: newAdmin._id }
      });
    }

    res.json({
      success: true,
      message: '管理员添加成功',
      data: {
        _id: newAdmin._id,
        username: newAdmin.username,
        role: newAdmin.role,
        teamName: newAdmin.teamName,
        teamGroupId: newAdmin.teamGroupId,
        groupName: newAdmin.groupName,
        realName: newAdmin.realName,
        phone: newAdmin.phone,
        region: newAdmin.region,
        status: newAdmin.status
      }
    });
  } catch (error) {
    console.error('添加管理员错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 创建管理员（新接口，支持前端新字段）
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { teamName, realName, phone, region, username, password, role, teamGroupId, groupName } = req.body;
    
    const userRole = req.user.role;
    const isSuper = userRole === 'superadmin' || String(userRole).toUpperCase() === 'SUPER_ADMIN';
    const isAdminManager = String(userRole).toUpperCase() === 'ADMIN_MANAGER';
    const isNormalAdmin = String(userRole).toUpperCase() === 'NORMAL_ADMIN';
    
    // 权限检查：超级管理员可以创建任何管理员，高管可以创建团队长和组长，团队长只能创建自己团队的组长
    if (!isSuper && !isAdminManager && !isNormalAdmin) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    // 团队长只能创建自己团队的组长（禁止 TL 用老接口创建另一个 TL 账号）
    if (isNormalAdmin) {
      // 🔒 团队长通过老接口只能创建 GROUP_LEADER 组长，不允许创建 NORMAL_ADMIN（避免权限提升）
      req.body.role = 'GROUP_LEADER';
      // 锁定所属战队 = TL 自己的 teamName（防前端乱传）
      if (req.user.id) {
        const callerTL = await Admin.findById(req.user.id).select('teamName _id').lean();
        if (callerTL?.teamName) req.body.teamName = callerTL.teamName;
        // 老接口没限制 teamGroupId 必须属于 callerTL，这里也加上：前端传 teamGroupId 要校验该组的 teamLeaderId==callerTL._id
        if (req.body.teamGroupId) {
          try {
            const tg = await TeamGroup.findById(req.body.teamGroupId).select('teamLeaderId').lean();
            if (tg && String(tg.teamLeaderId) !== String(callerTL._id)) {
              return res.status(403).json({ success: false, message: '权限不足：该组不属于您，只能开通自己团队下的组长' });
            }
          } catch (_) { /* teamGroupId 格式错了继续往下，建组时报错 */ }
        }
      }
    }
    
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    
    const newAdmin = new Admin({
      username,
      password: hashPassword(password),
      role: req.body.role || 'NORMAL_ADMIN',
      teamName: teamName || '',
      teamGroupId: teamGroupId || null,
      groupName: groupName || null,
      realName: realName || '',
      phone: phone || '',
      region: region || '',
      status: 'enabled'
    });
    
    await newAdmin.save();
    
    // 高管创建团队长时，自动加入其 managedTeamIds
    if (isAdminManager && newAdmin.role === 'NORMAL_ADMIN') {
      await Admin.findByIdAndUpdate(req.user.id, {
        $push: { managedTeamIds: newAdmin._id }
      });
    }
    
    res.json({
      success: true,
      message: '管理员账号创建成功',
      data: {
        _id: newAdmin._id,
        username: newAdmin.username,
        role: newAdmin.role,
        teamName: newAdmin.teamName,
        teamGroupId: newAdmin.teamGroupId,
        groupName: newAdmin.groupName,
        realName: newAdmin.realName,
        phone: newAdmin.phone,
        region: newAdmin.region,
        status: newAdmin.status
      }
    });
  } catch (error) {
    console.error('创建管理员错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取管理员列表（新接口）
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { search, page = 1, pageSize = 10 } = req.query;
    
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    let query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { realName: { $regex: search, $options: 'i' } },
        { teamName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const total = await Admin.countDocuments(query);
    const admins = await Admin.find(query)
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize))
      .sort({ createdAt: -1 });
    
    // 导入TeamGroup模型
    const TeamGroup = require('../models/TeamGroup');
    
    // 收集所有组长账号的teamGroupId
    const teamGroupIds = admins
      .filter(admin => admin.role === 'GROUP_LEADER' && admin.teamGroupId)
      .map(admin => admin.teamGroupId);
    
    // 批量查询TeamGroup记录
    let teamGroupsMap = {};
    if (teamGroupIds.length > 0) {
      try {
        const teamGroups = await TeamGroup.find({ _id: { $in: teamGroupIds } });
        teamGroupsMap = teamGroups.reduce((map, group) => {
          map[group._id.toString()] = group.groupName || '';
          return map;
        }, {});
      } catch (err) {
        console.error('批量获取组长组别错误:', err);
      }
    }
    
    // 构建管理员详情列表
    const adminsWithDetails = admins.map(admin => {
      let groupName = '';
      
      // 对于组长账号，从缓存中获取groupName
      if (admin.role === 'GROUP_LEADER' && admin.teamGroupId) {
        groupName = teamGroupsMap[admin.teamGroupId.toString()] || '';
      }
      
      return {
        _id: admin._id,
        username: admin.username,
        role: admin.role,
        teamName: admin.teamName || '',
        groupName: groupName,
        realName: admin.realName || '',
        phone: admin.phone || '',
        region: admin.region || '',
        status: admin.status || 'enabled',
        createdAt: admin.createdAt
      };
    });
    
    res.json({
      success: true,
      admins: adminsWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取管理员列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取员工列表
router.get('/employees', authMiddleware, async (req, res) => {
  try {
    const { search, parentId } = req.query;
    
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    if (parentId) {
      query.parentId = parentId;
    }
    
    const employees = await Employee.find(query);
    
    const employeesWithDetails = await Promise.all(employees.map(async (emp) => {
      const userGold = await UserGold.findOne({ employeeId: emp.employeeId });
      const coins = userGold ? userGold.currentMonthGold : 0;
      
      return {
        id: emp._id,
        employeeId: emp.employeeId,
        name: emp.name,
        phone: emp.phone || '',
        area: emp.area || '',
        status: emp.status,
        coins: parseFloat(coins.toFixed(2)),
        parentId: emp.parentId || '',
        createdAt: emp.createdAt
      };
    }));
    
    res.json({
      success: true,
      data: employeesWithDetails
    });
  } catch (error) {
    console.error('获取员工列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 添加员工
router.post('/add-employee', authMiddleware, async (req, res) => {
  try {
    const { username, password, parentId } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    let employeeId;
    let isUnique = false;
    
    while (!isUnique) {
      employeeId = Math.floor(1000 + Math.random() * 9000).toString();
      const existingEmployee = await Employee.findOne({ employeeId });
      if (!existingEmployee) {
        isUnique = true;
      }
    }
    
    const newEmployee = new Employee({
      employeeId,
      name: username,
      phone: '',
      area: '',
      status: 1,
      parentId: parentId || ''
    });
    
    await newEmployee.save();
    
    res.json({
      success: true,
      message: '员工添加成功',
      data: newEmployee
    });
  } catch (error) {
    console.error('添加员工错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 管理员修改密码
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 查找当前管理员（尝试所有可能的字段）
    let admin = null;
    
    // 尝试通过username查找
    if (req.user.username) {
      admin = await Admin.findOne({ username: req.user.username });
    }
    
    // 如果通过username找不到，尝试通过id查找
    if (!admin && req.user.id) {
      admin = await Admin.findById(req.user.id);
    }
    
    // 如果还是找不到，尝试通过其他字段查找
    if (!admin) {
      // 直接查询所有管理员，找到匹配的
      const admins = await Admin.find();
      for (const a of admins) {
        if (a.username === req.user.username || a._id.toString() === req.user.id) {
          admin = a;
          break;
        }
      }
    }
    
    if (!admin) {
      return res.status(404).json({ success: false, message: '管理员不存在' });
    }
    
    // 验证旧密码
    const isPasswordValid = comparePassword(oldPassword, admin.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: '旧密码错误' });
    }
    
    // 更新密码
    admin.password = hashPassword(newPassword);
    await admin.save();
    
    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 超级管理员重置密码
router.post('/reset-password', authMiddleware, async (req, res) => {
  try {
    const { adminId, newPassword } = req.body;
    
    if (!adminId || !newPassword) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 验证是否为超级管理员
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    // 查找目标管理员
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ success: false, message: '管理员不存在' });
    }
    
    // 更新密码
    admin.password = hashPassword(newPassword);
    await admin.save();
    
    res.json({
      success: true,
      message: '密码重置成功'
    });
  } catch (error) {
    console.error('重置密码错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新账号状态
router.post('/update-status', authMiddleware, async (req, res) => {
  try {
    const { id, status } = req.body;
    
    if (!id || !status) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    let result;
    
    const employee = await Employee.findOne({ employeeId: id });
    if (employee) {
      employee.status = status === 'enabled' ? 1 : 0;
      await employee.save();
      result = employee;
    } else {
      const admin = await Admin.findById(id);
      if (admin) {
        admin.status = status;
        await admin.save();
        result = admin;
      } else {
        return res.status(404).json({ success: false, message: '账号不存在' });
      }
    }
    
    res.json({
      success: true,
      message: '账号状态更新成功',
      data: result
    });
  } catch (error) {
    console.error('更新账号状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 启用/禁用账号（新接口）
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['enabled', 'disabled'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态值' });
    }
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    admin.status = status;
    admin.updatedAt = new Date();
    await admin.save();
    
    res.json({
      success: true,
      message: '状态更新成功',
      data: {
        _id: admin._id,
        status: admin.status
      }
    });
  } catch (error) {
    console.error('更新账号状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新账号信息
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { teamName, realName, phone, region, username, password } = req.body;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    // 如果要更新用户名，检查是否已存在
    if (username && username !== admin.username) {
      const existingAdmin = await Admin.findOne({ username, _id: { $ne: id } });
      if (existingAdmin) {
        return res.status(400).json({ success: false, message: '用户名已存在' });
      }
      admin.username = username;
    }
    
    // 更新其他字段
    if (teamName !== undefined) admin.teamName = teamName;
    if (realName !== undefined) admin.realName = realName;
    if (phone !== undefined) admin.phone = phone;
    if (region !== undefined) admin.region = region;
    
    // 如果提供了新密码，则更新密码
    if (password) {
      admin.password = hashPassword(password);
    }
    
    admin.updatedAt = new Date();
    await admin.save();
    
    res.json({
      success: true,
      message: '更新成功',
      data: {
        _id: admin._id,
        teamName: admin.teamName,
        realName: admin.realName,
        phone: admin.phone,
        region: admin.region,
        username: admin.username,
        role: admin.role,
        status: admin.status
      }
    });
  } catch (error) {
    console.error('更新账号信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除账号
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findByIdAndDelete(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    res.json({
      success: true,
      message: '账号删除成功'
    });
  } catch (error) {
    console.error('删除账号错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取待开通的组长账号（即TeamGroup中groupLeaderId为null的记录）
router.get('/pending-group-leaders', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    // 导入TeamGroup模型
    const TeamGroup = require('../models/TeamGroup');
    
    // 查询所有groupLeaderId为null的TeamGroup记录
    const pendingGroups = await TeamGroup.find({ groupLeaderId: null });
    
    // 转换为前端需要的格式
    const pendingGroupLeaders = pendingGroups.map(group => ({
      id: group._id.toString(),
      groupName: group.groupName,
      teamName: group.teamName,
      teamLeaderId: group.teamLeaderId,
      commission: group.commission,
      memberCount: group.memberCount,
      createdAt: group.createdAt
    }));
    
    res.json({
      success: true,
      data: pendingGroupLeaders
    });
  } catch (error) {
    console.error('获取待开通组长账号错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ================================================================
// 🚀 团队长/超管一键快速开通组长（简化版，替代老pending流程）
//   TL 调：只用传 realName / phone / username  →  自动：
//        teamLeaderId = TL自己._id
//        teamName    = TL自己.teamName
//        groupName   = realName + "代理"
//        password    = 11112222
//        role        = GROUP_LEADER（TL永远开不出另一个TL，权限锁死）
//        commission  = P1档位实际比例（读档表，默认6%，不是硬编码5%）
//   SA 调：必须传 teamLeaderId 指定挂到谁名下（SA自己不一定有teamName）
// ================================================================
router.post('/group-leader/quick-create', authMiddleware, async (req, res) => {
  try {
    const rawRole = String(req.user?.role || '').trim().toUpperCase();
    const isSA = rawRole === 'SUPERADMIN';
    const isTL = rawRole === 'NORMAL_ADMIN';
    const isGL = rawRole === 'GROUP_LEADER';

    // ---------- 1. 权限：只有 SA / TL 能调，GL 不行 ----------
    if (!isSA && !isTL) {
      return res.status(403).json({ success: false, message: '权限不足：只有团队长或超管可以开通组长账号' });
    }
    if (isGL) {
      return res.status(403).json({ success: false, message: '权限不足：组长账号不能再开通其他管理员' });
    }

    // ---------- 2. 入参：realName / phone / username（必填，groupName自动生成） ----------
    const realName = String(req.body?.realName || '').trim();
    const phone    = String(req.body?.phone    || '').trim();
    const username = String(req.body?.username || '').trim();
    if (!realName || !phone || !username) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：请填写真实姓名(realName)、手机号(phone)、登录用户名(username)'
      });
    }

    // ---------- 3. 确定归属团队（teamLeaderId + teamName）----------
    let teamLeaderId, teamName, teamLeaderUsername = '';
    if (isTL) {
      // TL 调：强制挂自己名下（前端传 teamLeaderId 也直接忽略，防越权）
      const me = await Admin.findById(req.user.id).select('_id username teamName role').lean();
      if (!me) return res.status(403).json({ success: false, message: '当前账号不存在，请重新登录' });
      if (!me.teamName) {
        return res.status(400).json({ success: false, message: '您的团队名称未设置，无法开通组长，请联系超管' });
      }
      teamLeaderId = String(me._id);
      teamName = me.teamName;
      teamLeaderUsername = me.username || '';
    } else {
      // SA 调：必须传 teamLeaderId，且必须是有效的 NORMAL_ADMIN（团队长）
      const tlId = String(req.body?.teamLeaderId || '').trim();
      if (!tlId) {
        return res.status(400).json({ success: false, message: '缺少必要参数：超管开通组长时必须指定 teamLeaderId（要挂到哪位团队长名下）' });
      }
      let tl = null;
      try { tl = await Admin.findById(tlId).select('_id username teamName role').lean(); }
      catch (_) { tl = null; }
      if (!tl) return res.status(400).json({ success: false, message: 'teamLeaderId 不存在' });
      const tlRole = String(tl.role || '').toUpperCase();
      if (tlRole !== 'NORMAL_ADMIN') {
        return res.status(400).json({ success: false, message: 'teamLeaderId 必须是团队长(NORMAL_ADMIN)账号，不能是超管或组长' });
      }
      if (!tl.teamName) {
        return res.status(400).json({ success: false, message: '目标团队长未设置 teamName，无法开通，请先给该团队长设置 teamName' });
      }
      teamLeaderId = String(tl._id);
      teamName = tl.teamName;
      teamLeaderUsername = tl.username || '';
    }

    // ---------- 4. 读 P1 档位提成（档表权威值，默认 5%）----------
    let p1Commission = 0.05;
    try {
      const { list: glLevelCfg } = await verification.getLevelConfig();
      const p1Cfg = (glLevelCfg || []).find(c => String(c.level || '').toUpperCase() === 'P1');
      if (p1Cfg && typeof +p1Cfg.commission === 'number' && +p1Cfg.commission > 0 && +p1Cfg.commission <= 1) {
        p1Commission = +p1Cfg.commission;
      }
    } catch (_) { /* 档表读取失败就用 0.05 兜底，不阻塞开通 */ }

    // ---------- 5. 自动生成 groupName = realName + "代理" ----------
    const groupName = realName + '代理';

    // ---------- 6. 唯一性校验 ----------
    const duplicateAdmin = await Admin.findOne({ username }).select('_id').lean();
    if (duplicateAdmin) {
      return res.status(400).json({ success: false, message: '用户名已存在，请换一个' });
    }
    const duplicateGroup = await TeamGroup.findOne({ teamLeaderId, groupName }).select('_id').lean();
    if (duplicateGroup) {
      return res.status(400).json({
        success: false,
        message: '您名下已存在同名校「' + groupName + '」，请让组长使用不同的真实姓名或由超管手动创建'
      });
    }

    // ---------- 7. 原子创建：Admin + TeamGroup + 双向绑定（任一步失败 rollback）----------
    const DEFAULT_PASSWORD = '11112222';
    let newAdmin = null;
    let newGroup = null;
    try {
      newAdmin = new Admin({
        username,
        password: hashPassword(DEFAULT_PASSWORD),
        role: 'GROUP_LEADER',           // 🔒 强制锁死为组长，不接受前端 role 参数，避免 TL 越权开 TL
        teamName,
        teamGroupId: null,              // 第 3 步回写
        groupName,
        realName,
        phone,
        region: String(req.body?.region || '').trim(),
        status: 'enabled',              // 直接开通 = enabled，不再 pending
        commission: p1Commission,
        parentTlId: teamLeaderId,
        manualLevel: null,
        manualLevelSetAt: null,
        promotedAt: null
      });
      await newAdmin.save();

      newGroup = new TeamGroup({
        teamLeaderId,
        teamName,
        groupName,
        groupLeaderId: String(newAdmin._id),
        groupLeaderName: realName,
        commission: p1Commission,
        memberCount: 0,
        status: 'active'
      });
      await newGroup.save();

      newAdmin.teamGroupId = String(newGroup._id);
      newAdmin.groupName = groupName;
      await newAdmin.save();

      // 记录一笔审计日志（便于SA查谁开通的）
      try {
        const operator = await Admin.findById(req.user.id).select('username realName').lean();
        await CommissionHistory.create({
          teamGroupId: newGroup._id,
          groupName,
          oldCommission: 0,
          newCommission: p1Commission,
          operatorId: req.user.id,
          operatorName: (operator?.realName || operator?.username || ''),
          changeTime: new Date(),
          remark: '【快速开通】创建组长账号 username=' + username + ' realName=' + realName + ' 初始档位P1 比例=' + (p1Commission*100).toFixed(2) + '%'
        });
      } catch (_) { /* 审计失败不影响主流程 */ }

    } catch (err) {
      // Rollback：建了一半就全删，避免脏数据
      try { if (newGroup && newGroup._id) await TeamGroup.findByIdAndDelete(newGroup._id); } catch (_) {}
      try { if (newAdmin && newAdmin._id) await Admin.findByIdAndDelete(newAdmin._id); } catch (_) {}
      if (err?.name === 'ValidationError') {
        const messages = Object.values(err.errors || {}).map(e => e.message).join('; ');
        return res.status(400).json({ success: false, message: '数据校验失败：' + messages });
      }
      if (err?.code === 11000) {
        return res.status(400).json({ success: false, message: '用户名已存在，请换一个(并发冲突)' });
      }
      console.error('[quick-create GL] rollback err:', err?.stack || err);
      return res.status(500).json({ success: false, message: '开通失败，请稍后重试' });
    }

    // ---------- 8. 清缓存（所有组长/团队长/管理员数据列表）----------
    try {
      clear('group-leader-commission-stats-');
      clear('group-leader-stats-');
      clear('group-leader-performance-');
      clear('team-leader-performance-');
      clear('team-leader-commission-');
      clear('admin-dashboard-');
      clear('dashboard-');
      clear('dashboard_users_v4_');
      clear('team_leaders_');
      clear('group_leaders_');
      clear('employee_list_');
      clear('admins_list_');
      clear('account_admins_');
      clear('pending_group_leaders_');
      if (verification.clearAllCaches) verification.clearAllCaches();
    } catch (_) { /* 清缓存失败不阻塞主流程 */ }

    // ---------- 9. 返回：账号+密码+所属团队+初始比例 ----------
    return res.json({
      success: true,
      message: '组长创建成功，初始登录密码 ' + DEFAULT_PASSWORD + '，请及时告知组长本人修改',
      data: {
        _id: String(newAdmin._id),
        groupId: String(newGroup._id),
        username,
        password: DEFAULT_PASSWORD,
        role: 'GROUP_LEADER',
        realName,
        phone,
        groupName,
        teamName,
        teamLeaderUsername,
        teamLeaderId,
        commission: p1Commission,
        status: 'enabled',
        level: 'P1',
        createdAt: newGroup.createdAt || new Date()
      }
    });
  } catch (error) {
    console.error('快速开通组长错误:', error?.stack || error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});


module.exports = router;