const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

// 连接MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 查找用户2222的2026-03-11登录记录
    const userId = 'user_2222_1773112309254';
    
    // 计算2026-03-11的北京时间开始时间
    const targetDate = new Date('2026-03-11');
    const beijingStart = new Date(targetDate.getTime() + 8 * 60 * 60 * 1000);
    beijingStart.setUTCHours(8, 0, 0, 0);
    
    const beijingEnd = new Date(beijingStart.getTime() + 24 * 60 * 60 * 1000);
    
    console.log('查找登录记录...');
    console.log('用户ID:', userId);
    console.log('开始时间:', beijingStart);
    console.log('结束时间:', beijingEnd);
    
    // 查找并删除记录
    const result = await LoginRecord.deleteMany({
      userId: userId,
      loginDate: { $gte: beijingStart, $lt: beijingEnd }
    });
    
    console.log('删除结果:', result);
    
    // 验证删除后的登录统计
    console.log('\n验证删除后的登录统计...');
    const records = await LoginRecord.find({ userId: userId }).sort({ loginDate: 1 });
    console.log('剩余登录记录数量:', records.length);
    
    if (records.length > 0) {
      console.log('登录记录:', records.map(r => ({
        loginDate: r.loginDate.toISOString(),
        loginTime: r.loginTime.toISOString()
      })));
    }
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
