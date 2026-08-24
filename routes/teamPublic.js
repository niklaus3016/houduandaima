const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const LoginRecord = require('../models/LoginRecord');
const Employee = require('../models/Employee');
const Admin = require('../models/Admin');
const UserActivity = require('../models/UserActivity');
const TeamGroup = require('../models/TeamGroup');

const listCache = new Map();
const LIST_CACHE_TTL = 5 * 60 * 1000;  // 5分钟（原60秒）

const memberCache = new Map();
const MEMBER_CACHE_TTL = 3 * 60 * 1000; // 3分钟（原30秒）

function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

function getBeijingStartOfMonth(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const utcMidnight = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

function getYesterdayStart(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate() - 1;
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

function getYesterdayEnd(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

function getLastMonthStart(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth() - 1;
  const utcMidnight = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

function getLastMonthEnd(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const utcMidnight = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

function getCache(key, cacheMap, ttl) {
  const item = cacheMap.get(key);
  if (item && Date.now() < item.expiry) {
    return item.data;
  }
  cacheMap.delete(key);
  return null;
}

function setCache(key, data, cacheMap, ttl) {
  cacheMap.set(key, {
    data,
    expiry: Date.now() + ttl
  });
}

router.get('/list', async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'todayRevenue' } = req.query;
    const cacheKey = `team_list_${page}_${limit}_${sortBy}`;

    const cached = getCache(cacheKey, listCache, LIST_CACHE_TTL);
    if (cached) {
      return res.json(cached);
    }

    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(beijingNow);
    const monthStart = getBeijingStartOfMonth(beijingNow);
    const yesterdayStart = getYesterdayStart(beijingNow);
    const yesterdayEnd = getYesterdayEnd(beijingNow);
    const lastMonthStart = getLastMonthStart(beijingNow);
    const lastMonthEnd = getLastMonthEnd(beijingNow);

    const admins = await Admin.find({ status: 'enabled', role: { $ne: 'superadmin' } });

    const allEmployees = await Employee.find({});
    const employeeMap = {};
    allEmployees.forEach(emp => {
      if (!employeeMap[emp.parentId]) {
        employeeMap[emp.parentId] = [];
      }
      employeeMap[emp.parentId].push(emp);
    });

    const allEmployeeIds = [...new Set(allEmployees.map(e => e.employeeId))];

    const [todayGoldAgg, yesterdayGoldAgg, monthGoldAgg, lastMonthGoldAgg, totalGoldAgg, todayLoginAgg, monthLoginAgg] = await Promise.all([
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: todayStart } } },
        { $group: { _id: '$employeeId', todayGold: { $sum: '$gold' }, todayCount: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: yesterdayStart, $lt: yesterdayEnd } } },
        { $group: { _id: '$employeeId', yesterdayGold: { $sum: '$gold' } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: monthStart } } },
        { $group: { _id: '$employeeId', monthGold: { $sum: '$gold' }, monthCount: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
        { $group: { _id: '$employeeId', lastMonthGold: { $sum: '$gold' } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, totalCount: { $sum: 1 }, totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } } } }
      ]),
      LoginRecord.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, loginDate: { $gte: todayStart } } },
        { $group: { _id: '$employeeId', count: { $sum: 1 } } }
      ]),
      LoginRecord.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, loginDate: { $gte: monthStart } } },
        { $group: { _id: '$employeeId', count: { $sum: 1 } } }
      ])
    ]);

    const empStatsMap = {};
    todayGoldAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], todayGold: g.todayGold, todayCount: g.todayCount }; });
    yesterdayGoldAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], yesterdayGold: g.yesterdayGold }; });
    monthGoldAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], monthGold: g.monthGold, monthCount: g.monthCount }; });
    lastMonthGoldAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], lastMonthGold: g.lastMonthGold }; });
    totalGoldAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], totalGold: g.totalGold, totalCount: g.totalCount, totalEcpm: g.totalEcpm }; });
    todayLoginAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], todayLogin: g.count }; });
    monthLoginAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], monthLogin: g.count }; });

    const teamsWithStats = admins.map(admin => {
      const employees = employeeMap[admin._id.toString()] || [];
      const employeeIds = employees.map(e => e.employeeId);

      let todayRevenue = 0, todayAds = 0, monthRevenue = 0, monthlyAds = 0;
      let yesterdayRevenue = 0, lastMonthRevenue = 0, totalRevenue = 0, totalAds = 0, totalEcpm = 0;
      let todayActiveUsers = 0, monthActiveUsers = 0;

      employeeIds.forEach(empId => {
        const stats = empStatsMap[empId] || {};
        todayRevenue += stats.todayGold || 0;
        todayAds += stats.todayCount || 0;
        monthRevenue += stats.monthGold || 0;
        monthlyAds += stats.monthCount || 0;
        yesterdayRevenue += stats.yesterdayGold || 0;
        lastMonthRevenue += stats.lastMonthGold || 0;
        totalRevenue += stats.totalGold || 0;
        totalAds += stats.totalCount || 0;
        totalEcpm += stats.totalEcpm || 0;
        if (stats.todayLogin) todayActiveUsers++;
        if (stats.monthLogin) monthActiveUsers++;
      });

      const todayGrowth = yesterdayRevenue > 0
        ? parseFloat((((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(2))
        : 0;

      const monthGrowth = lastMonthRevenue > 0
        ? parseFloat((((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(2))
        : 0;

      const ecpm = totalAds > 0 ? totalEcpm / totalAds : 0;

      const todayActiveRate = employeeIds.length > 0
        ? Math.round((todayActiveUsers / employeeIds.length) * 100) + '%'
        : '0%';

      const monthlyActiveRate = employeeIds.length > 0
        ? Math.round((monthActiveUsers / employeeIds.length) * 100) + '%'
        : '0%';

      let level = '新锐';
      if (totalRevenue >= 100000) level = '荣耀';
      else if (totalRevenue >= 50000) level = '王牌';
      else if (totalRevenue >= 10000) level = '精英';

      return {
        id: admin._id,
        leader: admin.teamName || admin.realName || admin.username,
        memberCount: employeeIds.length,
        groupCount: 0,
        todayAds,
        monthlyAds,
        totalAds,
        todayRevenue: parseFloat((todayRevenue / 1000).toFixed(2)),
        totalRevenue: parseFloat((totalRevenue / 1000).toFixed(2)),
        todayGrowth,
        monthGrowth,
        ecpm: parseFloat(ecpm.toFixed(2)),
        todayActiveRate,
        monthlyActiveRate,
        level
      };
    });

    teamsWithStats.sort((a, b) => {
      if (sortBy === 'todayRevenue') {
        return b.todayRevenue - a.todayRevenue;
      } else if (sortBy === 'totalRevenue') {
        return b.totalRevenue - a.totalRevenue;
      }
      return 0;
    });

    const total = teamsWithStats.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedData = teamsWithStats.slice(startIndex, endIndex);

    const result = {
      success: true,
      data: paginatedData,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    };

    setCache(cacheKey, result, listCache, LIST_CACHE_TTL);
    res.json(result);
  } catch (error) {
    console.error('获取团队列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:teamId/members', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const cacheKey = `team_members_${teamId}_${page}_${limit}`;

    const cached = getCache(cacheKey, memberCache, MEMBER_CACHE_TTL);
    if (cached) {
      return res.json(cached);
    }

    const admin = await Admin.findById(teamId);
    if (!admin) {
      return res.status(404).json({ success: false, message: '团队不存在' });
    }

    const employees = await Employee.find({ parentId: admin._id.toString() });
    const employeeIds = employees.map(e => e.employeeId);
    const userIds = employees.map(e => e.userId).filter(Boolean);

    if (employeeIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { total: 0, page: 1, limit: 20, pages: 0 }
      });
    }

    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(beijingNow);
    const monthStart = getBeijingStartOfMonth(beijingNow);

    const [todayGoldAgg, monthGoldAgg, totalGoldAgg] = await Promise.all([
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: todayStart } } },
        { $group: { _id: '$employeeId', todayGold: { $sum: '$gold' }, todayCount: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: monthStart } } },
        { $group: { _id: '$employeeId', monthGold: { $sum: '$gold' }, monthCount: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, totalCount: { $sum: 1 } } }
      ])
    ]);

    const userStatsMap = {};
    todayGoldAgg.forEach(g => { userStatsMap[g._id] = { ...userStatsMap[g._id], todayGold: g.todayGold, todayCount: g.todayCount }; });
    monthGoldAgg.forEach(g => { userStatsMap[g._id] = { ...userStatsMap[g._id], monthGold: g.monthGold, monthCount: g.monthCount }; });
    totalGoldAgg.forEach(g => { userStatsMap[g._id] = { ...userStatsMap[g._id], totalGold: g.totalGold, totalCount: g.totalCount }; });

    let memberDetails = employees.map(emp => {
      const stats = userStatsMap[emp.employeeId] || {};
      const todayWatched = stats.todayCount || 0;
      const monthlyWatched = stats.monthCount || 0;
      const totalWatched = stats.totalCount || 0;
      const todayEarnings = (stats.todayGold || 0) / 1000;
      const monthlyEarnings = (stats.monthGold || 0) / 1000;
      const totalEarnings = (stats.totalGold || 0) / 1000;

      return {
        id: emp._id,
        employeeId: emp.employeeId,
        realName: emp.realName || '',
        todayWatched,
        monthlyWatched,
        totalWatched,
        todayEarnings: parseFloat(todayEarnings.toFixed(2)),
        monthlyEarnings: parseFloat(monthlyEarnings.toFixed(2)),
        totalEarnings: parseFloat(totalEarnings.toFixed(2))
      };
    });

    const total = memberDetails.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedData = memberDetails.slice(startIndex, endIndex);

    const result = {
      success: true,
      data: paginatedData,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    };

    setCache(cacheKey, result, memberCache, MEMBER_CACHE_TTL);
    res.json(result);
  } catch (error) {
    console.error('获取团队成员详情错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;