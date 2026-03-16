const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

// 连接MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 查找用户2222的2026-03-11登录记录
    const userId = 'user_2222_1773112309254';
    
    // 直接查找2026-03-11的登录记录
    console.log('查找登录记录...');
    console.log('用户ID:', userId);
    
    // 查找所有登录记录，以便查看具体的时间格式
    const allRecords = await LoginRecord.find({ userId: userId }).sort({ loginDate: 1 });
    console.log('所有登录记录:', allRecords.map(r => ({
      loginDate: r.loginDate.toISOString(),
      loginTime: r.loginTime.toISOString()
    })));
    
    // 找到2026-03-11的记录并删除
    for (const record of allRecords) {
      const recordDate = record.loginDate.toISOString().split('T')[0];
      if (recordDate === '2026-03-11') {
        console.log('找到2026-03-11的记录，准备删除:', record._id);
        await LoginRecord.deleteOne({ _id: record._id });
        console.log('删除成功');
      }
    }
    
    // 验证删除后的登录统计
    console.log('\n验证删除后的登录统计...');
    const remainingRecords = await LoginRecord.find({ userId: userId }).sort({ loginDate: 1 });
    console.log('剩余登录记录数量:', remainingRecords.length);
    
    if (remainingRecords.length > 0) {
      console.log('剩余登录记录:', remainingRecords.map(r => ({
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
