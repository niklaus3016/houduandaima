const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

const GoldLogSchema = new mongoose.Schema({
  userId: String,
  employeeId: String,
  deviceId: String,
  ecpm: Number,
  gold: Number,
  slotId: String,
  commissionRate: Number,
  createTime: Date
});

const UserGoldSchema = new mongoose.Schema({
  userId: String,
  employeeId: String,
  currentMonthGold: Number,
  lastMonthGold: Number,
  adCount: Number,
  totalGold: Number,
  totalEcpm: Number
});

async function analyzeEmployee(employeeId) {
  await mongoose.connect(MONGODB_URI);

  const GoldLog = mongoose.model('GoldLog', GoldLogSchema);
  const UserGold = mongoose.model('UserGold', UserGoldSchema);

  // 获取北京时间今日开始
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStart = new Date(beijingNow);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);

  console.log(`=== 员工 ${employeeId} 今日金币分析 ===`);
  console.log(`查询时间范围: ${todayStartUTC.toISOString()} (UTC)`);
  console.log('');

  // 1. 查询今日所有GoldLog
  const todayLogs = await GoldLog.find({
    employeeId: employeeId,
    createTime: { $gte: todayStartUTC }
  }).sort({ createTime: 1 });

  console.log(`📊 GoldLog 记录数: ${todayLogs.length}`);

  if (todayLogs.length > 0) {
    // 2. 统计总计
    const totalGold = todayLogs.reduce((sum, log) => sum + log.gold, 0);
    const totalEcpm = todayLogs.reduce((sum, log) => sum + log.ecpm, 0);
    const avgEcpm = totalEcpm / todayLogs.length;

    console.log(`💰 金币总计: ${totalGold}`);
    console.log(`📈 ECPM总计: ${totalEcpm}`);
    console.log(`📉 平均ECPM: ${avgEcpm.toFixed(2)}`);
    console.log('');

    // 3. 按用户分组统计
    const byUser = {};
    todayLogs.forEach(log => {
      if (!byUser[log.userId]) {
        byUser[log.userId] = { gold: 0, ecpm: 0, count: 0, devices: new Set() };
      }
      byUser[log.userId].gold += log.gold;
      byUser[log.userId].ecpm += log.ecpm;
      byUser[log.userId].count += 1;
      byUser[log.userId].devices.add(log.deviceId);
    });

    console.log(`👥 涉及用户数: ${Object.keys(byUser).length}`);

    // 4. 检查异常
    console.log('\n🔍 检查异常数据:');

    // 检查同一用户短时间内多次记录
    for (const userId of Object.keys(byUser)) {
      const userLogs = todayLogs.filter(l => l.userId === userId);

      // 检查是否有同一用户在同一设备、同一时间点的记录
      const timeMap = {};
      userLogs.forEach(log => {
        const timeKey = `${log.deviceId}_${Math.floor(log.createTime.getTime() / 1000 / 60)}`;
        if (!timeMap[timeKey]) {
          timeMap[timeKey] = [];
        }
        timeMap[timeKey].push(log);
      });

      for (const [key, logs] of Object.entries(timeMap)) {
        if (logs.length > 1) {
          console.log(`⚠️  同一用户 ${userId} 在同一分钟有多条记录: ${logs.length}条`);
          logs.forEach(l => {
            console.log(`   - 时间: ${l.createTime.toISOString()}, ecpm: ${l.ecpm}, gold: ${l.gold}, device: ${l.deviceId}`);
          });
        }
      }

      // 检查ECPM是否合理
      for (const log of userLogs) {
        if (log.ecpm < 0 || log.ecpm > 10000) {
          console.log(`⚠️  用户 ${userId} 存在异常的ECPM值: ${log.ecpm}`);
        }
        if (log.gold < 0) {
          console.log(`⚠️  用户 ${userId} 存在异常的金币值: ${log.gold}`);
        }
      }
    }

    // 5. 显示部分记录样本
    console.log('\n📋 最近10条记录:');
    todayLogs.slice(-10).forEach((log, i) => {
      console.log(`   ${i+1}. 时间: ${log.createTime.toISOString()}, userId: ${log.userId}, ecpm: ${log.ecpm}, gold: ${log.gold}, device: ${log.deviceId}`);
    });

    // 6. 按小时统计
    console.log('\n⏰ 按小时统计:');
    const hourlyStats = {};
    todayLogs.forEach(log => {
      const hour = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000).getHours();
      if (!hourlyStats[hour]) {
        hourlyStats[hour] = { gold: 0, count: 0 };
      }
      hourlyStats[hour].gold += log.gold;
      hourlyStats[hour].count += 1;
    });

    for (let h = 0; h < 24; h++) {
      if (hourlyStats[h]) {
        console.log(`   ${h.toString().padStart(2, '0')}:00 - ${hourlyStats[h].count}次, ${hourlyStats[h].gold}金币`);
      }
    }

  } else {
    console.log('今日无金币记录');
  }

  // 7. 查询UserGold表
  console.log('\n👤 UserGold 当前状态:');
  const userGold = await UserGold.findOne({ employeeId: employeeId });
  if (userGold) {
    console.log(`   currentMonthGold: ${userGold.currentMonthGold}`);
    console.log(`   lastMonthGold: ${userGold.lastMonthGold}`);
    console.log(`   adCount: ${userGold.adCount}`);
    console.log(`   totalGold: ${userGold.totalGold}`);
    console.log(`   totalEcpm: ${userGold.totalEcpm}`);
  } else {
    console.log('   无记录');
  }

  await mongoose.disconnect();
}

analyzeEmployee('7936').catch(console.error);