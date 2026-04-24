const mongoose = require('mongoose');

function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB连接成功');

  const GoldLog = mongoose.connection.collection('goldlogs');

  const beijingNow = getBeijingDate();
  const todayStartBeijing = new Date(beijingNow);
  todayStartBeijing.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const endDate = new Date();

  console.log('当前时间:', new Date().toISOString());
  console.log('北京时间:', beijingNow.toISOString());
  console.log('startDate:', startDate.toISOString());
  console.log('endDate:', endDate.toISOString());
  console.log('查询条件: createTime >=', startDate, 'AND createTime <', endDate);

  const todayGoldLogs = await GoldLog.find({
    createTime: { $gte: startDate, $lt: endDate }
  }).toArray();

  console.log('\n符合查询条件的记录数:', todayGoldLogs.length);

  const employeeStats = {};
  todayGoldLogs.forEach(log => {
    if (!employeeStats[log.employeeId]) {
      employeeStats[log.employeeId] = {
        employeeId: log.employeeId,
        totalGold: 0,
        count: 0
      };
    }
    employeeStats[log.employeeId].totalGold += log.gold;
    employeeStats[log.employeeId].count += 1;
  });

  const ranking = Object.values(employeeStats)
    .map(stat => ({
      employeeId: stat.employeeId,
      earnings: parseFloat((stat.totalGold / 1000).toFixed(3)),
      count: stat.count,
      avgGold: stat.count > 0 ? parseFloat((stat.totalGold / stat.count).toFixed(2)) : 0
    }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 10);

  console.log('\n排行榜数据:');
  ranking.forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: count=${r.count}, earnings=${r.earnings}`);
  });

  // 查找3769和7703
  const emp3769 = ranking.find(r => r.employeeId === '3769');
  const emp7703 = ranking.find(r => r.employeeId === '7703');
  console.log('\n3769 count:', emp3769?.count);
  console.log('7703 count:', emp7703?.count);

  await mongoose.disconnect();
}

main().catch(console.error);