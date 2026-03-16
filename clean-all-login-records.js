const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

// 连接MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const userId = 'user_2222_1773112309254';
    
    // 获取所有登录记录
    console.log('获取所有登录记录...');
    const allRecords = await LoginRecord.find({ userId: userId }).sort({ loginDate: 1 });
    console.log('所有登录记录:', allRecords.map(r => ({
      _id: r._id,
      loginDate: r.loginDate.toISOString(),
      loginTime: r.loginTime.toISOString()
    })));
    
    // 删除所有登录记录
    console.log('\n删除所有登录记录...');
    const result = await LoginRecord.deleteMany({ userId: userId });
    console.log('删除结果:', result);
    
    // 验证删除后的结果
    console.log('\n验证删除后的登录统计...');
    const remainingRecords = await LoginRecord.find({ userId: userId }).sort({ loginDate: 1 });
    console.log('剩余登录记录数量:', remainingRecords.length);
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
