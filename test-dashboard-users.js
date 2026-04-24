const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3003';
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testDashboardUsers() {
  try {
    console.log('=== 测试用户实时表现接口 ===\n');
    
    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, loginData);
    
    if (!loginResponse.data.success) {
      console.log('登录失败，退出测试');
      return;
    }
    
    const token = loginResponse.data.token;
    console.log('登录成功，获取到token\n');
    
    // 2. 测试用户实时表现接口
    console.log('2. 测试用户实时表现接口...');
    
    const response = await axios.get(`${BASE_URL}/api/admin/dashboard/users`, {
      params: {
        range: 'today'
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.data.success) {
      console.log('接口调用成功！');
      console.log('返回数据:');
      console.log(JSON.stringify(response.data, null, 2));
    } else {
      console.log('接口调用失败:', response.data.message);
    }
    
  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testDashboardUsers();
