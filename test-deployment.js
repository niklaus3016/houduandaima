const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3003/api';
const loginData = {
  employeeId: 'fanjie',
  password: '11112222'
};

async function testLogin() {
  try {
    console.log('=== 测试登录 ===');
    const response = await axios.post(`${BASE_URL}/auth/login`, loginData);
    if (response.data.success) {
      console.log('✅ 登录成功');
      return response.data.token;
    } else {
      console.error('❌ 登录失败:', response.data.message);
      return null;
    }
  } catch (error) {
    console.error('❌ 登录错误:', error.message);
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
    
    if (response.data.success) {
      console.log('✅ 接口返回成功');
      console.log('组名:', response.data.data.groupName);
      console.log('组长姓名:', response.data.data.groupLeaderName);
      console.log('成员数量:', response.data.data.memberCount);
      console.log('总成员数量:', response.data.data.totalMemberCount);
      console.log('总金币:', response.data.data.totalGold);
      console.log('总收益:', response.data.data.totalEarnings);
      console.log('总提成:', response.data.data.totalCommission);
      
      if (response.data.data.memberCount === 29) {
        console.log('✅ 员工数量正确（29个）');
      } else {
        console.error('❌ 员工数量错误，期望29个，实际', response.data.data.memberCount);
      }
    } else {
      console.error('❌ 接口返回错误:', response.data.message);
    }
  } catch (error) {
    console.error('❌ 接口错误:', error.message);
    if (error.response) {
      console.error('错误响应:', error.response.data);
    }
  }
}

async function testGroupLeaderCommissionStats(token) {
  try {
    console.log('\n=== 测试 /api/group-leader/commission-stats 接口 ===');
    const response = await axios.get(`${BASE_URL}/group-leader/commission-stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.data.success) {
      console.log('✅ 接口返回成功');
      console.log('今日数据:', response.data.data.today);
      console.log('本月数据:', response.data.data.month);
      console.log('上月数据:', response.data.data.lastMonth);
      console.log('累计数据:', response.data.data.all);
    } else {
      console.error('❌ 接口返回错误:', response.data.message);
    }
  } catch (error) {
    console.error('❌ 接口错误:', error.message);
    if (error.response) {
      console.error('错误响应:', error.response.data);
    }
  }
}

async function runTests() {
  console.log('=== 开始测试部署上线后的接口 ===');
  const token = await testLogin();
  if (token) {
    await testGroupLeaderStats(token);
    await testGroupLeaderCommissionStats(token);
  }
  console.log('\n=== 测试完成 ===');
}

runTests();