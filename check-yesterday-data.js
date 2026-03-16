const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 检查昨天的数据 ===');
  
  // 计算昨天的日期（北京时间）
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  const year = beijingNow.getUTCFullYear();
  const month = beijingNow.getUTCMonth();
  const day = beijingNow.getUTCDate();
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const todayStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  
  const yesterday = new Date(todayStartUTC);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStartUTC = new Date(yesterday);
  
  console.log('当前北京时间:', beijingNow.toISOString());
  console.log('昨日开始:', yesterdayStartUTC.toISOString());
  console.log('今日开始:', todayStartUTC.toISOString());
  
  // 获取昨天的金币日志
  const goldLogs = await GoldLog.find({
    createTime: { $gte: yesterdayStartUTC, $lt: todayStartUTC }
  }).sort({ createTime: -1 }).limit(10);
  
  console.log('\n昨天的金币记录（前10条）:');
  goldLogs.forEach(log => {
    console.log(`  ${log.createTime.toISOString()} - 用户: ${log.employeeId} - 金币: ${log.gold}`);
  });
  
  mongoose.disconnect();
});