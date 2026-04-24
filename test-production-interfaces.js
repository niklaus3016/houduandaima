const axios = require('axios');

// 生产环境API地址
const BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试账号：组长 fanjie，密码 11112222
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testProductionInterfaces() {
  try {
    console.log('=== 测试生产环境接口 ===\n');

    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, loginData);

    if (!loginResponse.data.success) {
      console.log('登录失败，退出测试');
      return;
    }

    const token = loginResponse.data.token;
    console.log('登录成功，获取到token\n');

    // 2. 测试组长统计数据接口
    console.log('2. 测试组长统计数据接口...');
    const startTime1 = Date.now();
    
    const statsResponse = await axios.get(`${BASE_URL}/group-leader/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        range: 'today'
      }
    });

    const endTime1 = Date.now();
    const responseTime1 = endTime1 - startTime1;

    console.log(`响应时间: ${responseTime1}ms`);
    console.log(`返回数据:`, JSON.stringify(statsResponse.data, null, 2));
    console.log('');

    // 3. 测试用户实时表现接口
    console.log('3. 测试用户实时表现接口...');
    const startTime2 = Date.now();
    
    const usersResponse = await axios.get(`${BASE_URL}/admin/dashboard/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        range: 'today',
        limit: 3,
        sortBy: 'earnings'
      }
    });

    const endTime2 = Date.now();
    const responseTime2 = endTime2 - startTime2;

    console.log(`响应时间: ${responseTime2}ms`);
    console.log(`返回数据:`, JSON.stringify(usersResponse.data, null, 2));
    console.log('');

    // 4. 测试组长提成统计接口
    console.log('4. 测试组长提成统计接口...');
    const startTime3 = Date.now();
    
    const commissionResponse = await axios.get(`${BASE_URL}/group-leader/commission-stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const endTime3 = Date.now();
    const responseTime3 = endTime3 - startTime3;

    console.log(`响应时间: ${responseTime3}ms`);
    console.log(`返回数据:`, JSON.stringify(commissionResponse.data, null, 2));
    console.log('');

    // 5. 测试缓存效果
    console.log('5. 测试缓存效果...');
    const startTime4 = Date.now();
    
    const cachedResponse = await axios.get(`${BASE_URL}/admin/dashboard/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        range: 'today',
        limit: 3,
        sortBy: 'earnings'
      }
    });

    const endTime4 = Date.now();
    const responseTime4 = endTime4 - startTime4;

    console.log(`第二次请求响应时间: ${responseTime4}ms`);
    console.log(`是否使用缓存: ${cachedResponse.data.cached || false}`);
    console.log('');

    console.log('=== 测试完成 ===');
    console.log(`组长统计数据接口响应时间: ${responseTime1}ms`);
    console.log(`用户实时表现接口响应时间: ${responseTime2}ms`);
    console.log(`组长提成统计接口响应时间: ${responseTime3}ms`);
    console.log(`用户实时表现接口（缓存）响应时间: ${responseTime4}ms`);

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testProductionInterfaces();
