const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 所有用户金币记录 ===');
  
  // 1. 获取所有不同的employeeId
  const users = await GoldLog.distinct('employeeId');
  
  console.log('总用户数:', users.length);
  console.log('\n用户列表:');
  
  // 2. 计算每个用户的累计金币
  for (const employeeId of users) {
    const result = await GoldLog.aggregate([
      { $match: { employeeId } },
      { $group: { _id: null, totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
    ]);
    
    const totalGold = result[0] ? result[0].totalGold : 0;
    const count = result[0] ? result[0].count : 0;
    
    console.log(`- ${employeeId}: ${totalGold} 金币 (${count}条记录)`);
  }
  
  mongoose.disconnect();
});