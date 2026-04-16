const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function getLotterySettings() {
  console.log('========================================');
  console.log('获取彩票设置（包括奖金池注入百分比）');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/lottery/settings`);
    
    if (response.data.success) {
      console.log('✅ 获取彩票设置成功');
      console.log('奖金池注入百分比:', (response.data.data.poolPercentage * 100).toFixed(2) + '%');
      console.log('开奖时间:', response.data.data.drawTime);
      console.log('广告次数阈值:', response.data.data.adCountThreshold);
      console.log('是否启用:', response.data.data.enabled ? '是' : '否');
      console.log('一等奖比例:', (response.data.data.firstPrizePercentage * 100).toFixed(2) + '%');
      console.log('二等奖比例:', (response.data.data.secondPrizePercentage * 100).toFixed(2) + '%');
      console.log('三等奖比例:', (response.data.data.thirdPrizePercentage * 100).toFixed(2) + '%');
      console.log('一等奖数量:', response.data.data.firstPrizeCount);
      console.log('二等奖数量:', response.data.data.secondPrizeCount);
      console.log('三等奖数量:', response.data.data.thirdPrizeCount);
    } else {
      console.error('❌ 获取彩票设置失败:', response.data.message);
    }
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

getLotterySettings();
