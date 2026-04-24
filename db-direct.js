const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/ad-monetization');

  const GoldLog = mongoose.connection.collection('goldlogs');

  // 当前北京时间：2026-04-20
  // 北京时间 = UTC + 8小时
  // 开始：2026-04-20 00:00:00 北京时间 = 2026-04-19 16:00:00 UTC
  // 结束：2026-04-20 17:xx UTC (当前时间)

  const todayStartUTC = new Date('2026-04-19T16:00:00.000Z');
  const nowUTC = new Date();

  console.log('查询时间范围:');
  console.log('开始(UTC):', todayStartUTC.toISOString());
  console.log('结束(UTC):', nowUTC.toISOString());
  console.log('即北京时间:', new Date(nowUTC.getTime() + 8*60*60*1000).toISOString());

  // 直接查询数据库
  const logs = await GoldLog.find({
    createTime: { $gte: todayStartUTC, $lt: nowUTC }
  }).toArray();

  console.log('\n数据库中符合条件的记录总数:', logs.length);

  // 按employeeId统计
  const empStats = {};
  logs.forEach(log => {
    if (!empStats[log.employeeId]) {
      empStats[log.employeeId] = { count: 0, gold: 0 };
    }
    empStats[log.employeeId].count += 1;
    empStats[log.employeeId].gold += log.gold;
  });

  // 按count排序
  const ranking = Object.entries(empStats)
    .map(([eid, s]) => ({ employeeId: eid, count: s.count, gold: s.gold }))
    .sort((a, b) => b.count - a.count);

  console.log('\n数据库查询 - 按employeeId统计 (前10):');
  ranking.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: count=${r.count}, gold=${r.gold}`);
  });

  // 查找3769和7703
  const emp3769 = empStats['3769'];
  const emp7703 = empStats['7703'];
  console.log('\n3769记录数:', emp3769?.count || 0);
  console.log('7703记录数:', emp7703?.count || 0);

  await mongoose.disconnect();
}

main().catch(console.error);