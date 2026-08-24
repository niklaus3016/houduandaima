const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const LoginRecord = require('../models/LoginRecord');
const Employee = require('../models/Employee');
const authMiddleware = require('../middleware/auth');
const { getBeijingDate, getBeijingStartOfDay, getBeijingDateString, getYesterdayStart, getYesterdayEnd, getMonthStart, getMonthEnd } = require('../utils/date');

const listCache = new Map();
const LIST_CACHE_TTL = 5 * 60 * 1000;  // 5分钟（原30秒）

const memberDetailCache = new Map();
const MEMBER_CACHE_TTL = 3 * 60 * 1000; // 3分钟（原10秒）

function getBeijingStartOfMonth() {
  return getMonthStart();
}

function getLastMonthStart() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return getMonthStart(date);
}

function getLastMonthEnd() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return getMonthEnd(date);
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

router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { search, sortBy = 'todayRevenue' } = req.query;
    
    const role = req.user?.role;
    const isSuper = role === 'superadmin' || String(role).toUpperCase() === 'SUPER_ADMIN';
    const isAdminManager = String(role).toUpperCase() === 'ADMIN_MANAGER';
    
    let scopeTeamIds = [];
    let scopeHash = 'super';
    
    if (isAdminManager) {
      const Admin = require('../models/Admin');
      const admin = await Admin.findById(req.user.id).select('managedTeamIds').lean();
      scopeTeamIds = admin?.managedTeamIds?.map(id => String(id)) || [];
      scopeHash = scopeTeamIds.length > 0 
        ? `admin_${scopeTeamIds.sort().join('_')}` 
        : `admin_empty`;
    } else if (!isSuper && req.user) {
      scopeHash = `user_${req.user.id}`;
    }
    
    const cacheKey = `team_list_${search || ''}_${sortBy}_${scopeHash}`;

    const cached = getCache(cacheKey, listCache, LIST_CACHE_TTL);
    if (cached) {
      return res.json(cached);
    }

    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    if (isAdminManager && scopeTeamIds.length > 0) {
      query.leaderId = { $in: scopeTeamIds };
    }
    
    if (isAdminManager && scopeTeamIds.length === 0) {
      const result = { success: true, data: [] };
      setCache(cacheKey, result, listCache, LIST_CACHE_TTL);
      return res.json(result);
    }

    const teams = await Team.find(query);

    const todayStart = getBeijingStartOfDay();
    const monthStart = getBeijingStartOfMonth();
    const yesterdayStart = getYesterdayStart();
    const yesterdayEnd = getYesterdayEnd();
    const lastMonthStart = getLastMonthStart();
    const lastMonthEnd = getLastMonthEnd();

    const allEmployees = await Employee.find({});
    const employeeMap = {};
    allEmployees.forEach(emp => {
      if (!employeeMap[emp.parentId]) {
        employeeMap[emp.parentId] = [];
      }
      employeeMap[emp.parentId].push(emp.employeeId);
    });

    const allEmployeeIds = [...new Set(allEmployees.map(e => e.employeeId))];

    const [todayGoldAgg, monthGoldAgg, yesterdayGoldAgg, lastMonthGoldAgg, totalGoldAgg, todayLoginAgg, monthLoginAgg] = await Promise.all([
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: todayStart } } },
        { $group: { _id: '$employeeId', todayGold: { $sum: '$gold' }, todayCount: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: monthStart } } },
        { $group: { _id: '$employeeId', monthGold: { $sum: '$gold' }, monthCount: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: yesterdayStart, $lt: yesterdayEnd } } },
        { $group: { _id: '$employeeId', yesterdayGold: { $sum: '$gold' } } }
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
    monthGoldAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], monthGold: g.monthGold, monthCount: g.monthCount }; });
    yesterdayGoldAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], yesterdayGold: g.yesterdayGold }; });
    lastMonthGoldAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], lastMonthGold: g.lastMonthGold }; });
    totalGoldAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], totalGold: g.totalGold, totalCount: g.totalCount, totalEcpm: g.totalEcpm }; });
    todayLoginAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], todayLogin: g.count }; });
    monthLoginAgg.forEach(g => { empStatsMap[g._id] = { ...empStatsMap[g._id], monthLogin: g.count }; });

    const teamsWithStats = teams.map(team => {
      const memberIds = employeeMap[team.leaderId] || [];
      let todayRevenue = 0, todayAds = 0, monthRevenue = 0, monthlyAds = 0;
      let yesterdayRevenue = 0, lastMonthRevenue = 0, totalRevenue = 0, totalAds = 0, totalEcpm = 0;
      let todayActiveUsers = 0, monthActiveUsers = 0;

      memberIds.forEach(empId => {
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

      const todayActiveRate = memberIds.length > 0
        ? ((todayActiveUsers / memberIds.length) * 100).toFixed(1) + '%'
        : '0%';

      const monthlyActiveRate = memberIds.length > 0
        ? ((monthActiveUsers / memberIds.length) * 100).toFixed(1) + '%'
        : '0%';

      const level = totalRevenue >= 100000 ? 'S' : totalRevenue >= 50000 ? 'A' : totalRevenue >= 10000 ? 'B' : 'C';

      return {
        id: team._id,
        name: team.name,
        leader: team.leaderId || '',
        memberCount: memberIds.length,
        todayRevenue: parseFloat((todayRevenue / 1000).toFixed(2)),
        totalRevenue: parseFloat((totalRevenue / 1000).toFixed(2)),
        todayAds,
        monthlyAds,
        totalAds,
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

    const result = { success: true, data: teamsWithStats };
    setCache(cacheKey, result, listCache, LIST_CACHE_TTL);
    res.json(result);
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

    const cacheKey = `team_members_${teamId}_${mode}_${search || ''}`;
    const cached = getCache(cacheKey, memberDetailCache, MEMBER_CACHE_TTL);
    if (cached) {
      return res.json(cached);
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

    const memberUserIds = members.map(m => m.userId);
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(beijingNow);
    const monthStart = getBeijingStartOfMonth();

    const [todayGoldAgg, monthGoldAgg, totalGoldAgg] = await Promise.all([
      GoldLog.aggregate([
        { $match: { userId: { $in: memberUserIds }, createTime: { $gte: todayStart } } },
        { $group: { _id: '$userId', todayGold: { $sum: '$gold' }, todayCount: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { userId: { $in: memberUserIds }, createTime: { $gte: monthStart } } },
        { $group: { _id: '$userId', monthGold: { $sum: '$gold' }, monthCount: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { userId: { $in: memberUserIds } } },
        { $group: { _id: '$userId', totalGold: { $sum: '$gold' }, totalCount: { $sum: 1 } } }
      ])
    ]);

    const userStatsMap = {};
    todayGoldAgg.forEach(g => { userStatsMap[g._id] = { ...userStatsMap[g._id], todayGold: g.todayGold, todayCount: g.todayCount }; });
    monthGoldAgg.forEach(g => { userStatsMap[g._id] = { ...userStatsMap[g._id], monthGold: g.monthGold, monthCount: g.monthCount }; });
    totalGoldAgg.forEach(g => { userStatsMap[g._id] = { ...userStatsMap[g._id], totalGold: g.totalGold, totalCount: g.totalCount }; });

    const memberDetails = members.map(member => {
      const stats = userStatsMap[member.userId] || {};
      const todayWatched = stats.todayCount || 0;
      const monthlyWatched = stats.monthCount || 0;
      const totalWatched = stats.totalCount || 0;
      const todayEarnings = (stats.todayGold || 0) / 1000;
      const monthlyEarnings = (stats.monthGold || 0) / 1000;
      const totalEarnings = (stats.totalGold || 0) / 1000;

      return {
        userId: member.userId,
        name: member.name || member.userId,
        todayWatched,
        monthlyWatched,
        totalWatched,
        todayEarnings: parseFloat(todayEarnings.toFixed(2)),
        monthlyEarnings: parseFloat(monthlyEarnings.toFixed(2)),
        totalEarnings: parseFloat(totalEarnings.toFixed(2))
      };
    });

    const result = { success: true, data: memberDetails };
    setCache(cacheKey, result, memberDetailCache, MEMBER_CACHE_TTL);
    res.json(result);
  } catch (error) {
    console.error('获取团队成员详情错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;