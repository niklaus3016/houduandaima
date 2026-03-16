const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(date) {
  const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  beijingDate.setUTCHours(0, 0, 0, 0);
  return new Date(beijingDate.getTime() - 8 * 60 * 60 * 1000);
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 手动添加8202的登录记录
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(beijingNow);
    
    console.log('添加8202登录记录...');
    console.log('时间:', todayStart.toISOString());
    
    // 检查是否已存在
    const existing = await LoginRecord.findOne({
      userId: 'user_8202_1772384602471',
      loginDate: todayStart
    });
    
    if (existing) {
      console.log('登录记录已存在');
    } else {
      await LoginRecord.create({
        userId: 'user_8202_1772384602471',
        employeeId: '8202',
        loginDate: todayStart,
        loginTime: new Date()
      });
      console.log('登录记录添加成功');
    }
    
    // 查询今日登录记录
    const todayRecords = await LoginRecord.find({
      loginDate: { $gte: todayStart }
    });
    
    console.log('\n今日登录记录:', todayRecords.length);
    todayRecords.forEach(r => {
      const beijingTime = new Date(r.loginDate.getTime() + 8 * 60 * 60 * 1000);
      console.log(`  ${r.userId} | ${beijingTime.toISOString()}`);
    });
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });