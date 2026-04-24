const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3003';

async function testFanjieStats() {
  try {
    console.log('========== 测试组长范洁数据 ==========\n');

    // 1. 登录获取token
    console.log('1. 尝试登录...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      employeeId: 'fanjie',
      password: '11112222'
    });

    console.log('登录响应:', JSON.stringify(loginResponse.data, null, 2));

    if (!loginResponse.data.success) {
      console.log('\n登录失败，退出测试');
      return;
    }

    const token = loginResponse.data.token;
    console.log('\n登录成功，获取到token\n');

    // 2. 测试不同时间范围的统计数据
    const ranges = ['today', 'yesterday', 'week', 'month'];
    
    for (const range of ranges) {
      console.log(`\n========== 测试 ${range} 数据 ==========`);
      
      try {
        const statsResponse = await axios.get(`${BASE_URL}/api/group-leader/stats`, {
          params: { range },
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        console.log('响应:', JSON.stringify(statsResponse.data, null, 2));
        
        if (statsResponse.data.success) {
          const data = statsResponse.data.data;
          console.log('\n统计摘要:');
          console.log(`组名: ${data.groupName}`);
          console.log(`组长: ${data.groupLeaderName}`);
          console.log(`成员数: ${data.memberCount}`);
          console.log(`活跃成员数: ${data.activeMemberCount}`);
          console.log(`总金币: ${data.totalGold}`);
          console.log(`总收益: ${data.totalEarnings.toFixed(4)} 元`);
          console.log(`总提成: ${data.totalCommission.toFixed(4)} 元`);
          console.log(`平均金币(活跃): ${data.avgGoldByActive.toFixed(2)}`);
          console.log(`平均金币(全部): ${data.avgGoldByAll.toFixed(2)}`);
        }
      } catch (error) {
        console.log('请求失败:', error.response?.data || error.message);
      }
    }

    console.log('\n========== 测试完成 ==========');

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testFanjieStats();
