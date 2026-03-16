const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const UserGold = require('./models/UserGold');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkUser2222Data() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    const employeeId = '2222';

    // 检查员工信息
    const employee = await Employee.findOne({ employeeId });
    if (!employee) {
      console.log(`❌ 员工${employeeId}不存在`);
      await mongoose.disconnect();
      return;
    }
    console.log('员工信息:');
    console.log(`员工号: ${employee.employeeId}`);
    console.log(`姓名: ${employee.realName}`);
    console.log(`创建时间: ${employee.createdAt}`);

    // 检查UserGold记录
    const userGold = await UserGold.findOne({ employeeId });
    if (userGold) {
      console.log('\nUserGold记录:');
      console.log(`当前月金币: ${userGold.currentMonthGold}`);
      console.log(`上月金币: ${userGold.lastMonthGold}`);
      console.log(`用户ID: ${userGold.userId}`);
    } else {
      console.log('\n❌ 没有UserGold记录');
    }

    // 检查GoldLog记录
    const goldLogs = await GoldLog.find({ employeeId }).sort({ createTime: -1 });
    console.log(`\nGoldLog记录 (共${goldLogs.length}条):`);
    if (goldLogs.length > 0) {
      goldLogs.forEach((log, index) => {
        console.log(`${index + 1}. 时间: ${log.createTime}, ECPM: ${log.ecpm}, 金币: ${log.gold}`);
      });
    } else {
      console.log('❌ 没有GoldLog记录');
    }

    // 计算实际累计金币
    const totalGoldFromLogs = goldLogs.reduce((sum, log) => sum + log.gold, 0);
    console.log(`\n计算结果:`);
    console.log(`从GoldLog计算的总金币: ${totalGoldFromLogs}`);
    if (userGold) {
      console.log(`UserGold中的当前月金币: ${userGold.currentMonthGold}`);
      console.log(`差异: ${Math.abs(totalGoldFromLogs - userGold.currentMonthGold)}`);
    }

    await mongoose.disconnect();
    console.log('\n完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

checkUser2222Data();
