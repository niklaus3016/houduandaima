const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const UserGold = require('./models/UserGold');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 删除测试数据 ===');
  
  const testUserId = 'test_user_123';
  
  // 删除金币记录
  const goldLogResult = await GoldLog.deleteMany({ userId: testUserId });
  console.log('删除金币记录:', goldLogResult.deletedCount, '条');
  
  // 删除用户金币余额记录
  const userGoldResult = await UserGold.deleteOne({ userId: testUserId });
  console.log('删除用户金币余额:', userGoldResult.deletedCount, '条');
  
  console.log('\n测试数据已删除！');
  mongoose.disconnect();
});
