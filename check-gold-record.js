const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkGoldRecord() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 获取今天的开始时间（UTC）
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    // 获取今天的结束时间（UTC）
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    // 查询8202员工今天的所有金币记录
    const records = await GoldLog.find({
      employeeId: '8202',
      createTime: { $gte: today, $lt: tomorrow }
    });
    console.log('8202员工今天的所有金币记录:', records);

    if (records.length > 0) {
      console.log('找到8202员工今天的金币记录，共', records.length, '条');
    } else {
      console.log('未找到8202员工今天的金币记录');
    }

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('查询错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

checkGoldRecord();