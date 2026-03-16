const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const UserGold = require('./models/UserGold');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 查询员工2222在3月13日的ecpm数据 ===');
  
  // 获取员工2222的userId
  const userGold = await UserGold.findOne({ employeeId: '2222' });
  if (!userGold) {
    console.log('未找到员工2222的用户记录');
    mongoose.disconnect();
    return;
  }
  
  console.log(`员工2222的userId: ${userGold.userId}`);
  
  // 北京时间3月13日的时间范围
  // 北京时间3月13日00:00:00 = UTC时间3月12日16:00:00
  // 北京时间3月13日23:59:59 = UTC时间3月13日15:59:59
  
  const beijingDate = new Date('2026-03-13T00:00:00+08:00');
  const utcStart = new Date(beijingDate.getTime() - 8 * 60 * 60 * 1000);
  const utcEnd = new Date(utcStart.getTime() + 24 * 60 * 60 * 1000);
  
  console.log(`\n查询时间范围:`);
  console.log(`北京时间: 2026-03-13 00:00:00 ~ 23:59:59`);
  console.log(`UTC时间: ${utcStart.toISOString()} ~ ${utcEnd.toISOString()}`);
  
  // 查询该员工在3月13日的所有记录
  const logs = await GoldLog.find({
    userId: userGold.userId,
    createTime: { $gte: utcStart, $lt: utcEnd }
  }).sort({ createTime: -1 });
  
  console.log(`\n找到 ${logs.length} 条记录`);
  
  // 查找ecpm为350的记录
  const ecpm350Logs = logs.filter(log => log.ecpm === 350);
  
  console.log(`\n其中ecpm为350的记录: ${ecpm350Logs.length} 条`);
  
  if (ecpm350Logs.length > 0) {
    console.log('\n=== ECPM为350的记录 ===');
    ecpm350Logs.forEach((log, index) => {
      console.log(`\n记录 ${index + 1}:`);
      console.log(`- 时间: ${log.createTime.toISOString()} (UTC)`);
      console.log(`- 北京时间: ${new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      console.log(`- ECPM: ${log.ecpm}`);
      console.log(`- 金币: ${log.gold}`);
      console.log(`- 广告位ID: ${log.adUnitId}`);
    });
  } else {
    console.log('未找到ecpm为350的记录');
  }
  
  // 显示所有记录的ecpm值
  console.log('\n=== 3月13日所有记录的ECPM值 ===');
  logs.forEach((log, index) => {
    console.log(`${index + 1}. ECPM: ${log.ecpm}, 金币: ${log.gold}, 时间: ${log.createTime.toISOString()}`);
  });
  
  mongoose.disconnect();
});