const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/ad-monetization');

  const GoldLog = mongoose.connection.collection('goldlogs');

  // 查询今日的金币记录
  const todayStartUTC = new Date('2026-04-23T16:00:00.000Z');
  const nowUTC = new Date('2026-04-24T16:00:00.000Z');

  console.log('查询时间范围:');
  console.log('开始(UTC):', todayStartUTC.toISOString());
  console.log('结束(UTC):', nowUTC.toISOString());

  // 查询今日的金币记录
  const logs = await GoldLog.find({
    createTime: { $gte: todayStartUTC, $lt: nowUTC }
  }).limit(10).toArray();

  console.log('\nGoldLog记录示例:');
  logs.forEach(log => {
    console.log({
      employeeId: log.employeeId,
      gold: log.gold,
      earnings: log.earnings,
      commissionRate: log.commissionRate,
      createTime: log.createTime
    });
  });

  // 统计今日总金币和总收益
  let totalGold = 0;
  let totalEarnings = 0;
  let commissionRateSum = 0;
  let commissionRateCount = 0;

  logs.forEach(log => {
    totalGold += log.gold || 0;
    totalEarnings += log.earnings || (log.gold / 1000);
    if (log.commissionRate !== undefined && log.commissionRate !== null) {
      commissionRateSum += log.commissionRate;
      commissionRateCount++;
    }
  });

  console.log('\n今日统计（所有记录）:');
  console.log('总金币:', totalGold);
  console.log('总收益:', totalEarnings);
  console.log('平均commissionRate:', commissionRateCount > 0 ? (commissionRateSum / commissionRateCount) : 'N/A');

  await mongoose.disconnect();
}

main();
