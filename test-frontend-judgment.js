const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const LoginRecord = require('./models/LoginRecord');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间的今天开始时间（UTC）
function getBeijingTodayStart() {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = new Date(beijingTime);
  today.setUTCHours(0, 0, 0, 0);
  return new Date(today.getTime() - 8 * 60 * 60 * 1000); // 转回UTC
}

// 获取北京时间的今天结束时间（UTC）
function getBeijingTodayEnd() {
  const start = getBeijingTodayStart();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

// 前端自行判断逻辑
async function checkEmployeeOnlineStatus(employeeId) {
  const todayStart = getBeijingTodayStart();
  const todayEnd = getBeijingTodayEnd();

  // 查询LoginRecord表
  const loginRecords = await LoginRecord.find({
    employeeId: employeeId,
    loginDate: { $gte: todayStart, $lt: todayEnd }
  });

  // 判断标准：如果有记录则为已上线，否则为未上线
  return loginRecords.length > 0;
}

async function testFrontendJudgment() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 查询cuiding账号的信息
    const admin = await Admin.findOne({ username: 'cuiding' });
    if (!admin) {
      console.log('未找到cuiding账号');
      await mongoose.disconnect();
      return;
    }

    console.log('cuiding团队信息:');
    console.log('团队名称:', admin.teamName);
    console.log('团队长:', admin.realName);

    // 查询cuiding团队下的所有员工
    const employees = await Employee.find({ parentId: admin._id.toString() });
    console.log('\n团队下的员工数量:', employees.length);

    if (employees.length === 0) {
      console.log('团队下没有员工');
      await mongoose.disconnect();
      return;
    }

    // 获取今天的时间范围（北京时间）
    const todayStart = getBeijingTodayStart();
    const todayEnd = getBeijingTodayEnd();
    console.log('\n查询时间范围（北京时间）:');
    console.log('开始:', new Date(todayStart.getTime() + 8 * 60 * 60 * 1000).toLocaleString());
    console.log('结束:', new Date(todayEnd.getTime() + 8 * 60 * 60 * 1000).toLocaleString());

    // 统计已上线和未上线的员工
    let onlineCount = 0;
    let offlineCount = 0;
    const onlineEmployees = [];
    const offlineEmployees = [];

    for (const employee of employees) {
      // 前端自行判断上线状态
      const isOnline = await checkEmployeeOnlineStatus(employee.employeeId);
      
      if (isOnline) {
        onlineCount++;
        onlineEmployees.push({
          employeeId: employee.employeeId,
          name: employee.realName || employee.name || '未命名'
        });
      } else {
        offlineCount++;
        offlineEmployees.push({
          employeeId: employee.employeeId,
          name: employee.realName || employee.name || '未命名'
        });
      }
    }

    // 输出结果
    console.log('\n=== 统计结果 ===');
    console.log('已上线人数:', onlineCount);
    console.log('未上线人数:', offlineCount);
    console.log('总人数:', onlineCount + offlineCount);

    if (onlineEmployees.length > 0) {
      console.log('\n=== 已上线员工 ===');
      onlineEmployees.forEach((emp, index) => {
        console.log(`${index + 1}. ${emp.employeeId} - ${emp.name}`);
      });
    }

    if (offlineEmployees.length > 0) {
      console.log('\n=== 未上线员工 ===');
      offlineEmployees.forEach((emp, index) => {
        console.log(`${index + 1}. ${emp.employeeId} - ${emp.name}`);
      });
    }

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('测试错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

testFrontendJudgment();