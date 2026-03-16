const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 检查低绩效用户 ===');
  
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
  
  console.log('时间范围:');
  console.log('昨日开始:', yesterdayStartUTC.toISOString());
  console.log('今日开始:', todayStartUTC.toISOString());
  
  // 获取所有用户
  const users = await UserGold.find({});
  console.log(`\n总用户数: ${users.length}`);
  
  // 获取昨天的金币日志
  const goldLogs = await GoldLog.find({
    createTime: { $gte: yesterdayStartUTC, $lt: todayStartUTC }
  });
  console.log('昨日金币记录数:', goldLogs.length);
  
  // 按用户分组统计
  const userStats = {};
  goldLogs.forEach(log => {
    const employeeId = log.employeeId;
    if (!userStats[employeeId]) {
      userStats[employeeId] = {
        watched: 0,
        earnings: 0,
        ecpmTotal: 0
      };
    }
    userStats[employeeId].watched += 1;
    userStats[employeeId].earnings += log.gold / 1000;
    userStats[employeeId].ecpmTotal += log.ecpm || 0;
  });
  
  // 生成低绩效用户列表
  const lowPerfUsers = [];
  users.forEach(user => {
    const stats = userStats[user.employeeId] || { watched: 0, earnings: 0, ecpmTotal: 0 };
    const ecpm = stats.watched > 0 ? stats.ecpmTotal / stats.watched : 0;
    
    // 低绩效判断：观看次数 < 50 或 收益 < 5 元
    if (stats.watched < 50 || stats.earnings < 5) {
      let reason = '';
      if (stats.watched < 50 && stats.earnings < 5) {
        reason = '次数及收益双低';
      } else if (stats.watched < 50) {
        reason = '观看次数低';
      } else {
        reason = '收益低';
      }
      
      lowPerfUsers.push({
        id: user.employeeId,
        yesterdayWatched: stats.watched,
        yesterdayEarnings: parseFloat(stats.earnings.toFixed(1)),
        ecpm: parseFloat(ecpm.toFixed(1)),
        reason: reason
      });
    }
  });
  
  console.log(`\n低绩效用户数: ${lowPerfUsers.length}`);
  
  if (lowPerfUsers.length > 0) {
    console.log('\n低绩效用户列表:');
    lowPerfUsers.forEach(user => {
      console.log(`\n用户ID: ${user.id}`);
      console.log(`昨日观看: ${user.yesterdayWatched} 次`);
      console.log(`昨日收益: ${user.yesterdayEarnings} 元`);
      console.log(`ECPM: ${user.ecpm}`);
      console.log(`原因: ${user.reason}`);
    });
  } else {
    console.log('没有低绩效用户');
  }
  
  mongoose.disconnect();
});