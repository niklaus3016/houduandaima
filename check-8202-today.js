const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 检查8202今日金币记录 ===');
  
  // 获取当前时间
  const now = new Date();
  console.log('当前UTC时间:', now);
  
  // 获取今日开始时间（UTC）
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  console.log('今日开始时间(UTC):', today);
  
  // 获取北京时间今日开始
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayBeijing = new Date(beijingNow);
  todayBeijing.setHours(0, 0, 0, 0);
  const todayStartBeijing = new Date(todayBeijing.getTime() - 8 * 60 * 60 * 1000);
  console.log('北京时间今日开始:', todayStartBeijing);
  
  // 查询今日记录（UTC）
  const logsUTC = await GoldLog.find({
    employeeId: '8202',
    createTime: { $gte: today }
  }).sort({ createTime: -1 });
  
  console.log('\n今日记录数(UTC):', logsUTC.length);
  console.log('今日金币(UTC):', logsUTC.reduce((sum, log) => sum + log.gold, 0));
  
  // 查询今日记录（北京时间）
  const logsBeijing = await GoldLog.find({
    employeeId: '8202',
    createTime: { $gte: todayStartBeijing }
  }).sort({ createTime: -1 });
  
  console.log('\n今日记录数(北京时间):', logsBeijing.length);
  console.log('今日金币(北京时间):', logsBeijing.reduce((sum, log) => sum + log.gold, 0));
  
  // 显示最近5条记录
  console.log('\n最近5条记录:');
  const recentLogs = await GoldLog.find({ employeeId: '8202' })
    .sort({ createTime: -1 })
    .limit(5);
  
  for (const log of recentLogs) {
    console.log(`- ${log.createTime.toISOString()}: ${log.gold}金币`);
  }
  
  mongoose.disconnect();
});
