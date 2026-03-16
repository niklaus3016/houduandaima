const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const UserGold = require('./models/UserGold');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 查询员工2222所有ecpm为350的记录 ===');
  
  // 获取员工2222的userId
  const userGold = await UserGold.findOne({ employeeId: '2222' });
  if (!userGold) {
    console.log('未找到员工2222的用户记录');
    mongoose.disconnect();
    return;
  }
  
  console.log(`员工2222的userId: ${userGold.userId}`);
  
  // 查询该员工所有ecpm为350的记录
  const logs = await GoldLog.find({
    userId: userGold.userId,
    ecpm: 350
  }).sort({ createTime: -1 });
  
  console.log(`\n找到 ${logs.length} 条ecpm为350的记录`);
  
  if (logs.length > 0) {
    console.log('\n=== ECPM为350的记录详情 ===');
    logs.forEach((log, index) => {
      const beijingTime = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000);
      console.log(`\n记录 ${index + 1}:`);
      console.log(`- UTC时间: ${log.createTime.toISOString()}`);
      console.log(`- 北京时间: ${beijingTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      console.log(`- 北京日期: ${beijingTime.toISOString().split('T')[0]}`);
      console.log(`- ECPM: ${log.ecpm}`);
      console.log(`- 金币: ${log.gold}`);
      console.log(`- 广告位ID: ${log.adUnitId}`);
    });
  } else {
    console.log('员工2222没有任何ecpm为350的记录');
  }
  
  // 查询最高的ECPM值
  const maxEcpmLog = await GoldLog.findOne({
    userId: userGold.userId
  }).sort({ ecpm: -1 });
  
  if (maxEcpmLog) {
    console.log(`\n=== 员工2222的最高ECPM记录 ===`);
    const beijingTime = new Date(maxEcpmLog.createTime.getTime() + 8 * 60 * 60 * 1000);
    console.log(`- ECPM: ${maxEcpmLog.ecpm}`);
    console.log(`- 金币: ${maxEcpmLog.gold}`);
    console.log(`- UTC时间: ${maxEcpmLog.createTime.toISOString()}`);
    console.log(`- 北京时间: ${beijingTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  }
  
  mongoose.disconnect();
});