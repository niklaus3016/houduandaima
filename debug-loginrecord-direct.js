const axios = require('axios');
const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

const API_BASE_URL = 'http://127.0.0.1:3003/api';

async function login(username, password) {
  try {
    const response = await axios.post(`${API_BASE_URL}/admin/login`, {
      username,
      password
    });
    return response.data.data.token;
  } catch (error) {
    console.error(`登录失败 ${username}:`, error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('=== 详细调试 LoginRecord 查询问题 ===\n');

  // 连接 MongoDB
  await mongoose.connect('mongodb://127.0.0.1:27017/company_dashboard');
  console.log('已连接到 MongoDB\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  try {
    // 获取团队长的员工信息
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const employees = response.data.data.employees;
    const employeeIds = employees.map(e => e.employeeId);
    
    console.log('1. 员工 ID 列表:');
    console.log('   数量:', employeeIds.length);
    console.log('   示例:', employeeIds.slice(0, 5));
    
    // 获取当前时间信息
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStart = new Date(beijingNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
    
    console.log('\n2. 时间范围:');
    console.log('   当前 UTC 时间:', now.toISOString());
    console.log('   当前北京时间:', beijingNow.toISOString());
    console.log('   todayStart (北京时间 0 点):', todayStart.toISOString());
    console.log('   todayStart (UTC):', todayStartUTC.toISOString());
    
    // 直接查询 LoginRecord
    console.log('\n3. 直接查询 LoginRecord:');
    
    // 方式1: 使用 employeeId 查询
    const loginRecordsByEmployeeId = await LoginRecord.find({
      loginDate: { $gte: todayStartUTC, $lt: now },
      employeeId: { $in: employeeIds }
    });
    console.log('   按 employeeId 查询结果:', loginRecordsByEmployeeId.length, '条');
    if (loginRecordsByEmployeeId.length > 0) {
      console.log('   示例记录:', {
        userId: loginRecordsByEmployeeId[0].userId,
        employeeId: loginRecordsByEmployeeId[0].employeeId,
        loginDate: loginRecordsByEmployeeId[0].loginDate
      });
    }
    
    // 方式2: 直接查询今天的全部记录
    const allLoginRecordsToday = await LoginRecord.find({
      loginDate: { $gte: todayStartUTC, $lt: now }
    });
    console.log('   今日全部记录:', allLoginRecordsToday.length, '条');
    
    // 方式3: 查询所有记录总数
    const totalCount = await LoginRecord.countDocuments();
    console.log('   LoginRecord 总数:', totalCount);
    
    // 方式4: 查询昨天的记录
    const yesterdayStart = new Date(todayStartUTC.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = todayStartUTC;
    const yesterdayRecords = await LoginRecord.find({
      loginDate: { $gte: yesterdayStart, $lt: yesterdayEnd },
      employeeId: { $in: employeeIds }
    });
    console.log('   昨日记录 (按 employeeId):', yesterdayRecords.length, '条');
    
    // 检查 LoginRecord 中的 employeeId 格式
    console.log('\n4. LoginRecord 中的 employeeId 格式:');
    const sampleRecords = await LoginRecord.find().limit(10);
    const uniqueEmployeeIds = [...new Set(sampleRecords.map(r => r.employeeId))];
    console.log('   示例 employeeId:', uniqueEmployeeIds);
    
    // 比较 Employee.employeeId 和 LoginRecord.employeeId
    console.log('\n5. 对比 Employee.employeeId 和 LoginRecord.employeeId:');
    const employeeIdSet = new Set(employeeIds);
    const loginRecordEmployeeIdSet = new Set(loginRecordsByEmployeeId.map(r => r.employeeId));
    
    const matchingIds = employeeIds.filter(id => loginRecordEmployeeIdSet.has(id));
    console.log('   匹配的 employeeId 数量:', matchingIds.length);
    
    if (loginRecordsByEmployeeId.length > 0) {
      const loginEmployeeIds = [...loginRecordEmployeeIdSet];
      const matchingWithEmployee = employeeIds.filter(id => loginEmployeeIds.includes(id));
      console.log('   在 Employee 中找到的 LoginRecord employeeId:', matchingWithEmployee.length);
    }

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
