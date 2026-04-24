const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  function getBeijingDate(date = new Date()) {
    return new Date(date.getTime() + 8 * 60 * 60 * 1000);
  }

  // 直接计算4月20日0点的UTC时间
  const april20Start = new Date('2026-04-20T00:00:00+08:00');
  const april20StartUTC = new Date(april20Start.getTime() - 8 * 60 * 60 * 1000);
  
  console.log('4月20日0点北京时间:', april20Start.toISOString());
  console.log('4月20日0点UTC时间:', april20StartUTC.toISOString());

  // 查询4月20日的记录
  const april20Logs = await GoldLog.find({ createTime: { $gte: april20StartUTC } });
  console.log('\n4月20日记录数:', april20Logs.length);

  if (april20Logs.length > 0) {
    const firstLog = april20Logs[0];
    const lastLog = april20Logs[april20Logs.length - 1];
    console.log('第一条记录时间:', getBeijingDate(firstLog.createTime).toISOString());
    console.log('最后一条记录时间:', getBeijingDate(lastLog.createTime).toISOString());
  }

  // 统计4月20日的收益
  const employeeStats = {};
  april20Logs.forEach(log => {
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

  console.log('\n4月20日排行榜前10:');
  ranking.forEach((r, i) => {
    console.log(`${i+1}. 员工${r.employeeId}: 收益${r.earnings}元, ${r.count}条, 平均${r.avgGold}金币`);
  });

  mongoose.connection.close();
}).catch(err => console.error(err));