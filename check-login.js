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
    
    const beijingNow = getBeijingDate();
    console.log('北京时间:', beijingNow.toISOString());
    
    const todayStart = getBeijingStartOfDay(beijingNow);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    console.log('今日开始:', todayStart.toISOString());
    console.log('今日结束:', todayEnd.toISOString());
    
    // 查询所有登录记录
    const allRecords = await LoginRecord.find({}).sort({ loginDate: -1 });
    console.log('\n所有登录记录:');
    allRecords.forEach(r => {
      const beijingTime = new Date(r.loginDate.getTime() + 8 * 60 * 60 * 1000);
      console.log(`  ${r.userId} | ${beijingTime.toISOString()} | ${r.loginDate.toISOString()}`);
    });
    
    // 查询今日登录记录
    const todayRecords = await LoginRecord.find({
      loginDate: { $gte: todayStart, $lt: todayEnd }
    });
    console.log('\n今日登录记录数:', todayRecords.length);
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });