const mongoose = require('mongoose');
const UserActivity = require('./models/UserActivity');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkUserActivity() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 查询所有用户活动记录
    const allActivities = await UserActivity.find({}).limit(10);
    console.log('\n=== 用户活动记录（前10条）===');
    console.log(`总记录数: ${await UserActivity.countDocuments({})}`);
    
    if (allActivities.length > 0) {
      allActivities.forEach((act, i) => {
        console.log(`${i+1}. 用户: ${act.userId}, 员工: ${act.employeeId}, IP: ${act.ip}, 设备: ${act.deviceId}`);
      });
    } else {
      console.log('暂无记录');
    }

    // 统计用户8202的IP和设备数
    const userId = 'user_8202_1772466028893';
    const ipList = await UserActivity.distinct('ip', { userId });
    const deviceList = await UserActivity.distinct('deviceId', { userId });
    
    console.log(`\n=== 用户8202统计 ===`);
    console.log(`IP数量: ${ipList.length}`);
    console.log(`设备数量: ${deviceList.length}`);
    if (ipList.length > 0) console.log(`IP列表: ${ipList.join(', ')}`);
    if (deviceList.length > 0) console.log(`设备列表: ${deviceList.join(', ')}`);

    await mongoose.disconnect();
    console.log('\n完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

checkUserActivity();
