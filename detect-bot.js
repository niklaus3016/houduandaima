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

async function detectBotBehavior(employeeId) {
  await mongoose.connect(MONGODB_URI);

  const GoldLog = mongoose.model('GoldLog', GoldLogSchema);

  // 获取北京时间今日开始
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStart = new Date(beijingNow);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);

  console.log(`=== 检测 ${employeeId} 是否有脚本行为 ===\n`);

  // 查询今日所有记录
  const logs = await GoldLog.find({
    employeeId: employeeId,
    createTime: { $gte: todayStartUTC }
  }).sort({ createTime: 1 });

  console.log(`总记录数: ${logs.length}\n`);

  // 1. 分析时间间隔规律性
  console.log('=== 1. 时间间隔分析 ===');
  const intervals = [];
  for (let i = 1; i < logs.length; i++) {
    const diff = (logs[i].createTime - logs[i-1].createTime) / 1000; // 秒
    intervals.push(diff);
  }

  if (intervals.length > 0) {
    const validIntervals = intervals.filter(i => i > 0 && i < 300); // 0-5分钟内的间隔
    const avgInterval = validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length;
    const minInterval = Math.min(...validIntervals);
    const maxInterval = Math.max(...validIntervals);

    // 计算标准差
    const variance = validIntervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / validIntervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = (stdDev / avgInterval * 100).toFixed(2);

    console.log(`平均间隔: ${avgInterval.toFixed(1)}秒 (${(avgInterval/60).toFixed(1)}分钟)`);
    console.log(`最短间隔: ${minInterval.toFixed(1)}秒`);
    console.log(`最长间隔: ${maxInterval.toFixed(1)}秒 (${(maxInterval/60).toFixed(1)}分钟)`);
    console.log(`标准差: ${stdDev.toFixed(1)}秒`);
    console.log(`变异系数: ${coefficientOfVariation}%`);

    if (stdDev < 5) {
      console.log('🚨 间隔极其规律！标准差<5秒，强烈怀疑脚本！');
    } else if (stdDev < 15) {
      console.log('⚠️ 间隔比较规律，标准差<15秒，可能有脚本嫌疑');
    } else {
      console.log('✅ 间隔无明显规律，看起来像真人操作');
    }
  }

  // 2. 分析设备切换频率
  console.log('\n=== 2. 设备切换分析 ===');
  const deviceUsage = {};
  logs.forEach(log => {
    if (!deviceUsage[log.deviceId]) {
      deviceUsage[log.deviceId] = { count: 0, firstTime: log.createTime, lastTime: log.createTime };
    }
    deviceUsage[log.deviceId].count++;
    deviceUsage[log.deviceId].lastTime = log.createTime;
  });

  const deviceCount = Object.keys(deviceUsage).length;
  console.log(`使用的设备数: ${deviceCount}`);

  if (deviceCount > 10) {
    console.log('🚨 设备数过多！可能有问题');
  } else if (deviceCount > 5) {
    console.log('⚠️ 设备数偏多，注意观察');
  }

  console.log('\n各设备使用情况:');
  for (const [device, info] of Object.entries(deviceUsage)) {
    const shortDevice = device.substring(0, 40) + '...';
    console.log(`  ${shortDevice}`);
    console.log(`    次数: ${info.count}, 首条: ${info.firstTime.toISOString().substring(11,19)}, 末条: ${info.lastTime.toISOString().substring(11,19)}`);
  }

  // 3. 分析时间段分布
  console.log('\n=== 3. 时间段分布（北京时间）===');
  const hourlyCount = Array(24).fill(0);
  const hourlyGold = Array(24).fill(0);

  logs.forEach(log => {
    const hour = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000).getHours();
    hourlyCount[hour]++;
    hourlyGold[hour] += log.gold;
  });

  const activeHours = hourlyCount.filter(c => c > 0).length;
  const nonZeroHours = hourlyCount.map((count, hour) => ({ hour, count })).filter(h => h.count > 0);

  console.log(`活跃小时数: ${activeHours}/24`);

  // 检查是否集中在深夜
  const lateNightHours = [0,1,2,3,4,5];
  const lateNightCount = lateNightHours.reduce((sum, h) => sum + hourlyCount[h], 0);
  const lateNightRatio = (lateNightCount / logs.length * 100).toFixed(1);
  console.log(`凌晨0-5点占比: ${lateNightRatio}%`);

  if (lateNightRatio > 50) {
    console.log('🚨 超过50%的记录在凌晨0-5点！强烈怀疑脚本');
  } else if (lateNightRatio > 30) {
    console.log('⚠️ 凌晨时段占比偏高');
  }

  // 4. 分析ECPM分布
  console.log('\n=== 4. ECPM分布分析 ===');
  const ecpmValues = logs.map(l => l.ecpm);
  const avgEcpm = ecpmValues.reduce((a, b) => a + b, 0) / ecpmValues.length;
  const uniqueEcpmCount = new Set(ecpmValues.map(v => Math.round(v))).size;

  console.log(`平均ECPM: ${avgEcpm.toFixed(2)}`);
  console.log(`ECPM种类数: ${uniqueEcpmCount} (共${logs.length}条记录)`);

  if (uniqueEcpmCount < 10 && logs.length > 100) {
    console.log('🚨 ECPM种类极少！可能是固定值刷单');
  }

  // 5. 分析请求密度
  console.log('\n=== 5. 请求密度分析 ===');
  const hoursWithData = hourlyCount.filter(c => c > 0);
  if (hoursWithData.length > 0) {
    const maxRequestsPerHour = Math.max(...hoursWithData);
    const totalHours = hoursWithData.length;
    const avgRequestsPerActiveHour = logs.length / totalHours;

    console.log(`高峰小时请求数: ${maxRequestsPerHour}`);
    console.log(`活跃小时平均请求数: ${avgRequestsPerActiveHour.toFixed(1)}`);

    if (maxRequestsPerHour > 200) {
      console.log('🚨 单小时请求超过200次！异常');
    }
    if (avgRequestsPerActiveHour > 100) {
      console.log('⚠️ 活跃小时平均请求超过100次，偏高');
    }
  }

  // 6. 计算伪造概率评分
  console.log('\n=== 6. 综合评估 ===');
  let riskScore = 0;

  const calculatedStdDev = intervals.length > 0 ? stdDev : 999;

  if (calculatedStdDev < 5) riskScore += 30;
  else if (calculatedStdDev < 15) riskScore += 15;

  if (lateNightRatio > 50) riskScore += 25;
  else if (lateNightRatio > 30) riskScore += 10;

  if (deviceCount > 10) riskScore += 15;
  else if (deviceCount > 5) riskScore += 5;

  if (uniqueEcpmCount < 10 && logs.length > 100) riskScore += 10;

  if (maxInterval < 60 && logs.length > 500) riskScore += 10;

  console.log(`风险评分: ${riskScore}/100`);

  if (riskScore >= 50) {
    console.log('🚨 高风险！强烈怀疑使用脚本');
  } else if (riskScore >= 25) {
    console.log('⚠️ 中等风险，需要进一步观察');
  } else {
    console.log('✅ 低风险，未发现明显脚本特征');
  }

  // 7. 列出最可疑的几个时间点
  console.log('\n=== 7. 最可疑的时间间隔（<10秒）===');
  let suspiciousCount = 0;
  for (let i = 1; i < logs.length && suspiciousCount < 10; i++) {
    const diff = (logs[i].createTime - logs[i-1].createTime) / 1000;
    if (diff > 0 && diff < 10) {
      console.log(`  ${logs[i-1].createTime.toISOString().substring(11,19)} -> ${logs[i].createTime.toISOString().substring(11,19)} (间隔${diff.toFixed(1)}秒)`);
      suspiciousCount++;
    }
  }

  await mongoose.disconnect();
}

const employeeId = process.argv[2] || '7936';
detectBotBehavior(employeeId).catch(console.error);