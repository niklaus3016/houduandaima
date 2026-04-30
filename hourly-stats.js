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

async function hourlyStats(employeeId) {
  await mongoose.connect(MONGODB_URI);

  const GoldLog = mongoose.model('GoldLog', GoldLogSchema);

  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStart = new Date(beijingNow);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);

  const logs = await GoldLog.find({
    employeeId: employeeId,
    createTime: { $gte: todayStartUTC }
  }).sort({ createTime: 1 });

  console.log(`员工 ${employeeId} 今日数据统计 (${logs.length}条记录)\n`);
  console.log('时间(北京)  广告数    金币总额        ECPM总额       平均ECPM');
  console.log('------------------------------------------------------------------------');

  const hourlyData = {};

  logs.forEach(log => {
    const hour = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000).getHours();
    if (!hourlyData[hour]) {
      hourlyData[hour] = { count: 0, gold: 0, ecpm: 0 };
    }
    hourlyData[hour].count++;
    hourlyData[hour].gold += log.gold;
    hourlyData[hour].ecpm += log.ecpm;
  });

  for (let h = 0; h < 24; h++) {
    if (hourlyData[h]) {
      const avgEcpm = hourlyData[h].ecpm / hourlyData[h].count;
      console.log(
        `${h.toString().padStart(2, '0')}:00      ${hourlyData[h].count.toString().padStart(4)}    ${hourlyData[h].gold.toFixed(2).padStart(12)}    ${hourlyData[h].ecpm.toFixed(2).padStart(12)}    ${avgEcpm.toFixed(2)}`
      );
    } else {
      console.log(`${h.toString().padStart(2, '0')}:00      0`);
    }
  }

  // 合计
  const total = {
    count: 0,
    gold: 0,
    ecpm: 0
  };
  Object.values(hourlyData).forEach(data => {
    total.count += data.count;
    total.gold += data.gold;
    total.ecpm += data.ecpm;
  });

  console.log('------------------------------------------------------------------------');
  console.log(
    `合计        ${total.count.toString().padStart(4)}    ${total.gold.toFixed(2).padStart(12)}    ${total.ecpm.toFixed(2).padStart(12)}    ${(total.ecpm/total.count).toFixed(2)}`
  );

  await mongoose.disconnect();
}

const employeeId = process.argv[2] || '7936';
hourlyStats(employeeId).catch(console.error);