const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 查询5555今日广告位ecpm记录 ===');
  
  // 计算今日时间范围（北京时间）
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  const todayBeijing = new Date(beijingNow);
  todayBeijing.setHours(0, 0, 0, 0);
  const todayStart = new Date(todayBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  console.log('今日开始时间(UTC):', todayStart);
  console.log('当前时间(UTC):', now);
  
  // 查询5555今日在指定广告位的记录
  const slotIds = ['19202099', '19188418'];
  
  for (const slotId of slotIds) {
    const logs = await GoldLog.find({
      employeeId: '5555',
      slotId: slotId,
      createTime: { $gte: todayStart }
    }).sort({ createTime: -1 });
    
    console.log(`\n广告位 ${slotId}:`);
    console.log(`  记录数: ${logs.length}`);
    
    if (logs.length > 0) {
      console.log(`  ECPM记录:`);
      for (const log of logs) {
        console.log(`    ${log.createTime.toISOString()} - ECPM: ${log.ecpm}, 金币: ${log.gold}`);
      }
    } else {
      console.log(`  无记录`);
    }
  }
  
  mongoose.disconnect();
});