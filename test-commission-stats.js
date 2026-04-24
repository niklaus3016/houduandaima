const axios = require('axios');
const { clear } = require('./utils/cache');

const BASE_URL = 'http://127.0.0.1:3003';
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testCommissionStats() {
  try {
    console.log('=== 测试组长提成统计接口 ===\n');

    // 0. 清除缓存
    console.log('0. 清除缓存...');
    clear();
    console.log('缓存已清除\n');

    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, loginData);

    if (!loginResponse.data.success) {
      console.log('登录失败，退出测试');
      return;
    }

    const token = loginResponse.data.token;
    console.log('登录成功，获取到token\n');

    // 2. 测试组长提成统计接口
    console.log('2. 测试组长提成统计接口...');

    const response = await axios.get(`${BASE_URL}/api/group-leader/commission-stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      console.log('接口调用成功！');
      console.log('返回数据:');
      console.log(JSON.stringify(response.data, null, 2));

      // 验证提成计算
      const { today, month, lastMonth, all, commissionRate } = response.data.data;
      console.log('\n=== 数据验证 ===');
      console.log(`提成比率: ${commissionRate}`);
      console.log(`今日: 收益=${today.totalEarnings.toFixed(2)}, 提成=${today.totalCommission.toFixed(2)}, 预期=${(today.totalEarnings * commissionRate).toFixed(2)}`);
      console.log(`本月: 收益=${month.totalEarnings.toFixed(2)}, 提成=${month.totalCommission.toFixed(2)}, 预期=${(month.totalEarnings * commissionRate).toFixed(2)}`);
      console.log(`上月: 收益=${lastMonth.totalEarnings.toFixed(2)}, 提成=${lastMonth.totalCommission.toFixed(2)}, 预期=${(lastMonth.totalEarnings * commissionRate).toFixed(2)}`);
      console.log(`累计: 收益=${all.totalEarnings.toFixed(2)}, 提成=${all.totalCommission.toFixed(2)}, 预期=${(all.totalEarnings * commissionRate).toFixed(2)}`);
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

testCommissionStats();
