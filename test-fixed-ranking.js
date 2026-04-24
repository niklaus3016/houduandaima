const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  // 使用修复后的时间计算
  function getBeijingDate(date = new Date()) {
    return new Date(date.getTime() + 8 * 60 * 60 * 1000);
  }

  function getBeijingStartOfDay(beijingTime) {
    const year = beijingTime.getUTCFullYear();
    const month = beijingTime.getUTCMonth();
    const day = beijingTime.getUTCDate();
    return new Date(Date.UTC(year, month, day, 0, 0, 0) - 8 * 60 * 60 * 1000);
  }

  const now = new Date();
  const beijingNow = getBeijingDate();
  const todayStart = getBeijingStartOfDay(beijingNow);

  console.log('当前UTC时间:', now.toISOString());
  console.log('计算的北京时间:', beijingNow.toISOString());
  console.log('计算的今日开始UTC时间:', todayStart.toISOString());

  // 用修复后的时间查询
  const todayLogs = await GoldLog.find({ createTime: { $gte: todayStart } });
  console.log('\n今日(4月20日)的记录数:', todayLogs.length);

  // 按员工统计
  const employeeStats = {};
  todayLogs.forEach(log => {
    if (!employeeStats[log.employeeId]) {
      employeeStats[log.employeeId] = { totalGold: 0, count: 0 };
    }
    employeeStats[log.employeeId].totalGold += log.gold;
    employeeStats[log.employeeId].count++;
  });

  const ranking = Object.entries(employeeStats)
    .map(([employeeId, stat]) => ({
      employeeId,
      earnings: parseFloat((stat.totalGold / 1000).toFixed(3)),
      count: stat.count,
      avgGold: stat.count > 0 ? parseFloat((stat.totalGold / stat.count).toFixed(2)) : 0
    }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 10);

  console.log('\n今日排行榜前10:');
  ranking.forEach((r, i) => {
    console.log(`${i+1}. 员工${r.employeeId}: 收益${r.earnings}元, ${r.count}条, 平均${r.avgGold}金币`);
  });

  mongoose.connection.close();
}).catch(err => console.error(err));