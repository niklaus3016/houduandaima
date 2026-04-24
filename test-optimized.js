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

  console.log('\n=== 测试优化后的员工接口 ===\n');

  // 第一次请求（无缓存）
  console.log('1. 第一次请求（无缓存）:');
  const startTime1 = Date.now();
  const res1 = await axios.get(`${API_BASE_URL}/admin/employee/employees-simple?teamId=${teamId}`, {
    headers,
    timeout: 120000
  });
  const endTime1 = Date.now();
  console.log(`   响应时间: ${endTime1 - startTime1}ms`);
  console.log(`   消息: ${res1.data.message}`);
  console.log(`   员工数量: ${res1.data.data?.length || 0}`);

  if (res1.data.data && res1.data.data.length > 0) {
    const emp = res1.data.data[0];
    console.log('   第一个员工:');
    console.log(`     username: ${emp.username}`);
    console.log(`     teamName: ${emp.teamName}`);
    console.log(`     zeroEarningsDays: ${emp.zeroEarningsDays}`);
  }

  // 第二次请求（有缓存）
  console.log('\n2. 第二次请求（有缓存）:');
  const startTime2 = Date.now();
  const res2 = await axios.get(`${API_BASE_URL}/admin/employee/employees-simple?teamId=${teamId}`, {
    headers,
    timeout: 30000
  });
  const endTime2 = Date.now();
  console.log(`   响应时间: ${endTime2 - startTime2}ms`);
  console.log(`   消息: ${res2.data.message}`);
  console.log(`   员工数量: ${res2.data.data?.length || 0}`);

  console.log('\n3. 筛选统计:');
  const employees = res2.data.data || [];
  const normal = employees.filter(e => (e.zeroEarningsDays || 0) < 3).length;
  const threeToSeven = employees.filter(e => (e.zeroEarningsDays || 0) >= 3 && (e.zeroEarningsDays || 0) <= 7).length;
  const sevenToFifteen = employees.filter(e => (e.zeroEarningsDays || 0) > 7 && (e.zeroEarningsDays || 0) <= 15).length;
  const overFifteen = employees.filter(e => (e.zeroEarningsDays || 0) > 15).length;

  console.log(`   正常账号: ${normal}`);
  console.log(`   3-7天0收益: ${threeToSeven}`);
  console.log(`   7-15天0收益: ${sevenToFifteen}`);
  console.log(`   超过15天0收益: ${overFifteen}`);

  process.exit(0);
}

runTests().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
