const axios = require('axios');

const BASE_URL = 'http://localhost:3003/api';
const loginData = {
  username: 'fanjie',
  password: '66668888'
};

async function testLogin() {
  try {
    console.log('=== 测试登录 ===');
    const response = await axios.post(`${BASE_URL}/auth/login`, loginData);
    console.log('登录响应:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('登录错误:', error.message);
    if (error.response) {
      console.error('错误响应:', error.response.data);
    }
    return null;
  }
}

async function testGroupLeaderStats(token) {
  try {
    console.log('\n=== 测试 /api/group-leader/stats 接口 ===');
    const response = await axios.get(`${BASE_URL}/group-leader/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        range: 'today'
      }
    });
    console.log('接口响应:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('接口错误:', error.message);
    if (error.response) {
      console.error('错误响应:', error.response.data);
    }
    return null;
  }
}

async function runTests() {
  const loginResult = await testLogin();
  if (loginResult && loginResult.success) {
    const token = loginResult.data.token;
    await testGroupLeaderStats(token);
  }
}

runTests();