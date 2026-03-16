const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 模拟 getBeijingDate 函数
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 模拟 getBeijingStartOfDay 函数
function getBeijingStartOfDay() {
  const beijingNow = getBeijingDate();
  const startOfDay = new Date(beijingNow);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

// 模拟 getBeijingDateString 函数
function getBeijingDateString() {
  return getBeijingDate().toISOString().split('T')[0];
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const userId = 'user_2222_1773112309254';
    const employeeId = '2222';
    
    console.log('=== 时间信息 ===');
    const now = new Date();
    console.log('当前UTC时间:', now.toISOString());
    
    const beijingNow = getBeijingDate();
    console.log('当前北京时间:', beijingNow.toISOString());
    console.log('当前北京时间日期:', beijingNow.toISOString().split('T')[0]);
    
    const today = getBeijingStartOfDay();
    console.log('今天开始:', today.toISOString());
    console.log('今天开始日期:', today.toISOString().split('T')[0]);
    
    const todayStr = getBeijingDateString();
    console.log('todayStr:', todayStr);
    
    // 计算明天的日期
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    console.log('明天开始:', tomorrow.toISOString());
    
    console.log('\n=== 检查登录记录 ===');
    // 检查今天是否已有登录记录
    let existingRecord = await LoginRecord.findOne({
      userId: userId,
      loginDate: { $gte: today, $lt: tomorrow }
    });
    
    console.log('现有登录记录:', existingRecord);
    
    let isNewLogin = false;
    
    if (!existingRecord) {
      // 今天首次登录，创建记录
      console.log('\n=== 创建登录记录 ===');
      const record = await LoginRecord.create({
        userId: userId,
        employeeId: employeeId,
        loginDate: today,
        loginTime: new Date()
      });
      console.log('创建的登录记录:', record);
      console.log('loginDate:', record.loginDate.toISOString());
      console.log('loginDate日期:', record.loginDate.toISOString().split('T')[0]);
      isNewLogin = true;
    }
    
    console.log('\n=== 查询所有登录记录 ===');
    const records = await LoginRecord.find({ userId: userId }).sort({ loginDate: 1 });
    console.log('登录记录数量:', records.length);
    records.forEach(record => {
      console.log('loginDate:', record.loginDate.toISOString());
      console.log('loginDate日期:', record.loginDate.toISOString().split('T')[0]);
    });
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
