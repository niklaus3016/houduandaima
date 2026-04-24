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

async function runTests() {
  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  const teamsResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader/teams`, { headers });
  const teamId = teamsResponse.data.data[0]?.id;

  console.log('=== 测试两个员工接口 ===\n');
  
  console.log('1. 测试 /admin/employee/employees 接口:');
  const startTime1 = Date.now();
  const res1 = await axios.get(`${API_BASE_URL}/admin/employee/employees?teamId=${teamId}`, { headers });
  const endTime1 = Date.now();
  console.log(`响应时间: ${endTime1 - startTime1}ms`);
  console.log(`员工数量: ${res1.data.data?.length || 0}`);
  if (res1.data.data && res1.data.data.length > 0) {
    console.log(`第一个员工的 zeroEarningsDays: ${res1.data.data[0].zeroEarningsDays}`);
  }
  
  console.log('\n2. 测试 /admin/employee/employees-simple 接口:');
  const startTime2 = Date.now();
  const res2 = await axios.get(`${API_BASE_URL}/admin/employee/employees-simple?teamId=${teamId}`, { headers });
  const endTime2 = Date.now();
  console.log(`响应时间: ${endTime2 - startTime2}ms`);
  console.log(`员工数量: ${res2.data.data?.length || 0}`);
  if (res2.data.data && res2.data.data.length > 0) {
    console.log(`第一个员工的 zeroEarningsDays: ${res2.data.data[0].zeroEarningsDays}`);
  }
  
  console.log('\n3. 检查响应数据结构:');
  if (res2.data.data && res2.data.data.length > 0) {
    const firstEmployee = res2.data.data[0];
    console.log('所有字段:');
    Object.keys(firstEmployee).forEach(key => {
      console.log(`  ${key}: ${firstEmployee[key]}`);
    });
  }
}

runTests();
