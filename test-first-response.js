const axios = require('axios');

const API_BASE = 'http://127.0.0.1:3003/api';
const testUser = {
  username: 'fanjie',
  password: '11112222'
};

async function testFirstResponseTime() {
  console.log('=== 测试首次响应时间 ===\n');
  
  // 1. 登录获取token
  console.log('1. 测试登录');
  let token;
  try {
    const response = await axios.post(`${API_BASE}/admin/login`, testUser);
    if (response.data.success) {
      token = response.data.data.token;
      console.log('✅ 登录成功');
    } else {
      console.log('❌ 登录失败:', response.data.message);
      return;
    }
  } catch (error) {
    console.log('❌ 登录请求失败:', error.message);
    return;
  }
  
  // 2. 清除缓存（通过重启服务器模拟）
  console.log('\n2. 模拟清除缓存（重启服务器后测试）');
  console.log('请确保服务器已重启，缓存已清除');
  
  // 3. 测试 group-leader/stats 接口首次响应
  console.log('\n3. 测试 /api/group-leader/stats 首次响应');
  try {
    const startTime = Date.now();
    const response = await axios.get(`${API_BASE}/group-leader/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (response.data.success) {
      console.log(`✅ 响应时间: ${responseTime}ms`);
      console.log(`成员数量: ${response.data.data.memberCount}`);
    } else {
      console.log('❌ 接口失败:', response.data.message);
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message);
  }
  
  // 4. 测试 group-leader/commission-stats 接口首次响应
  console.log('\n4. 测试 /api/group-leader/commission-stats 首次响应');
  try {
    const startTime = Date.now();
    const response = await axios.get(`${API_BASE}/group-leader/commission-stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (response.data.success) {
      console.log(`✅ 响应时间: ${responseTime}ms`);
      console.log(`组名: ${response.data.data.groupName}`);
    } else {
      console.log('❌ 接口失败:', response.data.message);
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message);
  }
  
  console.log('\n=== 测试完成 ===');
}

testFirstResponseTime();
