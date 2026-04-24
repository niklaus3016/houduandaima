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
    console.error(`登录失败:`, error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('=== 检查 API 完整返回结构 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  try {
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('顶层 keys:', Object.keys(response.data.data));

    const data = response.data.data;

    console.log('\n--- kpi ---');
    console.log(JSON.stringify(data.kpi, null, 2));

    console.log('\n--- groups ---');
    if (data.groups && data.groups.length > 0) {
      console.log('groups 数量:', data.groups.length);
      console.log('groups[0]:', JSON.stringify(data.groups[0], null, 2));
    } else {
      console.log('groups: 空');
    }

    console.log('\n--- teamsWithStats ---');
    if (data.teamsWithStats && data.teamsWithStats.length > 0) {
      console.log('teamsWithStats 数量:', data.teamsWithStats.length);
      console.log('teamsWithStats[0]:', JSON.stringify(data.teamsWithStats[0], null, 2));
    } else {
      console.log('teamsWithStats: 空');
    }

    console.log('\n--- employees (前2条) ---');
    if (data.employees && data.employees.length > 0) {
      console.log('employees 数量:', data.employees.length);
      console.log('employees[0]:', JSON.stringify(data.employees[0], null, 2));
    } else {
      console.log('employees: 空');
    }

  } catch (error) {
    console.error('请求失败:', error.response?.data || error.message);
  }
}

runTests();
