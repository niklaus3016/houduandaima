const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3003';
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testCacheEffectiveness() {
  try {
    console.log('=== 测试用户实时表现接口 - 缓存效果 ===\n');

    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, loginData);

    if (!loginResponse.data.success) {
      console.log('登录失败，退出测试');
      return;
    }

    const token = loginResponse.data.token;
    console.log('登录成功，获取到token\n');

    // 2. 第一次请求（无缓存）
    console.log('2. 第一次请求（无缓存）...');
    const startTime1 = Date.now();
    
    const response1 = await axios.get(`${BASE_URL}/api/admin/dashboard/users`, {
      params: {
        range: 'today'
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const endTime1 = Date.now();
    const responseTime1 = endTime1 - startTime1;
    
    console.log(`第一次请求响应时间: ${responseTime1}ms`);
    console.log(`返回的员工数量: ${response1.data.data.length}`);
    console.log(`是否使用缓存: ${response1.data.cached || false}`);
    console.log('');

    // 3. 第二次请求（有缓存）
    console.log('3. 第二次请求（有缓存）...');
    const startTime2 = Date.now();
    
    const response2 = await axios.get(`${BASE_URL}/api/admin/dashboard/users`, {
      params: {
        range: 'today'
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const endTime2 = Date.now();
    const responseTime2 = endTime2 - startTime2;
    
    console.log(`第二次请求响应时间: ${responseTime2}ms`);
    console.log(`返回的员工数量: ${response2.data.data.length}`);
    console.log(`是否使用缓存: ${response2.data.cached || false}`);
    console.log('');

    // 4. 测试不同时间范围
    console.log('4. 测试不同时间范围...');
    const ranges = ['today', 'yesterday', 'week', 'month'];
    
    for (const range of ranges) {
      const startTime = Date.now();
      
      const response = await axios.get(`${BASE_URL}/api/admin/dashboard/users`, {
        params: {
          range: range
        },
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      console.log(`${range} 响应时间: ${responseTime}ms, 员工数量: ${response.data.data.length}, 缓存: ${response.data.cached || false}`);
    }

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testCacheEffectiveness();
