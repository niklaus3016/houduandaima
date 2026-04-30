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
}, { collection: 'goldlogs' });

async function checkCommissionRate(employeeId) {
  await mongoose.connect(MONGODB_URI);

  const GoldLog = mongoose.model('GoldLog', GoldLogSchema);

  // 获取北京时间今日0点
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStart = new Date(beijingNow);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);

  const logs = await GoldLog.find({
    employeeId: employeeId,
    createTime: { $gte: todayStartUTC }
  }).sort({ createTime: 1 });

  console.log(`=== ${employeeId} 今日数据异常检查 ===\n`);
  console.log(`总记录数: ${logs.length}\n`);

  // 1. 检查 gold/ecpm 比例异常的记录
  console.log('=== 1. gold/ecpm 比例异常记录 ===');
  console.log('(正常比例应该约等于commissionRate，约0.1-0.5)\n');

  const abnormalRecords = logs.filter(log => {
    if (log.ecpm === 0) return true;
    const ratio = log.gold / log.ecpm;
    return ratio < 0.05 || ratio > 0.6;
  });

  if (abnormalRecords.length > 0) {
    console.log(`发现 ${abnormalRecords.length} 条异常记录:`);
    abnormalRecords.forEach(log => {
      const ratio = log.ecpm > 0 ? log.gold / log.ecpm : 'Infinity';
      console.log(`  ${log.createTime.toISOString()} ecpm=${log.ecpm} gold=${log.gold} ratio=${ratio}`);
    });
  } else {
    console.log('未发现异常记录');
  }

  // 2. 检查ecpm=0的记录
  console.log('\n=== 2. ecpm为0的记录 ===');
  const zeroEcpmLogs = logs.filter(log => log.ecpm === 0);
  console.log(`ecpm=0 的记录数: ${zeroEcpmLogs.length}`);
  if (zeroEcpmLogs.length > 0) {
    zeroEcpmLogs.forEach(log => {
      console.log(`  ${log.createTime.toISOString()} gold=${log.gold}`);
    });
  }

  // 3. 检查gold异常大的记录
  console.log('\n=== 3. gold异常大的记录 (>1000) ===');
  const largeGoldLogs = logs.filter(log => log.gold > 1000);
  console.log(`gold>1000 的记录数: ${largeGoldLogs.length}`);
  if (largeGoldLogs.length > 0) {
    largeGoldLogs.forEach(log => {
      console.log(`  ${log.createTime.toISOString()} ecpm=${log.ecpm} gold=${log.gold}`);
    });
  }

  // 4. 检查commissionRate分布
  console.log('\n=== 4. commissionRate 分布 ===');
  const rateCount = {};
  logs.forEach(log => {
    const rate = log.commissionRate !== undefined ? log.commissionRate : 'undefined';
    rateCount[rate] = (rateCount[rate] || 0) + 1;
  });
  for (const [rate, count] of Object.entries(rateCount)) {
    console.log(`  ${rate}: ${count}条`);
  }

  // 5. 整体统计
  console.log('\n=== 5. 整体统计 ===');
  const totalGold = logs.reduce((sum, l) => sum + l.gold, 0);
  const totalEcpm = logs.reduce((sum, l) => sum + l.ecpm, 0);
  console.log(`总gold: ${totalGold.toFixed(2)}`);
  console.log(`总ecpm: ${totalEcpm.toFixed(2)}`);
  if (totalEcpm > 0) {
    console.log(`整体比例: ${(totalGold/totalEcpm).toFixed(4)}`);
  }

  await mongoose.disconnect();
}

const employeeId = process.argv[2] || '7936';
checkCommissionRate(employeeId).catch(console.error);