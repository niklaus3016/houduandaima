const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(date) {
  const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  beijingDate.setUTCHours(0, 0, 0, 0);
  return new Date(beijingDate.getTime() - 8 * 60 * 60 * 1000);
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const beijingNow = getBeijingDate();
    console.log('北京时间:', beijingNow.toISOString());
    
    const todayStart = getBeijingStartOfDay(beijingNow);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    console.log('今日开始:', todayStart.toISOString());
    console.log('今日结束:', todayEnd.toISOString());
    
    // 查询8202的登录记录
    console.log('\n8202的登录记录:');
    const loginRecords = await LoginRecord.find({ userId: { $regex: '8202' } }).sort({ loginDate: -1 });
    loginRecords.forEach(r => {
      const beijingTime = new Date(r.loginDate.getTime() + 8 * 60 * 60 * 1000);
      console.log(`  ${r.userId} | ${beijingTime.toISOString()} | ${r.loginDate.toISOString()}`);
    });
    
    // 查询今日登录记录
    console.log('\n今日登录记录:');
    const todayLoginRecords = await LoginRecord.find({
      loginDate: { $gte: todayStart, $lt: todayEnd }
    });
    console.log('  今日登录记录数:', todayLoginRecords.length);
    todayLoginRecords.forEach(r => {
      const beijingTime = new Date(r.loginDate.getTime() + 8 * 60 * 60 * 1000);
      console.log(`  ${r.userId} | ${beijingTime.toISOString()}`);
    });
    
    // 查询8202的金币日志
    console.log('\n8202的金币日志:');
    const goldLogs = await GoldLog.find({ userId: { $regex: '8202' } }).sort({ createTime: -1 });
    goldLogs.forEach(log => {
      const beijingTime = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000);
      console.log(`  ${log.userId} | ${beijingTime.toISOString()} | gold: ${log.gold} | ecpm: ${log.ecpm}`);
    });
    
    // 查询今日金币日志
    console.log('\n今日金币日志:');
    const todayGoldLogs = await GoldLog.find({
      createTime: { $gte: todayStart, $lt: todayEnd }
    });
    console.log('  今日金币日志数:', todayGoldLogs.length);
    let todayRevenue = 0;
    let todayGold = 0;
    todayGoldLogs.forEach(log => {
      const beijingTime = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000);
      todayRevenue += (log.ecpm || 0) / 1000;
      todayGold += log.gold;
      console.log(`  ${log.userId} | ${beijingTime.toISOString()} | gold: ${log.gold} | ecpm: ${log.ecpm}`);
    });
    
    console.log('\n今日统计:');
    console.log('  今日业务总收入:', todayRevenue.toFixed(2));
    console.log('  今日金币总和:', todayGold);
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });