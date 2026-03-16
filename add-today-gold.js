const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 为test123用户添加一些今日金币记录，使其达到目标
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    // 删除今日已有的金币记录
    await GoldLog.deleteMany({
      userId: 'test123',
      createTime: { $gte: today, $lte: todayEnd }
    });
    
    // 添加金币记录
    await GoldLog.create({
      userId: 'test123',
      employeeId: '8202',
      gold: 5000,
      ecpm: 1000,
      createTime: new Date()
    });
    
    await GoldLog.create({
      userId: 'test123',
      employeeId: '8202',
      gold: 5000,
      ecpm: 1000,
      createTime: new Date()
    });
    
    console.log('已为test123用户添加今日金币记录');
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });