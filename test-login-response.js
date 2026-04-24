const axios = require('axios');

// 生产环境API地址
const BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试账号：组长 fanjie，密码 11112222
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testLoginResponse() {
  try {
    console.log('=== 测试登录响应结构 ===\n');

    // 1. 登录获取token
    console.log('1. 登录...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, loginData);

    console.log('完整响应:', JSON.stringify(loginResponse.data, null, 2));
    console.log('');
    console.log('loginResponse.data:', loginResponse.data);
    console.log('loginResponse.data.success:', loginResponse.data?.success);
    console.log('loginResponse.data.data:', loginResponse.data?.data);
    console.log('loginResponse.data.token:', loginResponse.data?.token);

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testLoginResponse();
