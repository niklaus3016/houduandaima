const mongoose = require('mongoose');
const WithdrawRecord = require('./models/WithdrawRecord');
const UserGold = require('./models/UserGold');

// 连接数据库
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI, {
  maxPoolSize: 100,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  connectTimeoutMS: 5000,
})
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 测试创建提现记录
    try {
      const employeeId = '8202';
      const goldAmount = 35000;
      
      // 扣除金币
      await UserGold.updateOne(
        { employeeId: employeeId },
        { $inc: { lastMonthGold: -goldAmount } }
      );
      console.log('金币扣除成功');
      
      // 创建提现记录
      const withdrawRecord = new WithdrawRecord({
        userId: employeeId,
        employeeId: employeeId,
        amount: 35,
        goldAmount: goldAmount,
        alipayAccount: '8202@example.com',
        alipayName: '测试员工8202',
        status: 0,
        statusText: '待处理',
        createTime: new Date()
      });
      
      await withdrawRecord.save();
      console.log('提现记录创建成功:', withdrawRecord);
      
      // 获取剩余金币
      const userGold = await UserGold.findOne({ employeeId: employeeId });
      if (userGold) {
        console.log('剩余金币:', userGold.lastMonthGold);
      } else {
        console.log('未找到UserGold记录');
      }
    } catch (error) {
      console.error('创建提现记录错误:', error);
    } finally {
      // 关闭连接
      await mongoose.connection.close();
      console.log('MongoDB连接已关闭');
    }
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
  });