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
  console.log('=== 检查团队成员用户 ID ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  try {
    // 直接调用 API 获取团队成员信息
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('响应状态:', response.status);
    console.log('员工数量:', response.data.data.employees?.length || 0);
    console.log('组数:', response.data.data.groups?.length || 0);
    console.log('KPI 数据:');
    console.log('  活跃用户:', response.data.data.kpi.activeUsers);
    console.log('  活跃用户增长:', response.data.data.kpi.activeUsersGrowth);

    // 检查员工信息
    if (response.data.data.employees && response.data.data.employees.length > 0) {
      console.log('\n员工示例:');
      response.data.data.employees.slice(0, 5).forEach(employee => {
        console.log(`  - ${employee.name}: ${employee.employeeId}`);
      });
    }

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

runTests();
