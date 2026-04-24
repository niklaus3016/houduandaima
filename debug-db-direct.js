const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const UserGold = require('./models/UserGold');
const LoginRecord = require('./models/LoginRecord');

async function debugActiveUsers() {
  console.log('=== 调试活跃用户问题 ===\n');

  try {
    // 连接 MongoDB
    await mongoose.connect('mongodb://127.0.0.1:27017/company_dashboard');
    console.log('已连接到 MongoDB\n');

    // 1. 找到 cuiding 管理员
    const admin = await mongoose.connection.collection('admins').findOne({ username: 'cuiding' });
    if (!admin) {
      console.log('未找到 cuiding 管理员');
      return;
    }
    console.log('1. 找到管理员 cuiding:', admin._id);

    // 2. 找到其下属员工
    const employees = await Employee.find({ parentId: admin._id.toString() });
    console.log('2. 下属员工数量:', employees.length);
    if (employees.length > 0) {
      console.log('   示例员工:', employees.slice(0, 3).map(e => ({ name: e.name, employeeId: e.employeeId })));
    }

    const employeeIds = employees.map(e => e.employeeId);
    console.log('   employeeIds 数量:', employeeIds.length);

    // 3. 找到这些员工对应的 UserGold
    const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
    console.log('3. UserGold 数量:', userGolds.length);
    if (userGolds.length > 0) {
      console.log('   示例 UserGold:', userGolds.slice(0, 3).map(ug => ({ userId: ug.userId, employeeId: ug.employeeId })));
    }

    const teamMemberUserIds = userGolds.map(ug => ug.userId);
    console.log('   teamMemberUserIds 数量:', teamMemberUserIds.length);

    // 4. 计算今日时间范围
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStartBeijing = new Date(beijingNow);
    todayStartBeijing.setUTCHours(0, 0, 0, 0);
    const startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    const endDate = now;

    console.log('\n4. 时间范围:');
    console.log('   今天开始 (UTC):', startDate.toISOString());
    console.log('   现在 (UTC):', endDate.toISOString());

    // 5. 查询 LoginRecord
    console.log('\n5. LoginRecord 查询:');
    
    // 查询所有今日登录记录
    const allLoginRecords = await LoginRecord.find({
      loginDate: { $gte: startDate, $lt: endDate }
    });
    console.log('   今日所有 LoginRecord 数量:', allLoginRecords.length);
    if (allLoginRecords.length > 0) {
      console.log('   示例记录:', allLoginRecords.slice(0, 3).map(r => ({ userId: r.userId, employeeId: r.employeeId, loginDate: r.loginDate.toISOString() })));
    }

    // 查询团队成员的今日登录记录
    const teamLoginRecords = await LoginRecord.find({
      loginDate: { $gte: startDate, $lt: endDate },
      userId: { $in: teamMemberUserIds }
    });
    console.log('   团队成员今日 LoginRecord 数量:', teamLoginRecords.length);
    if (teamLoginRecords.length > 0) {
      console.log('   示例记录:', teamLoginRecords.slice(0, 3).map(r => ({ userId: r.userId, employeeId: r.employeeId, loginDate: r.loginDate.toISOString() })));
    }

    // 6. 检查 teamMemberUserIds 中是否有用户今日登录
    const teamMemberUserIdSet = new Set(teamMemberUserIds);
    const activeUserIds = new Set(allLoginRecords.map(r => r.userId));
    const overlappingUserIds = [...activeUserIds].filter(id => teamMemberUserIdSet.has(id));
    console.log('\n6. 团队成员中今日登录的用户数量:', overlappingUserIds.length);
    if (overlappingUserIds.length > 0) {
      console.log('   登录用户 ID:', overlappingUserIds.slice(0, 5));
    }

  } catch (error) {
    console.error('错误:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n已断开 MongoDB 连接');
  }
}

// 运行调试
debugActiveUsers();
