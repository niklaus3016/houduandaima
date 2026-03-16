const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');
const Employee = require('./models/Employee');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function check2222UserId() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    const employeeId = '2222';

    // 查询员工信息
    const employee = await Employee.findOne({ employeeId });
    console.log('=== 员工信息 ===');
    if (employee) {
      console.log(`员工号: ${employee.employeeId}`);
      console.log(`姓名: ${employee.realName}`);
      console.log(`手机: ${employee.phone}`);
      console.log(`地区: ${employee.region}`);
      console.log(`状态: ${employee.status}`);
    } else {
      console.log('❌ 员工不存在');
    }

    // 查询UserGold记录
    const userGold = await UserGold.findOne({ employeeId });
    console.log('\n=== UserGold记录 ===');
    if (userGold) {
      console.log(`userId: ${userGold.userId}`);
      console.log(`employeeId: ${userGold.employeeId}`);
      console.log(`本月累计金币: ${userGold.currentMonthGold}`);
      console.log(`上月累计金币: ${userGold.lastMonthGold}`);
      console.log(`创建时间: ${userGold.createdAt}`);
    } else {
      console.log('❌ 没有UserGold记录');
    }

    // 查询所有匹配的UserGold记录（可能有多条）
    const allUserGold = await UserGold.find({ employeeId }).sort({ createdAt: -1 });
    console.log('\n=== 所有UserGold记录 ===');
    console.log(`总记录数: ${allUserGold.length}`);
    allUserGold.forEach((record, index) => {
      console.log(`${index + 1}. userId: ${record.userId}, 创建时间: ${record.createdAt}`);
    });

    await mongoose.disconnect();
    console.log('\n完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

check2222UserId();
