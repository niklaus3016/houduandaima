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

async function testAPI(token, range, description) {
  try {
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log(`\n=== ${description} - ${range} ===\n`);
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(`${description} - ${range} 测试失败:`, error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('=== 测试团队长账号 cuiding 各时间范围返回值（本地测试） ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败，无法继续测试');
    return;
  }

  const ranges = ['today', 'yesterday', 'week', 'month'];

  for (const range of ranges) {
    await testAPI(token, range, '团队长 cuiding');
  }

  console.log('\n=== 测试完成 ===');
}

runTests();
