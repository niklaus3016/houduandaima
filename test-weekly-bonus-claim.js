const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testWeeklyBonusClaim() {
  try {
    // 1. 登录获取token
    console.log('用户登录中...');
    const loginResponse = await axios.post(`${API_BASE_URL}/employee/check`, {
      employeeId: '1111'
    });
    
    const token = loginResponse.data.token;
    console.log('登录成功\n');
    
    // 2. 查看周目标进度
    console.log('查看周目标进度...');
    const progressResponse = await axios.get(`${API_BASE_URL}/weeklyBonus/progress`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('周目标进度:');
    console.log(JSON.stringify(progressResponse.data, null, 2));
    console.log('');
    
    // 3. 如果未领取，先删除之前的领取记录
    if (progressResponse.data.data.isClaimed) {
      console.log('周奖励已领取，跳过领取测试');
    } else {
      console.log('领取周奖励...');
      const claimResponse = await axios.post(`${API_BASE_URL}/weeklyBonus/claim`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('领取周奖励返回数据:');
      console.log(JSON.stringify(claimResponse.data, null, 2));
      console.log('');
      
      // 检查是否包含ticketNumber和issueNumber字段
      const data = claimResponse.data.data;
      console.log('========================================');
      console.log('字段检查');
      console.log('========================================');
      console.log(`bonusCoins: ${data.bonusCoins}`);
      console.log(`ticketNumber: ${data.ticketNumber || '未返回'}`);
      console.log(`issueNumber: ${data.issueNumber || '未返回'}`);
      console.log('========================================');
    }
    
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

testWeeklyBonusClaim();
