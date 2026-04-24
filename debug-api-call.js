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
  console.log('=== 测试 dashboard API ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  try {
    // 调用 dashboard API
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('响应状态:', response.status);
    console.log('KPI 数据:');
    console.log('  activeUsers:', response.data.data.kpi.activeUsers);
    console.log('  activeUsersGrowth:', response.data.data.kpi.activeUsersGrowth);
    console.log('  employees:', response.data.data.employees?.length);

  } catch (error) {
    console.error('请求失败:', error.response?.data || error.message);
    if (error.response?.data?.message) {
      console.error('错误详情:', error.response.data.message);
    }
  }
}

runTests();
