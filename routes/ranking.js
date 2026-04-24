const express = require('express');
const router = express.Router();
const GoldLog = require('../models/GoldLog');

const cache = new Map();
const CACHE_TTL = 60 * 1000; // 60秒

function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function getFromCache(key) {
  const item = cache.get(key);
  if (item && Date.now() < item.expiry) {
    return item.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, {
    data,
    expiry: Date.now() + CACHE_TTL
  });
}

function getBeijingStartOfDay(beijingTime) {
  // beijingTime已经是加上8小时后的时间
  // 要获取北京时间的0点，需要将beijingTime的时分秒设为0，然后转换为UTC时间
  const startOfDay = new Date(beijingTime);
  startOfDay.setHours(0, 0, 0, 0);
  // 转换为UTC时间（减去8小时）
  return new Date(startOfDay.getTime() - 8 * 60 * 60 * 1000);
}

function getBeijingEndOfDay(beijingTime) {
  // beijingTime已经是加上8小时后的时间
  // 要获取北京时间的23:59:59，需要将beijingTime的时分秒设为23:59:59，然后转换为UTC时间
  const endOfDay = new Date(beijingTime);
  endOfDay.setHours(23, 59, 59, 999);
  // 转换为UTC时间（减去8小时）
  return new Date(endOfDay.getTime() - 8 * 60 * 60 * 1000);
}

function getBeijingStartOfMonth(beijingTime) {
  // beijingTime已经是加上8小时后的时间
  const startOfMonth = new Date(beijingTime);
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  // 转换为UTC时间（减去8小时）
  return new Date(startOfMonth.getTime() - 8 * 60 * 60 * 1000);
}

function getYesterdayStart(beijingTime) {
  const todayStart = getBeijingStartOfDay(beijingTime);
  return new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
}

router.get('/today-ranking', async (req, res) => {
  try {
    const cached = getFromCache('today-ranking');
    if (cached) {
      return res.json(cached);
    }

    const beijingNow = getBeijingDate();
    const todayStartBeijing = new Date(beijingNow);
    todayStartBeijing.setUTCHours(0, 0, 0, 0);
    const startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    const endDate = new Date();

    const aggregation = await GoldLog.aggregate([
      {
        $match: {
          createTime: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: '$employeeId',
          totalGold: { $sum: '$gold' },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          employeeId: '$_id',
          totalGold: 1,
          count: 1,
          earnings: { $divide: ['$totalGold', 1000] },
          avgGold: { $divide: ['$totalGold', '$count'] }
        }
      },
      { $sort: { earnings: -1 } },
      { $limit: 10 }
    ]);

    const ranking = aggregation.map(stat => ({
      employeeId: stat.employeeId,
      earnings: parseFloat(stat.earnings.toFixed(3)),
      count: stat.count,
      avgGold: parseFloat(stat.avgGold.toFixed(2))
    }));

    const result = {
      success: true,
      data: { ranking }
    };

    setCache('today-ranking', result);
    res.json(result);
  } catch (error) {
    console.error('获取今日收益排行错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/month-top-daily', async (req, res) => {
  try {
    const cached = getFromCache('month-top-daily');
    if (cached) {
      return res.json(cached);
    }

    const beijingNow = getBeijingDate();
    const monthStart = getBeijingStartOfMonth(beijingNow);
    const endDate = new Date();

    const aggregation = await GoldLog.aggregate([
      {
        $match: {
          createTime: { $gte: monthStart, $lt: endDate }
        }
      },
      {
        $addFields: {
          beijingTime: { $add: ['$createTime', 8 * 60 * 60 * 1000] }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: '%Y-%m-%d', date: '$beijingTime' }
            },
            employeeId: '$employeeId'
          },
          totalGold: { $sum: '$gold' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          employees: {
            $push: {
              employeeId: '$_id.employeeId',
              totalGold: '$totalGold',
              count: '$count'
            }
          }
        }
      },
      {
        $unwind: '$employees'
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          employeeId: '$employees.employeeId',
          totalGold: '$employees.totalGold',
          count: '$employees.count',
          earnings: { $divide: ['$employees.totalGold', 1000] }
        }
      },
      { $sort: { earnings: -1 } },
      { $limit: 1 }
    ]);

    let topDaily = null;
    if (aggregation.length > 0) {
      const top = aggregation[0];
      topDaily = {
        date: top.date,
        employeeId: top.employeeId,
        earnings: parseFloat(top.earnings.toFixed(3)),
        count: top.count,
        avgGold: parseFloat((top.totalGold / top.count).toFixed(2))
      };
    }

    const result = {
      success: true,
      data: { topDaily }
    };

    setCache('month-top-daily', result);
    res.json(result);
  } catch (error) {
    console.error('获取本月单日最高收益错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;