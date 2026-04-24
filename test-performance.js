const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3003/api';
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testLogin() {
  try {
    console.log('=== 测试登录 ===');
    const response = await axios.post(`${BASE_URL}/auth/login`, loginData);
    if (response.data.success) {
      console.log('✅ 登录成功');
      return response.data.token;
    } else {
      console.error('❌ 登录失败:', response.data.message);
      return null;
    }
  } catch (error) {
    console.error('❌ 登录错误:', error.message);
    if (error.response) {
      console.error('错误响应:', error.response.data);
    }
    return null;
  }
}

async function testPerformance(token) {
  console.log('\n=== 测试性能优化 ===');
  
  // 测试第一次请求（无缓存）
  console.log('\n1. 测试第一次请求（无缓存）:');
  const startTime1 = Date.now();
  const response1 = await axios.get(`${BASE_URL}/group-leader/stats`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const endTime1 = Date.now();
  console.log(`✅ 响应时间: ${endTime1 - startTime1}ms`);
  console.log(`成员数量: ${response1.data.data.memberCount}`);
  
  // 测试第二次请求（有缓存）
  console.log('\n2. 测试第二次请求（有缓存）:');
  const startTime2 = Date.now();
  const response2 = await axios.get(`${BASE_URL}/group-leader/stats`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const endTime2 = Date.now();
  console.log(`✅ 响应时间: ${endTime2 - startTime2}ms`);
  
  // 测试 commission-stats 接口
  console.log('\n3. 测试 commission-stats 接口:');
  const startTime3 = Date.now();
  const response3 = await axios.get(`${BASE_URL}/group-leader/commission-stats`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const endTime3 = Date.now();
  console.log(`✅ 响应时间: ${endTime3 - startTime3}ms`);
  
  // 测试 commission-stats 接口（有缓存）
  console.log('\n4. 测试 commission-stats 接口（有缓存）:');
  const startTime4 = Date.now();
  const response4 = await axios.get(`${BASE_URL}/group-leader/commission-stats`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const endTime4 = Date.now();
  console.log(`✅ 响应时间: ${endTime4 - startTime4}ms`);
  
  // 测试不同时间范围
  console.log('\n5. 测试不同时间范围:');
  const ranges = ['today', 'week', 'month', 'all'];
  for (const range of ranges) {
    const startTime = Date.now();
    await axios.get(`${BASE_URL}/group-leader/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: { range }
    });
    const endTime = Date.now();
    console.log(`  ${range}: ${endTime - startTime}ms`);
  }
}

async function runTests() {
  console.log('=== 开始性能测试 ===');
  const token = await testLogin();
  if (token) {
    await testPerformance(token);
  }
  console.log('\n=== 测试完成 ===');
}

runTests();