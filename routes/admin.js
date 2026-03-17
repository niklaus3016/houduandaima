const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const TeamGroup = require('../models/TeamGroup');
const Employee = require('../models/Employee');
const CommissionHistory = require('../models/CommissionHistory');
const { generateToken, hashPassword, comparePassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');

// 初始化默认管理员账号
const initDefaultAdmin = async () => {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const defaultAdmin = new Admin({
        username: 'admin',
        password: hashPassword('admin123'),
        role: 'superadmin'
      });
      await defaultAdmin.save();
      console.log('默认管理员账号已创建: admin / admin123');
    }
  } catch (error) {
    console.error('初始化默认管理员失败:', error);
  }
};

// 调用初始化函数
initDefaultAdmin();

// 管理员登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '缺少用户名或密码' });
    }
    
    // 查找管理员
    const admin = await Admin.findOne({ username });
    
    if (!admin) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    
    // 验证密码
    if (!comparePassword(password, admin.password)) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    
    // 生成token
    const token = generateToken(admin);
    
    // 返回用户信息和token
    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: admin._id,
          username: admin.username,
          role: admin.role,
          teamName: admin.teamName || '',
          teamGroupId: admin.teamGroupId || null,
          groupName: admin.groupName || null,
          commission: admin.commission || 0
        },
        token
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id);
    
    if (!admin) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    res.json({
      success: true,
      data: {
        id: admin._id,
        username: admin.username,
        role: admin.role,
        teamName: admin.teamName || '',
        teamGroupId: admin.teamGroupId || null,
        groupName: admin.groupName || null,
        commission: admin.commission || 0,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 修改密码
router.post('/update-password', authMiddleware, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    
    if (!userId || !newPassword) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin' && req.user.id.toString() !== userId) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    // 更新密码
    const admin = await Admin.findById(userId);
    
    if (!admin) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    admin.password = hashPassword(newPassword);
    await admin.save();
    
    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 新增组API
router.post('/team-group/add', authMiddleware, async (req, res) => {
  try {
    const { teamLeaderId, teamName, groupName, groupLeaderId, commission } = req.body;
    
    if (!teamLeaderId || !teamName || !groupName) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin' && req.user.id.toString() !== teamLeaderId) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    // 验证分成比例
    const finalCommission = commission || 0.05;
    if (finalCommission > 0.2) {
      return res.status(400).json({ success: false, message: '组长分成比例不得超过20%' });
    }
    
    // 检查组名是否已存在
    const existingGroup = await TeamGroup.findOne({ teamLeaderId, groupName });
    if (existingGroup) {
      return res.status(400).json({ success: false, message: '该团队下已存在同名组' });
    }
    
    let groupLeaderName = null;
    if (groupLeaderId) {
      const leader = await Admin.findById(groupLeaderId);
      if (leader) {
        groupLeaderName = leader.realName || leader.username;
      }
    }
    
    const newGroup = new TeamGroup({
      teamLeaderId,
      teamName,
      groupName,
      groupLeaderId: groupLeaderId || null,
      groupLeaderName: groupLeaderName || null,
      commission: finalCommission,
      memberCount: 0
    });
    
    await newGroup.save();
    
    res.json({
      success: true,
      message: '组创建成功',
      data: newGroup
    });
  } catch (error) {
    console.error('创建组错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 组列表API
router.get('/team-group/list', authMiddleware, async (req, res) => {
  try {
    const { teamLeaderId, teamName } = req.query;
    
    let query = {};
    if (teamLeaderId) {
      query.teamLeaderId = teamLeaderId;
    }
    if (teamName) {
      query.teamName = teamName;
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin') {
      query.teamLeaderId = req.user.id.toString();
    }
    
    const groups = await TeamGroup.find(query).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error('获取组列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 新增组长API
router.post('/group-leader/add', authMiddleware, async (req, res) => {
  try {
    const { username, password, realName, teamName, teamGroupId, groupName, commission } = req.body;
    
    if (!username || !password || !realName || !teamName || !teamGroupId || !groupName) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 验证分成比例
    const finalCommission = commission || 0.05;
    if (finalCommission > 0.2) {
      return res.status(400).json({ success: false, message: '组长分成比例不得超过20%' });
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin') {
      // 团队长只能创建自己团队的组长
      const teamLeader = await Admin.findById(req.user.id);
      if (teamLeader && teamLeader.teamName !== teamName) {
        return res.status(403).json({ success: false, message: '权限不足' });
      }
    }
    
    // 检查用户名是否已存在
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    
    // 检查组是否存在
    const group = await TeamGroup.findById(teamGroupId);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
    }
    
    // 创建组长账号
    const newGroupLeader = new Admin({
      username,
      password: hashPassword(password),
      role: 'NORMAL_ADMIN', // 组长使用NORMAL_ADMIN角色
      teamName,
      teamGroupId,
      groupName,
      commission: finalCommission,
      realName
    });
    
    await newGroupLeader.save();
    
    // 更新组的组长信息
    group.groupLeaderId = newGroupLeader._id.toString();
    group.groupLeaderName = realName;
    await group.save();
    
    res.json({
      success: true,
      message: '组长创建成功',
      data: newGroupLeader
    });
  } catch (error) {
    console.error('创建组长错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 组长列表API
router.get('/group-leader/list', authMiddleware, async (req, res) => {
  try {
    const { teamLeaderId, teamName } = req.query;
    
    let query = {
      role: 'NORMAL_ADMIN',
      teamGroupId: { $ne: null }
    };
    
    if (teamName) {
      query.teamName = teamName;
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin') {
      // 团队长只能查看自己团队的组长
      const teamLeader = await Admin.findById(req.user.id);
      if (teamLeader) {
        query.teamName = teamLeader.teamName;
      }
    }
    
    const groupLeaders = await Admin.find(query).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: groupLeaders
    });
  } catch (error) {
    console.error('获取组长列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 编辑组长API
router.put('/group-leader/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, realName, teamName, teamGroupId, groupName, commission, status, phone, region } = req.body;
    
    const groupLeader = await Admin.findById(id);
    if (!groupLeader) {
      return res.status(404).json({ success: false, message: '组长不存在' });
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin') {
      // 团队长只能编辑自己团队的组长
      const teamLeader = await Admin.findById(req.user.id);
      if (teamLeader && teamLeader.teamName !== groupLeader.teamName) {
        return res.status(403).json({ success: false, message: '权限不足' });
      }
    }
    
    // 如果要更新用户名，检查是否已被其他用户使用
    if (username && username !== groupLeader.username) {
      const existingAdmin = await Admin.findOne({ 
        username, 
        _id: { $ne: id } 
      });
      if (existingAdmin) {
        return res.status(400).json({ success: false, message: '用户名已存在' });
      }
      groupLeader.username = username;
    }
    
    if (password) {
      groupLeader.password = hashPassword(password);
    }
    if (realName !== undefined) groupLeader.realName = realName;
    if (teamName !== undefined) groupLeader.teamName = teamName;
    if (teamGroupId !== undefined) groupLeader.teamGroupId = teamGroupId;
    if (groupName !== undefined) groupLeader.groupName = groupName;
    if (commission !== undefined) {
      if (commission > 0.2) {
        return res.status(400).json({ success: false, message: '组长分成比例不得超过20%' });
      }
      groupLeader.commission = commission;
    }
    if (status !== undefined) groupLeader.status = status;
    if (phone !== undefined) groupLeader.phone = phone;
    if (region !== undefined) groupLeader.region = region;
    
    groupLeader.updatedAt = new Date();
    await groupLeader.save();
    
    // 如果更新了组信息，同步更新TeamGroup表
    if (teamGroupId || groupName || realName) {
      const group = await TeamGroup.findOne({ groupLeaderId: id });
      if (group) {
        if (groupName) group.groupName = groupName;
        if (realName) group.groupLeaderName = realName;
        await group.save();
      }
    }
    
    res.json({
      success: true,
      message: '组长更新成功',
      data: {
        _id: groupLeader._id,
        username: groupLeader.username,
        role: groupLeader.role,
        teamName: groupLeader.teamName,
        teamGroupId: groupLeader.teamGroupId,
        groupName: groupLeader.groupName,
        commission: groupLeader.commission,
        realName: groupLeader.realName,
        phone: groupLeader.phone || '',
        region: groupLeader.region || '',
        status: groupLeader.status,
        createdAt: groupLeader.createdAt
      }
    });
  } catch (error) {
    console.error('更新组长错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除组长API
router.delete('/group-leader/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const groupLeader = await Admin.findById(id);
    if (!groupLeader) {
      return res.status(404).json({ success: false, message: '组长不存在' });
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin') {
      // 团队长只能删除自己团队的组长
      const teamLeader = await Admin.findById(req.user.id);
      if (teamLeader && teamLeader.teamName !== groupLeader.teamName) {
        return res.status(403).json({ success: false, message: '权限不足' });
      }
    }
    
    // 清空TeamGroup表中的组长信息
    if (groupLeader.teamGroupId) {
      const group = await TeamGroup.findById(groupLeader.teamGroupId);
      if (group) {
        group.groupLeaderId = null;
        group.groupLeaderName = null;
        await group.save();
      }
    }
    
    // 删除组长账号
    await Admin.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: '组长删除成功'
    });
  } catch (error) {
    console.error('删除组长错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 编辑组API
router.put('/team-group/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName, groupLeaderId, commission } = req.body;
    
    const group = await TeamGroup.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin' && req.user.id.toString() !== group.teamLeaderId) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    if (groupName) {
      // 检查新组名是否已存在
      const existingGroup = await TeamGroup.findOne({ 
        teamLeaderId: group.teamLeaderId, 
        groupName, 
        _id: { $ne: id } 
      });
      if (existingGroup) {
        return res.status(400).json({ success: false, message: '该团队下已存在同名组' });
      }
      group.groupName = groupName;
    }
    
    if (groupLeaderId) {
      const leader = await Admin.findById(groupLeaderId);
      if (leader) {
        group.groupLeaderId = groupLeaderId;
        group.groupLeaderName = leader.realName || leader.username;
      }
    }
    
    if (commission !== undefined) {
      if (commission > 0.2) {
        return res.status(400).json({ success: false, message: '组长分成比例不得超过20%' });
      }
      
      // 记录提成比例变更历史
      if (commission !== group.commission) {
        const operator = await Admin.findById(req.user.id);
        const historyRecord = new CommissionHistory({
          teamGroupId: group._id,
          groupName: group.groupName,
          oldCommission: group.commission,
          newCommission: commission,
          operatorId: req.user.id,
          operatorName: operator ? (operator.realName || operator.username) : '未知'
        });
        await historyRecord.save();
      }
      
      group.commission = commission;
    }
    
    await group.save();
    
    res.json({
      success: true,
      message: '组更新成功',
      data: group
    });
  } catch (error) {
    console.error('更新组错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除组API
router.delete('/team-group/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const group = await TeamGroup.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin' && req.user.id.toString() !== group.teamLeaderId) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    // 检查是否有组员
    const memberCount = await Employee.countDocuments({ teamGroupId: id });
    if (memberCount > 0) {
      return res.status(400).json({ success: false, message: '该组下有组员，无法删除' });
    }
    
    // 检查是否有组长
    if (group.groupLeaderId) {
      const groupLeader = await Admin.findById(group.groupLeaderId);
      if (groupLeader) {
        // 清空组长的组信息
        groupLeader.teamGroupId = null;
        groupLeader.groupName = null;
        await groupLeader.save();
      }
    }
    
    await group.deleteOne();
    
    res.json({
      success: true,
      message: '组删除成功'
    });
  } catch (error) {
    console.error('删除组错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取提成比例变更历史
router.get('/commission-history/:teamGroupId', authMiddleware, async (req, res) => {
  try {
    const { teamGroupId } = req.params;
    
    const history = await CommissionHistory.find({ teamGroupId })
      .sort({ changeTime: -1 })
      .limit(100);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('获取提成比例变更历史错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取组长提成记录
router.get('/group-leader-commission/:teamGroupId', authMiddleware, async (req, res) => {
  try {
    const { teamGroupId } = req.params;
    const { startDate, endDate, limit = 10 } = req.query;
    const GoldLog = require('../models/GoldLog');
    const UserGold = require('../models/UserGold');
    
    // 获取组信息
    const group = await TeamGroup.findById(teamGroupId);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
    }
    
    // 获取组下所有组员
    const employees = await Employee.find({ teamGroupId });
    const employeeIds = employees.map(e => e.employeeId);
    
    // 获取提成比例变更历史
    const commissionHistory = await CommissionHistory.find({ teamGroupId })
      .sort({ changeTime: 1 });
    
    // 构建时间范围
    let queryStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let queryEndDate = endDate ? new Date(endDate) : new Date();
    
    // 获取金币记录
    const goldLogs = await GoldLog.find({
      employeeId: { $in: employeeIds },
      createTime: { $gte: queryStartDate, $lte: queryEndDate }
    }).sort({ createTime: -1 });
    
    // 计算每条记录的提成
    const commissionRecords = goldLogs.map(log => {
      // 找到当时的提成比例
      let commission = group.commission; // 默认使用当前比例
      for (let i = commissionHistory.length - 1; i >= 0; i--) {
        if (log.createTime >= commissionHistory[i].changeTime) {
          commission = commissionHistory[i].newCommission;
          break;
        }
      }
      if (commissionHistory.length === 0 || log.createTime < commissionHistory[0].changeTime) {
        // 如果没有变更历史，或者记录在第一次变更之前，使用当前比例
        commission = group.commission;
      }
      
      const employee = employees.find(e => e.employeeId === log.employeeId);
      const beijingTime = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000);
      
      return {
        date: beijingTime.toISOString().split('T')[0],
        time: beijingTime.toISOString().split('T')[1].split('.')[0],
        employeeId: log.employeeId,
        employeeName: employee ? employee.realName : '未知',
        gold: log.gold,
        earnings: parseFloat((log.gold / 1000).toFixed(4)),
        commission: commission,
        commissionAmount: parseFloat((log.gold / 1000 * commission).toFixed(4))
      };
    });
    
    // 按日期分组统计
    const dailyStats = {};
    commissionRecords.forEach(record => {
      if (!dailyStats[record.date]) {
        dailyStats[record.date] = {
          date: record.date,
          totalEarnings: 0,
          totalCommission: 0,
          records: []
        };
      }
      dailyStats[record.date].totalEarnings += record.earnings;
      dailyStats[record.date].totalCommission += record.commissionAmount;
      dailyStats[record.date].records.push(record);
    });
    
    // 转换为数组并排序
    const dailyStatsArray = Object.values(dailyStats)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, parseInt(limit));
    
    // 计算总计
    const totalEarnings = commissionRecords.reduce((sum, r) => sum + r.earnings, 0);
    const totalCommission = commissionRecords.reduce((sum, r) => sum + r.commissionAmount, 0);
    
    res.json({
      success: true,
      data: {
        groupName: group.groupName,
        currentCommission: group.commission,
        totalEarnings: parseFloat(totalEarnings.toFixed(4)),
        totalCommission: parseFloat(totalCommission.toFixed(4)),
        dailyStats: dailyStatsArray,
        commissionHistory: commissionHistory
      }
    });
  } catch (error) {
    console.error('获取组长提成记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;