const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function check8202Logs() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 查询所有员工8202的记录
    const logsByEmployeeId = await GoldLog.find({ employeeId: '8202' }).sort({ createTime: -1 }).limit(10);
    console.log('\n=== 通过 employeeId=8202 查询 ===');
    console.log(`记录数: ${logsByEmployeeId.length}`);
    logsByEmployeeId.forEach((log, i) => {
      console.log(`${i+1}. userId: ${log.userId}, 时间: ${log.createTime}, 金币: ${log.gold}`);
    });

    // 查询所有userId包含8202的记录
    const allLogs = await GoldLog.find({ userId: /8202/ }).sort({ createTime: -1 }).limit(10);
    console.log('\n=== 通过 userId 包含 8202 查询 ===');
    console.log(`记录数: ${allLogs.length}`);
    allLogs.forEach((log, i) => {
      console.log(`${i+1}. userId: ${log.userId}, 员工: ${log.employeeId}, 时间: ${log.createTime}, 金币: ${log.gold}`);
    });

    await mongoose.disconnect();
    console.log('\n完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

check8202Logs();
