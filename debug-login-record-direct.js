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
  console.log('=== 直接检查 LoginRecord 数据 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  try {
    // 先获取团队成员信息
    const dashboardResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('dashboard 响应:');
    console.log('  员工数量:', dashboardResponse.data.data.employees?.length || 0);
    console.log('  活跃用户:', dashboardResponse.data.data.kpi.activeUsers);
    console.log('  展示次数:', dashboardResponse.data.data.kpi.impressions);

    // 尝试直接创建一个 LoginRecord
    console.log('\n尝试创建 LoginRecord...');
    const testUserId = 'test_7777';
    const testEmployeeId = '7777';
    
    try {
      const loginRecordResponse = await axios.post(`${API_BASE_URL}/user/login-record`, {
        userId: testUserId,
        employeeId: testEmployeeId
      });
      console.log('创建 LoginRecord 成功:', loginRecordResponse.data);
    } catch (error) {
      console.log('创建 LoginRecord 失败:', error.response?.data || error.message);
    }

    // 再次查询 dashboard
    console.log('\n再次查询 dashboard...');
    const dashboardResponse2 = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('dashboard 响应 2:');
    console.log('  活跃用户:', dashboardResponse2.data.data.kpi.activeUsers);
    console.log('  活跃用户增长:', dashboardResponse2.data.data.kpi.activeUsersGrowth);

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

runTests();
