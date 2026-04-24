const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3003';
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testTopUsers() {
  try {
    console.log('=== 测试用户实时表现接口 - 各时间范围前三名 ===\n');

    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, loginData);

    if (!loginResponse.data.success) {
      console.log('登录失败，退出测试');
      return;
    }

    const token = loginResponse.data.token;
    console.log('登录成功，获取到token\n');

    // 2. 测试不同时间范围的前三名用户
    const ranges = ['today', 'yesterday', 'week', 'month'];
    
    for (const range of ranges) {
      console.log(`3. 测试 ${range} 时间范围...`);
      
      const response = await axios.get(`${BASE_URL}/api/admin/dashboard/users`, {
        params: {
          range: range,
          limit: 3,
          sortBy: 'earnings'
        },
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        console.log(`${range} 前三名用户:`);
        response.data.data.forEach((user, index) => {
          console.log(`${index + 1}. ${user.name} (${user.employeeId})`);
          console.log(`   观看次数: ${user.watched}`);
          console.log(`   收益: ${user.earnings.toFixed(2)}`);
          console.log(`   ECPM: ${user.ecpm}`);
          console.log(`   IP数量: ${user.ipCount}`);
          console.log(`   设备数量: ${user.deviceCount}`);
          console.log(`   注册天数: ${user.regDays}`);
          console.log(`   上级: ${user.superior}`);
          console.log(`   组: ${user.groupName}`);
          console.log('');
        });
      } else {
        console.log(`${range} 请求失败:`, response.data.message);
      }
      console.log('---\n');
    }

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testTopUsers();
