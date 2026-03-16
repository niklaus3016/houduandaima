const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const userId = 'user_2222_1773112309254';
    
    const records = await LoginRecord.find({ userId: userId }).sort({ loginDate: 1 });
    console.log('登录记录数量:', records.length);
    records.forEach(record => {
      console.log('loginDate:', record.loginDate.toISOString());
      console.log('loginDate (UTC):', record.loginDate.toISOString());
      console.log('loginDate (Beijing):', new Date(record.loginDate.getTime() + 8 * 60 * 60 * 1000).toISOString());
      console.log('loginDate (Beijing date):', new Date(record.loginDate.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0]);
    });
    
    mongoose.disconnect();
    console.log('操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
