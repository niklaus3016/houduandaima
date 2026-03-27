const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const LoginRecord = require('./models/LoginRecord');
const UserGold = require('./models/UserGold');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间的今天开始时间（UTC）
function getBeijingTodayStart() {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = new Date(beijingTime);
  today.setUTCHours(0, 0, 0, 0);
  return new Date(today.getTime() - 8 * 60 * 60 * 1000); // 转回UTC
}

// 模拟登录统计API的逻辑
async function getLoginStats(userId, employeeId) {
  const todayStart = getBeijingTodayStart();
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  // 查询登录记录
  const records = await LoginRecord.find({
    userId: userId
  }).sort({ loginDate: 1 });

  // 提取唯一日期
  const uniqueDates = [...new Set(records.map(r => 
    r.loginDate.toISOString().split('T')[0]
  ))];

  // 计算连续登录天数
  let consecutiveDays = 0;
  if (records.length > 0) {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const todayStr = todayStart.toISOString().split('T')[0];

    // 检查今天或昨天是否有登录
    const hasTodayLogin = records.some(r => 
      r.loginDate.toISOString().split('T')[0] === todayStr
    );
    const hasYesterdayLogin = records.some(r => 
      r.loginDate.toISOString().split('T')[0] === yesterdayStr
    );

    if (hasTodayLogin || hasYesterdayLogin) {
      consecutiveDays = 1;
      let checkDate = hasTodayLogin ? new Date(todayStart) : new Date(yesterday);

      for (let i = 1; i < records.length; i++) {
        checkDate.setDate(checkDate.getDate() - 1);
        const checkDateStr = checkDate.toISOString().split('T')[0];
        const hasLogin = records.some(r => 
          r.loginDate.toISOString().split('T')[0] === checkDateStr
        );
        if (hasLogin) {
          consecutiveDays++;
        } else {
          break;
        }
      }
    }
  }

  // 检查今日是否登录
  const todayStr = todayStart.toISOString().split('T')[0];
  const hasTodayLogin = records.some(r => 
    r.loginDate.toISOString().split('T')[0] === todayStr
  );

  return {
    success: true,
    data: {
      loginDays: records.length,
      todayLogin: hasTodayLogin,
      consecutiveDays: consecutiveDays
    }
  };
}

async function testLoginStatsApi() {
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

    // 获取所有员工的UserGold记录
    const employeeIds = employees.map(e => e.employeeId);
    const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
    
    // 创建员工ID到用户ID的映射
    const employeeToUserMap = new Map();
    userGolds.forEach(ug => {
      employeeToUserMap.set(ug.employeeId, ug.userId);
    });

    console.log('\n员工到用户ID的映射:');
    employeeToUserMap.forEach((userId, employeeId) => {
      console.log(`${employeeId} -> ${userId}`);
    });

    // 统计已上线和未上线的员工
    let onlineCount = 0;
    let offlineCount = 0;
    const onlineEmployees = [];
    const offlineEmployees = [];

    for (const employee of employees) {
      const userId = employeeToUserMap.get(employee.employeeId);
      
      if (userId) {
        // 调用登录统计API
        const result = await getLoginStats(userId, employee.employeeId);
        
        if (result.success && result.data.todayLogin) {
          onlineCount++;
          onlineEmployees.push({
            employeeId: employee.employeeId,
            name: employee.realName || employee.name || '未命名',
            userId: userId
          });
        } else {
          offlineCount++;
          offlineEmployees.push({
            employeeId: employee.employeeId,
            name: employee.realName || employee.name || '未命名',
            userId: userId
          });
        }
      } else {
        // 没有对应的用户ID
        offlineCount++;
        offlineEmployees.push({
          employeeId: employee.employeeId,
          name: employee.realName || employee.name || '未命名',
          userId: '无'
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
        console.log(`${index + 1}. ${emp.employeeId} - ${emp.name} (userId: ${emp.userId})`);
      });
    }

    if (offlineEmployees.length > 0) {
      console.log('\n=== 未上线员工 ===');
      offlineEmployees.forEach((emp, index) => {
        console.log(`${index + 1}. ${emp.employeeId} - ${emp.name} (userId: ${emp.userId})`);
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

testLoginStatsApi();