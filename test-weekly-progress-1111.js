const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试用户信息
const testUser = {
  employeeId: '1111',
  password: '123456'
};

async function testWeeklyProgress() {
  try {
    // 用户登录
    console.log('用户登录中...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, testUser);
    const token = loginResponse.data.token;
    console.log('登录成功\n');
    
    // 获取周目标进度
    console.log('查询用户1111的本周完成条数...');
    const progressResponse = await axios.get(`${API_BASE_URL}/weeklyBonus/progress`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('查询结果:');
    console.log(JSON.stringify(progressResponse.data, null, 2));
    
    // 提取关键信息
    const data = progressResponse.data.data;
    console.log('\n========================================');
    console.log('用户1111本周完成情况');
    console.log('========================================');
    console.log(`当前周: ${data.week}`);
    console.log(`目标条数: ${data.targetCount}`);
    console.log(`已完成条数: ${data.currentCount}`);
    console.log(`完成进度: ${data.progress}%`);
    console.log(`奖励金币: ${data.bonusCoins}`);
    console.log(`是否已领取: ${data.isClaimed ? '是' : '否'}`);
    console.log('========================================');
    
  } catch (error) {
    console.error('查询失败:', error.response?.data || error.message);
  }
}

testWeeklyProgress();
