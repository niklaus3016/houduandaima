const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkTodayStats() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 获取今天的开始和结束时间（北京时间）
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    beijingTime.setUTCHours(0, 0, 0, 0);
    const todayStart = new Date(beijingTime.getTime() - 8 * 60 * 60 * 1000);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    console.log('查询时间范围（UTC）:', todayStart, '至', todayEnd);

    // 查询今日所有金币记录
    const todayLogs = await GoldLog.find({
      createTime: { $gte: todayStart, $lt: todayEnd }
    });

    const totalImpressions = todayLogs.length;
    const totalClicks = Math.floor(totalImpressions * 0.15);
    const totalEcpm = todayLogs.reduce((sum, log) => sum + (log.ecpm || 0), 0);
    const totalGold = todayLogs.reduce((sum, log) => sum + log.gold, 0);

    console.log('\n=== 今日统计数据 ===');
    console.log(`总曝光数: ${totalImpressions}`);
    console.log(`总点击数: ${totalClicks} (模拟值: 曝光×15%)`);
    console.log(`总ECPM: ${totalEcpm}`);
    console.log(`总金币: ${totalGold}`);
    console.log(`平均ECPM: ${totalImpressions > 0 ? (totalEcpm / totalImpressions).toFixed(2) : 0}`);

    // 按用户分组统计
    const userStats = {};
    todayLogs.forEach(log => {
      if (!userStats[log.employeeId]) {
        userStats[log.employeeId] = { count: 0, ecpm: 0, gold: 0 };
      }
      userStats[log.employeeId].count++;
      userStats[log.employeeId].ecpm += log.ecpm || 0;
      userStats[log.employeeId].gold += log.gold;
    });

    console.log('\n=== 各用户今日数据 ===');
    Object.keys(userStats).forEach(userId => {
      console.log(`用户${userId}: 曝光${userStats[userId].count}次, ECPM: ${userStats[userId].ecpm}, 金币: ${userStats[userId].gold}`);
    });

    await mongoose.disconnect();
    console.log('\n完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

checkTodayStats();
