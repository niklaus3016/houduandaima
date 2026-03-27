const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');
const GoldLog = require('./models/GoldLog');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function check8202Users() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 查询8202员工的信息
    const employee = await Employee.findOne({ employeeId: '8202' });
    console.log('8202员工信息:', employee);

    // 查询8202员工对应的所有用户记录
    const userGolds = await UserGold.find({ employeeId: '8202' });
    console.log('\n8202员工对应的用户记录数量:', userGolds.length);

    if (userGolds.length > 0) {
      console.log('\n8202员工对应的用户列表:');
      userGolds.forEach((userGold, index) => {
        console.log(`${index + 1}. userId: ${userGold.userId}, currentMonthGold: ${userGold.currentMonthGold}`);
      });

      // 统计每个用户的金币记录数量
      console.log('\n每个用户的金币记录数量:');
      for (const userGold of userGolds) {
        const goldLogsCount = await GoldLog.countDocuments({
          userId: userGold.userId,
          employeeId: '8202'
        });
        console.log(`userId: ${userGold.userId}, 金币记录数量: ${goldLogsCount}`);
      }

      // 查看最新的几条金币记录
      console.log('\n8202员工的最新10条金币记录:');
      const recentGoldLogs = await GoldLog.find({
        employeeId: '8202'
      }).sort({ createTime: -1 }).limit(10);

      recentGoldLogs.forEach((log, index) => {
        console.log(`${index + 1}. userId: ${log.userId}, gold: ${log.gold}, time: ${log.createTime}`);
      });
    } else {
      console.log('8202员工没有对应的用户记录');
    }

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('查询错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

check8202Users();