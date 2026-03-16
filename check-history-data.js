const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 检查昨日和上月数据 ===');
  
  // 计算时间范围
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  // 今日开始
  const todayStart = new Date(beijingNow);
  todayStart.setHours(0, 0, 0, 0);
  
  // 昨日开始和结束
  const yesterdayStart = new Date(beijingNow);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
  
  // 上月开始和结束
  const lastMonthStart = new Date(beijingNow);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  lastMonthStart.setDate(1);
  lastMonthStart.setHours(0, 0, 0, 0);
  
  const lastMonthEnd = new Date(beijingNow);
  lastMonthEnd.setDate(0);
  lastMonthEnd.setHours(23, 59, 59, 999);
  
  console.log('时间范围:');
  console.log('今日开始:', todayStart.toISOString());
  console.log('昨日开始:', yesterdayStart.toISOString());
  console.log('昨日结束:', yesterdayEnd.toISOString());
  console.log('上月开始:', lastMonthStart.toISOString());
  console.log('上月结束:', lastMonthEnd.toISOString());
  
  // 检查昨日数据
  const yesterdayCount = await GoldLog.countDocuments({
    createTime: { $gte: yesterdayStart, $lt: yesterdayEnd }
  });
  console.log('\n昨日记录数:', yesterdayCount);
  
  // 检查上月数据
  const lastMonthCount = await GoldLog.countDocuments({
    createTime: { $gte: lastMonthStart, $lte: lastMonthEnd }
  });
  console.log('上月记录数:', lastMonthCount);
  
  // 查看一些示例数据
  if (yesterdayCount > 0) {
    const yesterdayLogs = await GoldLog.find({
      createTime: { $gte: yesterdayStart, $lt: yesterdayEnd }
    }).limit(5);
    console.log('\n昨日示例数据:');
    yesterdayLogs.forEach(log => {
      console.log(`  ${log.createTime.toISOString()} - ECPM: ${log.ecpm} - 金币: ${log.gold}`);
    });
  }
  
  mongoose.disconnect();
});