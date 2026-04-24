const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

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

async function testApi(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`  ${name}: ${duration}ms`);
    return duration;
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`  ${name}: 失败 (${duration}ms) - ${error.message}`);
    return -1;
  }
}

async function runTests() {
  console.log('=== 组长/员工接口响应速度测试 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  const teamsResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader/teams`, { headers });
  const teamId = teamsResponse.data.data[0]?.id;

  console.log(`团队ID: ${teamId}\n`);

  console.log('\n1. 组长帐号列表: /admin/employee/group-leaders-simple');
  console.log('-----------------------------------');

  let totalTime = 0;
  for (let i = 0; i < 5; i++) {
    const duration = await testApi(`第${i+1}次`, async () => {
      const response = await axios.get(
        `${API_BASE_URL}/admin/employee/group-leaders-simple?teamId=${teamId}`,
        { headers }
      );
      return response.data;
    });
    if (duration > 0) totalTime += duration;
  }
  console.log(`  平均响应时间: ${Math.round(totalTime / 5)}ms`);

  console.log('\n2. 员工帐号列表: /admin/employee/employees-simple');
  console.log('-----------------------------------');

  totalTime = 0;
  for (let i = 0; i < 5; i++) {
    const duration = await testApi(`第${i+1}次`, async () => {
      const response = await axios.get(
        `${API_BASE_URL}/admin/employee/employees-simple?teamId=${teamId}`,
        { headers }
      );
      return response.data;
    });
    if (duration > 0) totalTime += duration;
  }
  console.log(`  平均响应时间: ${Math.round(totalTime / 5)}ms`);
}

runTests();
