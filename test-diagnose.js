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
    console.error(`登录失败:`, error.message);
    return null;
  }
}

async function runTests() {
  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  console.log('=== 诊断测试 ===\n');

  const teamsResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader/teams`, { headers });
  const teamId = teamsResponse.data.data[0]?.id;
  console.log('1. 团队列表: OK, teamId:', teamId);

  console.log('2. 测试简单ping接口...');
  try {
    const pingRes = await axios.get(`${API_BASE_URL}/admin/ping`, { headers, timeout: 10000 });
    console.log('   ping响应:', pingRes.data);
  } catch (e) {
    console.log('   ping失败(可能不存在):', e.message);
  }

  console.log('3. 等待员工接口响应(最多90秒)...');

  const startTime = Date.now();
  try {
    const employeesRes = await axios.get(
      `${API_BASE_URL}/admin/employee/employees-simple?teamId=${teamId}`,
      { headers, timeout: 90000 }
    );
    const endTime = Date.now();
    console.log(`\n响应时间: ${endTime - startTime}ms`);
    console.log(`员工数量: ${employeesRes.data.data?.length || 0}`);

    if (employeesRes.data.data && employeesRes.data.data.length > 0) {
      const emp = employeesRes.data.data[0];
      console.log('\n第一个员工:');
      console.log('  username:', emp.username);
      console.log('  teamName:', emp.teamName);
      console.log('  zeroEarningsDays:', emp.zeroEarningsDays);
    }
  } catch (error) {
    console.error('员工接口失败:', error.message);
    if (error.response) {
      console.error('状态:', error.response.status);
    }
  }

  process.exit(0);
}

runTests();
