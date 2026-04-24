const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3003';
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testResponseTime() {
  try {
    console.log('=== 测试组长统计接口响应时间 ===\n');
    
    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginStart = Date.now();
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, loginData);
    const loginTime = Date.now() - loginStart;
    console.log(`登录响应时间: ${loginTime}ms`);
    
    if (!loginResponse.data.success) {
      console.log('登录失败，退出测试');
      return;
    }
    
    const token = loginResponse.data.token;
    console.log('登录成功，获取到token\n');
    
    // 2. 测试不同时间范围的响应时间
    const ranges = ['today', 'yesterday', 'week', 'month'];
    
    for (const range of ranges) {
      console.log(`=== 测试 ${range} 数据响应时间 ===`);
      
      // 第一次请求（无缓存）
      const firstStart = Date.now();
      try {
        await axios.get(`${BASE_URL}/api/group-leader/stats`, {
          params: { range },
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const firstTime = Date.now() - firstStart;
        console.log(`第一次请求（无缓存）: ${firstTime}ms`);
      } catch (error) {
        console.log('第一次请求失败:', error.message);
      }
      
      // 第二次请求（有缓存）
      const secondStart = Date.now();
      try {
        await axios.get(`${BASE_URL}/api/group-leader/stats`, {
          params: { range },
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const secondTime = Date.now() - secondStart;
        console.log(`第二次请求（有缓存）: ${secondTime}ms`);
      } catch (error) {
        console.log('第二次请求失败:', error.message);
      }
      
      console.log('');
    }
    
    console.log('=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testResponseTime();
