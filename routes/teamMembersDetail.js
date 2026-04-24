const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const GoldLog = require('../models/GoldLog');
const LoginRecord = require('../models/LoginRecord');
const authMiddleware = require('../middleware/auth');

// 缓存对象
const memberCache = new Map();
const CACHE_TTL = 30 * 1000; // 30秒缓存

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 团队成员详情接口（新）
router.get('/admin/dashboard/team-leader/teams/:leaderId/members', authMiddleware, async (req, res) => {
  try {
    const { leaderId } = req.params;
    const { mode = 'today' } = req.query;
    
    // 验证参数
    if (!leaderId) {
      return res.status(400).json({ success: false, message: '缺少团队领队ID' });
    }
    
    if (mode !== 'today' && mode !== 'month') {
      return res.status(400).json({ success: false, message: '无效的时间范围参数' });
    }
    
    // 生成缓存键
    const cacheKey = `${leaderId}_${mode}`;
    const now = Date.now();
    
    // 检查缓存
    if (memberCache.has(cacheKey)) {
      const cachedData = memberCache.get(cacheKey);
      if (now - cachedData.timestamp < CACHE_TTL) {
        return res.json(cachedData.data);
      }
    }
    
    // 获取北京时间
    const beijingNow = getBeijingDate();
    
    // 计算今日时间范围
    const todayStartBeijing = new Date(beijingNow);
    todayStartBeijing.setUTCHours(0, 0, 0, 0);
    const todayStart = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    const todayEnd = new Date();
    
    // 计算本月时间范围
    const monthStartBeijing = new Date(beijingNow);
    monthStartBeijing.setUTCDate(1);
    monthStartBeijing.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(monthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 获取团队成员
    const employees = await Employee.find({ parentId: leaderId });
    
    if (employees.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    // 获取成员ID列表
    const employeeIds = employees.map(e => e.employeeId);
    
    // 统计今日金币记录
    const todayStats = await GoldLog.aggregate([
      {
        $match: {
          employeeId: { $in: employeeIds },
          createTime: { $gte: todayStart, $lt: todayEnd }
        }
      },
      {
        $group: {
          _id: '$employeeId',
          totalGold: { $sum: '$gold' },
          totalEcpm: { $sum: '$ecpm' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // 统计本月金币记录
    const monthStats = await GoldLog.aggregate([
      {
        $match: {
          employeeId: { $in: employeeIds },
          createTime: { $gte: monthStart, $lt: todayEnd }
        }
      },
      {
        $group: {
          _id: '$employeeId',
          totalGold: { $sum: '$gold' },
          totalEcpm: { $sum: '$ecpm' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // 获取今日登录记录
    const todayLoginRecords = await LoginRecord.find({
      employeeId: { $in: employeeIds },
      loginDate: { $gte: todayStart, $lt: todayEnd }
    });
    
    // 构建统计数据映射
    const todayStatsMap = new Map();
    todayStats.forEach(stat => {
      todayStatsMap.set(stat._id, {
        totalGold: stat.totalGold,
        totalEcpm: stat.totalEcpm,
        count: stat.count
      });
    });
    
    const monthStatsMap = new Map();
    monthStats.forEach(stat => {
      monthStatsMap.set(stat._id, {
        totalGold: stat.totalGold,
        totalEcpm: stat.totalEcpm,
        count: stat.count
      });
    });
    
    // 构建今日活跃用户集合
    const todayActiveSet = new Set(todayLoginRecords.map(r => r.employeeId));
    
    // 构建成员数据
    const members = employees.map(employee => {
      const todayData = todayStatsMap.get(employee.employeeId) || { totalGold: 0, totalEcpm: 0, count: 0 };
      const monthData = monthStatsMap.get(employee.employeeId) || { totalGold: 0, totalEcpm: 0, count: 0 };
      
      const todayWatched = todayData.count;
      const monthlyWatched = monthData.count;
      const todayEarnings = (todayData.totalGold / 1000) * 0.2; // 转换为元
      const monthlyEarnings = (monthData.totalGold / 1000) * 0.2; // 转换为元
      const todayAgc = todayWatched > 0 ? (todayData.totalGold / todayWatched) : 0;
      const monthlyAgc = monthlyWatched > 0 ? (monthData.totalGold / monthlyWatched) : 0;
      const isActive = todayActiveSet.has(employee.employeeId);
      
      return {
        id: employee.employeeId,
        name: employee.realName || employee.employeeId,
        avatar: '', // 头像字段，暂时为空
        todayWatched: todayWatched,
        monthlyWatched: monthlyWatched,
        todayEarnings: parseFloat(todayEarnings.toFixed(2)),
        monthlyEarnings: parseFloat(monthlyEarnings.toFixed(2)),
        todayAgc: parseFloat(todayAgc.toFixed(2)),
        monthlyAgc: parseFloat(monthlyAgc.toFixed(2)),
        status: isActive ? '在线' : '离线'
      };
    });
    
    // 按收益排序（根据mode参数）
    if (mode === 'today') {
      members.sort((a, b) => b.todayEarnings - a.todayEarnings);
    } else {
      members.sort((a, b) => b.monthlyEarnings - a.monthlyEarnings);
    }
    
    // 缓存数据
    memberCache.set(cacheKey, {
      data: members,
      timestamp: now
    });
    
    // 清理过期缓存
    for (const [key, value] of memberCache.entries()) {
      if (now - value.timestamp >= CACHE_TTL) {
        memberCache.delete(key);
      }
    }
    
    res.json(members);
  } catch (error) {
    console.error('获取团队成员详情错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;