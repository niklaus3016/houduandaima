const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 查询近三天ECPM > 1000的记录 ===');
  
  // 计算三天前的时间（北京时间）
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  const threeDaysAgoBeijing = new Date(beijingNow);
  threeDaysAgoBeijing.setDate(threeDaysAgoBeijing.getDate() - 3);
  threeDaysAgoBeijing.setHours(0, 0, 0, 0);
  const threeDaysAgo = new Date(threeDaysAgoBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  console.log('查询时间范围:', threeDaysAgo.toISOString(), '至', now.toISOString());
  
  // 查询ECPM > 1000的记录
  const logs = await GoldLog.find({
    ecpm: { $gt: 1000 },
    createTime: { $gte: threeDaysAgo }
  }).sort({ ecpm: -1, createTime: -1 });
  
  console.log(`\n找到 ${logs.length} 条ECPM > 1000的记录\n`);
  
  // 按用户分组统计
  const userStats = {};
  for (const log of logs) {
    if (!userStats[log.employeeId]) {
      userStats[log.employeeId] = {
        count: 0,
        totalGold: 0,
        maxEcpm: 0,
        records: []
      };
    }
    userStats[log.employeeId].count++;
    userStats[log.employeeId].totalGold += log.gold;
    if (log.ecpm > userStats[log.employeeId].maxEcpm) {
      userStats[log.employeeId].maxEcpm = log.ecpm;
    }
    userStats[log.employeeId].records.push({
      time: log.createTime,
      ecpm: log.ecpm,
      gold: log.gold,
      slotId: log.slotId
    });
  }
  
  // 显示用户统计
  console.log('=== 按用户统计 ===');
  for (const [employeeId, stats] of Object.entries(userStats)) {
    console.log(`\n用户 ${employeeId}:`);
    console.log(`  记录数: ${stats.count}`);
    console.log(`  总金币: ${stats.totalGold.toFixed(2)}`);
    console.log(`  最高ECPM: ${stats.maxEcpm}`);
    console.log(`  记录详情:`);
    for (const record of stats.records) {
      console.log(`    ${record.time.toISOString()} - 广告位:${record.slotId} - ECPM:${record.ecpm} - 金币:${record.gold.toFixed(2)}`);
    }
  }
  
  // 显示全局统计
  const totalGold = logs.reduce((sum, log) => sum + log.gold, 0);
  const maxEcpm = Math.max(...logs.map(log => log.ecpm));
  const avgEcpm = logs.reduce((sum, log) => sum + log.ecpm, 0) / logs.length;
  
  console.log('\n=== 全局统计 ===');
  console.log(`总记录数: ${logs.length}`);
  console.log(`总金币: ${totalGold.toFixed(2)}`);
  console.log(`最高ECPM: ${maxEcpm}`);
  console.log(`平均ECPM: ${avgEcpm.toFixed(2)}`);
  
  mongoose.disconnect();
});