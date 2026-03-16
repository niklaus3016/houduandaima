const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const LoginRecord = require('../models/LoginRecord');
const authMiddleware = require('../middleware/auth');

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取北京时间的当天开始（返回北京时间0点）
function getBeijingStartOfDay() {
  const beijingNow = getBeijingDate();
  const startOfDay = new Date(beijingNow);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

// 获取北京时间的当月第一天（返回北京时间0点）
function getBeijingStartOfMonth() {
    const beijingNow = getBeijingDate();
    const startOfMonth = new Date(beijingNow);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return startOfMonth;
  }
  
  // 获取昨日开始时间（UTC时间）
  function getYesterdayStart() {
    const beijingNow = getBeijingDate();
    const startOfYesterday = new Date(beijingNow);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);
    // 转换为UTC时间
    return new Date(startOfYesterday.getTime() - 8 * 60 * 60 * 1000);
  }
  
  // 获取昨日结束时间（UTC时间）
  function getYesterdayEnd() {
    const beijingNow = getBeijingDate();
    const startOfToday = new Date(beijingNow);
    startOfToday.setHours(0, 0, 0, 0);
    // 转换为UTC时间
    return new Date(startOfToday.getTime() - 8 * 60 * 60 * 1000);
  }
  
  // 获取上月开始时间（UTC时间）
  function getLastMonthStart() {
    const beijingNow = getBeijingDate();
    const startOfLastMonth = new Date(beijingNow);
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
    startOfLastMonth.setDate(1);
    startOfLastMonth.setHours(0, 0, 0, 0);
    // 转换为UTC时间
    return new Date(startOfLastMonth.getTime() - 8 * 60 * 60 * 1000);
  }
  
  // 获取上月结束时间（UTC时间）
  function getLastMonthEnd() {
    const beijingNow = getBeijingDate();
    const endOfLastMonth = new Date(beijingNow);
    endOfLastMonth.setDate(0);
    endOfLastMonth.setHours(23, 59, 59, 999);
    // 转换为UTC时间
    return new Date(endOfLastMonth.getTime() - 8 * 60 * 60 * 1000);
  }

// 获取北京时间的当天日期字符串（YYYY-MM-DD）
function getBeijingDateString() {
  return getBeijingDate().toISOString().split('T')[0];
}

router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { search, sortBy = 'todayRevenue' } = req.query;
    
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    let teams = await Team.find(query);
    
    const todayStart = getBeijingStartOfDay();
    const monthStart = getBeijingStartOfMonth();
    const yesterdayStart = getYesterdayStart();
    const yesterdayEnd = getYesterdayEnd();
    const lastMonthStart = getLastMonthStart();
    const lastMonthEnd = getLastMonthEnd();
    
    const teamsWithStats = await Promise.all(teams.map(async (team) => {
      const memberIds = team.members ? team.members.map(m => m.userId) : [];
      
      const todayGoldLogs = await GoldLog.find({
        employeeId: { $in: memberIds },
        createTime: { $gte: todayStart }
      });
      const todayAds = todayGoldLogs.length;
      const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      const monthGoldLogs = await GoldLog.find({
        employeeId: { $in: memberIds },
        createTime: { $gte: monthStart }
      });
      const monthlyAds = monthGoldLogs.length;
      const monthlyRevenue = monthGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      // 计算昨日收益
      const yesterdayGoldLogs = await GoldLog.find({
        employeeId: { $in: memberIds },
        createTime: { $gte: yesterdayStart, $lt: yesterdayEnd }
      });
      const yesterdayRevenue = yesterdayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      // 计算上月收益
      const lastMonthGoldLogs = await GoldLog.find({
        employeeId: { $in: memberIds },
        createTime: { $gte: lastMonthStart, $lte: lastMonthEnd }
      });
      const lastMonthRevenue = lastMonthGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      // 计算增长率
      const todayGrowth = yesterdayRevenue > 0 
        ? parseFloat((((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(2)) 
        : 0;
      
      const monthGrowth = lastMonthRevenue > 0 
        ? parseFloat((((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(2)) 
        : 0;
      
      const totalGoldLogs = await GoldLog.find({
        employeeId: { $in: memberIds }
      });
      const totalAds = totalGoldLogs.length;
      const totalRevenue = totalGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      const ecpm = totalAds > 0 
        ? totalGoldLogs.reduce((sum, log) => sum + (log.ecpm || 0), 0) / totalAds 
        : 0;
      
      const todayLoginRecords = await LoginRecord.find({
        userId: { $in: memberIds },
        loginDate: { $gte: todayStart }
      });
      const todayActiveUsers = new Set(todayLoginRecords.map(r => r.userId)).size;
      const todayActiveRate = memberIds.length > 0 
        ? ((todayActiveUsers / memberIds.length) * 100).toFixed(1) + '%' 
        : '0%';
      
      const monthLoginRecords = await LoginRecord.find({
        userId: { $in: memberIds },
        loginDate: { $gte: monthStart }
      });
      const monthActiveUsers = new Set(monthLoginRecords.map(r => r.userId)).size;
      const monthlyActiveRate = memberIds.length > 0 
        ? ((monthActiveUsers / memberIds.length) * 100).toFixed(1) + '%' 
        : '0%';
      
      const level = totalRevenue >= 100000 ? 'S' : totalRevenue >= 50000 ? 'A' : totalRevenue >= 10000 ? 'B' : 'C';
      
      return {
        id: team._id,
        name: team.name,
        leader: team.leaderId || '',
        memberCount: memberIds.length,
        todayRevenue: parseFloat(todayRevenue.toFixed(2)),
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        todayAds: todayAds,
        monthlyAds: monthlyAds,
        totalAds: totalAds,
        todayGrowth: todayGrowth,
        monthGrowth: monthGrowth,
        ecpm: parseFloat(ecpm.toFixed(2)),
        todayActiveRate: todayActiveRate,
        monthlyActiveRate: monthlyActiveRate,
        level: level
      };
    }));
    
    teamsWithStats.sort((a, b) => {
      if (sortBy === 'todayRevenue') {
        return b.todayRevenue - a.todayRevenue;
      } else if (sortBy === 'totalRevenue') {
        return b.totalRevenue - a.totalRevenue;
      }
      return 0;
    });
    
    res.json({
      success: true,
      data: teamsWithStats
    });
  } catch (error) {
    console.error('获取团队列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/members', authMiddleware, async (req, res) => {
  try {
    const { teamId, mode = 'today', search } = req.query;
    
    if (!teamId) {
      return res.status(400).json({ success: false, message: '缺少团队ID' });
    }
    
    const team = await Team.findById(teamId);
    
    if (!team) {
      return res.status(404).json({ success: false, message: '团队不存在' });
    }
    
    let members = team.members || [];
    
    if (search) {
      members = members.filter(member => 
        member.userId.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(beijingNow);
    
    const memberDetails = await Promise.all(members.map(async (member) => {
      const goldLogs = await GoldLog.find({ userId: member.userId });
      const todayGoldLogs = await GoldLog.find({
        userId: member.userId,
        createTime: { $gte: todayStart }
      });
      
      const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      const totalRevenue = goldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      return {
        ...member.toObject ? member.toObject() : member,
        username: `用户${member.userId}`,
        todayRevenue: parseFloat(todayRevenue.toFixed(2)),
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        performance: parseFloat((Math.random() * 100).toFixed(2))
      };
    }));
    
    res.json({
      success: true,
      data: {
        teamId: team._id,
        teamName: team.name,
        leaderId: team.leaderId,
        members: memberDetails
      }
    });
  } catch (error) {
    console.error('获取团队成员错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
