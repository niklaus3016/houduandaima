const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const LoginRecord = require('./models/LoginRecord');
const UserGold = require('./models/UserGold');
const { getBeijingDate, getBeijingStartOfDay } = require('./routes/dashboard');

async function debugLoginRecord() {
  try {
    // 连接数据库
    await mongoose.connect('mongodb://localhost:27017/sealos_zh', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB 连接成功');

    // 1. 查找 cuid 管理员
    const admin = await Admin.findOne({ username: 'cuiding' });
    console.log('\n1. cuid 管理员信息:');
    console.log('   _id:', admin._id);
    console.log('   teamName:', admin.teamName);

    // 2. 查找该团队长下的所有员工
    const employees = await Employee.find({ parentId: admin._id.toString() });
    console.log('\n2. 团队长下的员工数量:', employees.length);
    const employeeIds = employees.map(e => e.employeeId);
    console.log('   employeeIds:', employeeIds.slice(0, 5), '...');

    // 3. 查找这些员工对应的用户
    const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
    console.log('\n3. 员工对应的用户数量:', userGolds.length);
    const userIds = userGolds.map(ug => ug.userId);
    console.log('   userIds:', userIds.slice(0, 5), '...');

    // 4. 查询 LoginRecord（使用 employeeId）
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay();
    console.log('\n4. 今日时间范围（北京时间）:');
    console.log('   todayStart:', todayStart.toISOString());
    console.log('   beijingNow:', beijingNow.toISOString());

    const loginRecordsByEmployeeId = await LoginRecord.find({
      loginDate: { $gte: todayStart, $lt: beijingNow },
      employeeId: { $in: employeeIds }
    });
    console.log('\n5. LoginRecord 查询结果（按 employeeId）:');
    console.log('   记录数量:', loginRecordsByEmployeeId.length);
    if (loginRecordsByEmployeeId.length > 0) {
      console.log('   前5条记录:');
      loginRecordsByEmployeeId.slice(0, 5).forEach(record => {
        console.log(`     - userId: ${record.userId}, employeeId: ${record.employeeId}, loginDate: ${record.loginDate}`);
      });
    }

    // 6. 查询 LoginRecord（使用 userId）
    const loginRecordsByUserId = await LoginRecord.find({
      loginDate: { $gte: todayStart, $lt: beijingNow },
      userId: { $in: userIds }
    });
    console.log('\n6. LoginRecord 查询结果（按 userId）:');
    console.log('   记录数量:', loginRecordsByUserId.length);
    if (loginRecordsByUserId.length > 0) {
      console.log('   前5条记录:');
      loginRecordsByUserId.slice(0, 5).forEach(record => {
        console.log(`     - userId: ${record.userId}, employeeId: ${record.employeeId}, loginDate: ${record.loginDate}`);
      });
    }

    // 7. 查询所有今日 LoginRecord
    const allTodayLoginRecords = await LoginRecord.find({
      loginDate: { $gte: todayStart, $lt: beijingNow }
    });
    console.log('\n7. 今日所有 LoginRecord 数量:', allTodayLoginRecords.length);
    if (allTodayLoginRecords.length > 0) {
      console.log('   前5条记录:');
      allTodayLoginRecords.slice(0, 5).forEach(record => {
        console.log(`     - userId: ${record.userId}, employeeId: ${record.employeeId}, loginDate: ${record.loginDate}`);
      });
    }

    await mongoose.connection.close();
    console.log('\n调试完成');

  } catch (error) {
    console.error('调试失败:', error);
  }
}

debugLoginRecord();
