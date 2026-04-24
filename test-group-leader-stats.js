const axios = require('axios');

const BASE_URL = 'http://localhost:3003/api';
const loginData = {
  username: 'fanjie',
  password: '66668888'
};

async function testGroupLeaderStats() {
  try {
    console.log('=== 测试 /api/group-leader/stats 接口 ===');
    
    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, loginData);
    
    if (!loginResponse.data.success) {
      console.error('登录失败:', loginResponse.data.message);
      return;
    }
    
    const token = loginResponse.data.data.token;
    console.log('登录成功，获取到token');
    
    // 2. 访问 /api/group-leader/stats 接口
    console.log('\n2. 访问 /api/group-leader/stats 接口...');
    const statsResponse = await axios.get(`${BASE_URL}/group-leader/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        range: 'today'
      }
    });
    
    console.log('\n接口响应:');
    console.log('状态码:', statsResponse.status);
    console.log('数据:', JSON.stringify(statsResponse.data, null, 2));
    
    if (statsResponse.data.success) {
      console.log('\n✅ 接口正常返回数据');
    } else {
      console.log('\n❌ 接口返回错误:', statsResponse.data.message);
    }
    
  } catch (error) {
    console.error('\n❌ 测试过程中出现错误:');
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('错误信息:', error.response.data);
    } else {
      console.error('错误:', error.message);
    }
  }
}

testGroupLeaderStats();