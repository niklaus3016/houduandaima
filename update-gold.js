const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 更新test123用户的上月金币
    const result = await UserGold.updateOne(
      { userId: 'test123', employeeId: '8202' },
      { $set: { lastMonthGold: 50000 } }
    );
    
    console.log('更新结果:', result);
    
    // 查询更新后的数据
    const user = await UserGold.findOne({ userId: 'test123', employeeId: '8202' });
    console.log('更新后的用户数据:', user);
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });