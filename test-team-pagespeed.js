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
  console.log('=== cuidang 团队页面接口响应速度测试 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  console.log('\n1. 团队列表API: /admin/dashboard/team-leader/teams');
  console.log('-----------------------------------');

  let totalTime = 0;
  for (let i = 0; i < 5; i++) {
    const duration = await testApi(`第${i+1}次`, async () => {
      const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader/teams`, { headers });
      return response.data;
    });
    if (duration > 0) totalTime += duration;
  }
  console.log(`  平均响应时间: ${Math.round(totalTime / 5)}ms`);

  console.log('\n2. 团队成员列表API: today模式');
  console.log('-----------------------------------');

  const teamsResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader/teams`, { headers });
  const teams = teamsResponse.data.data || [];
  const teamId = teams[0]?.id;

  if (teamId) {
    console.log(`  团队ID: ${teamId}`);

    let todayTotal = 0;
    for (let i = 0; i < 5; i++) {
      const duration = await testApi(`第${i+1}次`, async () => {
        const response = await axios.get(
          `${API_BASE_URL}/admin/dashboard/team-leader/teams/${teamId}/members?mode=today`,
          { headers }
        );
        return response.data;
      });
      if (duration > 0) todayTotal += duration;
    }
    console.log(`  today模式平均响应时间: ${Math.round(todayTotal / 5)}ms`);

    console.log('\n3. 团队成员列表API: month模式');
    console.log('-----------------------------------');

    let monthTotal = 0;
    for (let i = 0; i < 5; i++) {
      const duration = await testApi(`第${i+1}次`, async () => {
        const response = await axios.get(
          `${API_BASE_URL}/admin/dashboard/team-leader/teams/${teamId}/members?mode=month`,
          { headers }
        );
        return response.data;
      });
      if (duration > 0) monthTotal += duration;
    }
    console.log(`  month模式平均响应时间: ${Math.round(monthTotal / 5)}ms`);
  } else {
    console.log('  未找到团队数据');
  }
}

runTests();
