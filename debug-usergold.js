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
  console.log('=== 检查 UserGold 数据 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  try {
    // 先获取员工列表
    const dashboardResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const employees = dashboardResponse.data.data.employees;
    const employeeIds = employees.map(e => e.employeeId);
    console.log('员工数量:', employeeIds.length);
    console.log('员工 ID 示例:', employeeIds.slice(0, 5));

    // 直接查询 UserGold
    for (const employeeId of employeeIds.slice(0, 5)) {
      try {
        const response = await axios.get(`${API_BASE_URL}/user/info`, {
          params: { userId: `test_${employeeId}`, employeeId: employeeId }
        });
        console.log(`\nUserGold 信息 (${employeeId}):`);
        console.log('  userId:', response.data.data.userId);
        console.log('  employeeId:', response.data.data.employeeId);
        console.log('  currentMonthGold:', response.data.data.currentMonthGold);
      } catch (error) {
        console.log(`\n获取 UserGold 失败 (${employeeId}):`, error.response?.data || error.message);
      }
    }

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

runTests();
