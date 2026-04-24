const axios = require('axios');

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
  console.log('=== 检查活跃用户问题 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  try {
    // 检查今日数据
    console.log('今日数据:');
    const todayResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('  活跃用户:', todayResponse.data.data.kpi.activeUsers);
    console.log('  员工数:', todayResponse.data.data.employees?.length);

    // 检查昨日数据
    console.log('\n昨日数据:');
    const yesterdayResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'yesterday' },
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('  活跃用户:', yesterdayResponse.data.data.kpi.activeUsers);

    // 直接查询 MongoDB 检查
    const mongoose = require('mongoose');
    const LoginRecord = require('./models/LoginRecord');

    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
    await mongoose.connect(MONGODB_URI);

    // 获取北京时间
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStartBeijing = new Date(beijingNow.getFullYear(), beijingNow.getMonth(), beijingNow.getDate(), 0, 0, 0, 0);
    const startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    const endDate = new Date(todayStartBeijing.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);

    console.log('\n=== 直接查询 MongoDB ===');
    console.log('今日时间范围:', startDate.toISOString(), '到', endDate.toISOString());

    // 检查是否有 employeeId=7777 的记录
    const record7777 = await LoginRecord.find({
      loginDate: { $gte: startDate, $lt: endDate },
      employeeId: '7777'
    });
    console.log('\nemployeeId=7777 的记录数:', record7777.length);
    if (record7777.length > 0) {
      console.log('示例:', record7777[0]);
    }

    // 检查是否有任何记录
    const allTodayRecords = await LoginRecord.find({
      loginDate: { $gte: startDate, $lt: endDate }
    });
    console.log('\n今日所有记录数:', allTodayRecords.length);

    await mongoose.disconnect();

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

runTests();
