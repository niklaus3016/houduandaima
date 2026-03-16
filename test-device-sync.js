const axios = require('axios');

// 测试环境的API地址
const API_BASE = 'http://localhost:3003/api';

// 测试用户信息
const testUser = {
  userId: 'test_user_123',
  employeeId: '1234',
  deviceId: 'test_device_123'
};

// 测试发放金币接口
async function testReward() {
  console.log('=== 测试发放金币接口 ===');
  try {
    const response = await axios.post(`${API_BASE}/gold/reward`, {
      userId: testUser.userId,
      employeeId: testUser.employeeId,
      ecpm: 1000,
      slotId: 'test_slot',
      deviceId: testUser.deviceId
    });
    
    console.log('✅ 发放金币成功:', response.data);
    return response.data.data;
  } catch (error) {
    console.error('❌ 发放金币失败:', error.message);
    return null;
  }
}

// 测试获取金币记录接口
async function testLog() {
  console.log('\n=== 测试获取金币记录接口 ===');
  try {
    const response = await axios.get(`${API_BASE}/gold/log`, {
      params: {
        userId: testUser.userId,
        deviceId: testUser.deviceId,
        limit: 10
      }
    });
    
    console.log('✅ 获取金币记录成功:', response.data);
    return response.data.data;
  } catch (error) {
    console.error('❌ 获取金币记录失败:', error.message);
    return null;
  }
}

// 测试今日金币统计接口
async function testTodayStats() {
  console.log('\n=== 测试今日金币统计接口 ===');
  try {
    const response = await axios.get(`${API_BASE}/gold/today-stats`, {
      params: {
        userId: testUser.userId
      }
    });
    
    console.log('✅ 获取今日金币统计成功:', response.data);
    return response.data.data;
  } catch (error) {
    console.error('❌ 获取今日金币统计失败:', error.message);
    return null;
  }
}

// 运行所有测试
async function runTests() {
  console.log('开始测试多设备数据同步接口...\n');
  
  await testReward();
  await testLog();
  await testTodayStats();
  
  console.log('\n测试完成！');
}

// 运行测试
runTests();