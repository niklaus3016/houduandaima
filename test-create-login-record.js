const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const userId = 'user_2222_1773112309254';
    const employeeId = '2222';
    
    const now = new Date();
    console.log('当前UTC时间:', now.toISOString());
    
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    console.log('当前北京时间:', beijingNow.toISOString());
    
    const year = beijingNow.getUTCFullYear();
    const month = beijingNow.getUTCMonth();
    const day = beijingNow.getUTCDate();
    console.log('北京时间年月日:', year, month, day);
    
    const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
    console.log('北京时间0点对应的UTC时间:', utcMidnight.toISOString());
    
    const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
    console.log('北京时间0点对应的UTC时间(减8小时):', beijingStartUTC.toISOString());
    
    console.log('\n手动创建登录记录:');
    const record = await LoginRecord.create({
      userId: userId,
      employeeId: employeeId,
      loginDate: beijingStartUTC,
      loginTime: new Date()
    });
    console.log('创建的登录记录:', record.loginDate.toISOString());
    console.log('登录记录对应的北京时间:', new Date(record.loginDate.getTime() + 8 * 60 * 60 * 1000).toISOString());
    console.log('登录记录对应的北京时间日期:', new Date(record.loginDate.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0]);
    
    mongoose.disconnect();
    console.log('操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
