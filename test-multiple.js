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

  const teamsResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader/teams`, { headers });
  const teamId = teamsResponse.data.data[0]?.id;
  console.log('团队ID:', teamId);

  console.log('\n=== 多次测试响应时间 ===\n');

  for (let i = 1; i <= 5; i++) {
    console.log(`测试 ${i}:`);
    const startTime = Date.now();
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/employee/employees-simple?teamId=${teamId}`, {
        headers,
        timeout: 30000
      });
      const endTime = Date.now();
      console.log(`  响应时间: ${endTime - startTime}ms`);
      console.log(`  消息: ${res.data.message}`);
      console.log(`  员工数量: ${res.data.data?.length || 0}`);
      
      if (res.data.data && res.data.data.length > 0) {
        const emp = res.data.data[0];
        console.log(`  第一个员工 zeroEarningsDays: ${emp.zeroEarningsDays}`);
      }
    } catch (error) {
      console.error(`  请求失败:`, error.message);
    }
    console.log('');
    
    // 等待2秒再进行下一次测试
    if (i < 5) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  process.exit(0);
}

runTests().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
