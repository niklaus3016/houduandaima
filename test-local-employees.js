const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const Admin = require('../models/Admin');
const TeamGroup = require('../models/TeamGroup');
const GoldLog = require('../models/GoldLog');

function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(date = new Date()) {
  const beijingDate = getBeijingDate(date);
  const startOfDay = new Date(beijingDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  return new Date(startOfDay.getTime() - 8 * 60 * 60 * 1000);
}

// 测试员工账号接口
router.get('/test-employees', async (req, res) => {
  try {
    const teamId = '69af8e34132651c70aa85608';

    const employees = await Employee.find({ parentId: teamId });

    const groupIds = [...new Set(employees.map(e => e.teamGroupId).filter(id => id))];
    const groups = await TeamGroup.find({ _id: { $in: groupIds } });
    const groupById = {};
    groups.forEach(g => {
      groupById[g._id.toString()] = g;
    });

    const teamAdmin = await Admin.findById(teamId);
    const teamName = teamAdmin ? teamAdmin.teamName : '';

    const employeeIds = employees.map(e => e.employeeId);
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(beijingNow);

    console.log('员工ID列表:', employeeIds.slice(0, 5));
    console.log('查询时间范围:', new Date(todayStart.getTime() - 15 * 24 * 60 * 60 * 1000), '到', todayStart);

    const goldLogs = await GoldLog.find({
      employeeId: { $in: employeeIds },
      createTime: { $gte: new Date(todayStart.getTime() - 15 * 24 * 60 * 60 * 1000) }
    });

    console.log('找到的金币记录数量:', goldLogs.length);
    if (goldLogs.length > 0) {
      console.log('前3条金币记录:', goldLogs.slice(0, 3));
    }

    const goldByEmployeeAndDay = {};
    goldLogs.forEach(log => {
      const dateKey = new Date(log.createTime).toISOString().split('T')[0];
      const empId = log.employeeId;
      if (!goldByEmployeeAndDay[empId]) {
        goldByEmployeeAndDay[empId] = {};
      }
      goldByEmployeeAndDay[empId][dateKey] = true;
    });

    console.log('金币记录统计:', Object.keys(goldByEmployeeAndDay).length, '个员工有记录');

    const result = employees.map(emp => {
      const group = emp.teamGroupId ? groupById[emp.teamGroupId.toString()] : null;
      
      let zeroEarningsDays = 0;
      const empId = emp.employeeId;
      
      for (let i = 0; i < 15; i++) {
        const checkDate = new Date(todayStart);
        checkDate.setDate(checkDate.getDate() - i);
        const dateKey = checkDate.toISOString().split('T')[0];
        
        if (!goldByEmployeeAndDay[empId] || !goldByEmployeeAndDay[empId][dateKey]) {
          zeroEarningsDays++;
        } else {
          break;
        }
      }

      return {
        _id: emp._id.toString(),
        username: emp.employeeId,
        realName: emp.realName || emp.employeeId,
        role: 'EMPLOYEE',
        status: emp.status,
        employeeId: emp.employeeId,
        phone: emp.phone || '',
        region: emp.region || '',
        teamName: teamName,
        groupName: group ? group.groupName : '',
        parentId: emp.parentId,
        parentName: group ? (group.groupLeaderName || group.groupName) : '',
        zeroEarningsDays: zeroEarningsDays,
        createdAt: emp.createdAt
      };
    });

    console.log('生成的结果数量:', result.length);
    console.log('前3个结果:', result.slice(0, 3));

    res.json({
      success: true,
      message: '获取员工列表成功',
      data: result
    });
  } catch (error) {
    console.error('获取员工列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
