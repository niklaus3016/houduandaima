const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');
const Employee = require('./models/Employee');

async function runTests() {
  console.log('=== 简化调试 LoginRecord 查询问题 ===\n');

  try {
    // 连接 MongoDB
    await mongoose.connect('mongodb://127.0.0.1:27017/company_dashboard');
    console.log('已连接到 MongoDB\n');

    // 获取一个团队长下的员工
    const admin = await mongoose.connection.collection('admins').findOne({ username: 'cuiding' });
    console.log('cuiding admin _id:', admin._id);
    
    const employees = await Employee.find({ parentId: admin._id.toString() });
    const employeeIds = employees.map(e => e.employeeId);
    
    console.log('\n1. 员工 ID 列表:');
    console.log('   数量:', employeeIds.length);
    console.log('   示例:', employeeIds.slice(0, 5));
    
    // 获取时间范围
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStart = new Date(beijingNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
    
    console.log('\n2. 时间范围:');
    console.log('   当前 UTC:', now.toISOString());
    console.log('   todayStart (UTC):', todayStartUTC.toISOString());
    
    // 查询 LoginRecord
    console.log('\n3. LoginRecord 查询:');
    const loginRecords = await LoginRecord.find({
      loginDate: { $gte: todayStartUTC, $lt: now },
      employeeId: { $in: employeeIds }
    });
    console.log('   记录数量:', loginRecords.length);
    
    // 统计 LoginRecord 中有多少不同的 employeeId
    const loginRecordEmployeeIds = [...new Set(loginRecords.map(r => r.employeeId))];
    console.log('   LoginRecord 中的不同 employeeId:', loginRecordEmployeeIds.length);
    console.log('   示例:', loginRecordEmployeeIds.slice(0, 5));
    
    // 检查 LoginRecord 中有多少 employeeId 在员工列表中
    const employeeIdSet = new Set(employeeIds);
    const matchingEmployeeIds = loginRecordEmployeeIds.filter(id => employeeIdSet.has(id));
    console.log('   匹配的员工 ID 数量:', matchingEmployeeIds.length);
    
    // 检查 LoginRecord 的索引
    console.log('\n4. LoginRecord 索引信息:');
    const indexes = await mongoose.connection.collection('loginrecords').indexes();
    console.log('   索引:', JSON.stringify(indexes, null, 2));

  } catch (error) {
    console.error('错误:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
