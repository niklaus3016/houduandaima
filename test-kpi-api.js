const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const { generateToken } = require('./utils/auth');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 测试KPI接口 ===');
  
  // 获取管理员账号
  const admin = await Admin.findOne({ username: 'cuiding' }); // 鼎盛战队
  if (!admin) {
    console.error('管理员账号不存在');
    mongoose.disconnect();
    return;
  }
  
  console.log(`使用管理员: ${admin.username} (${admin.teamName})`);
  
  // 生成认证令牌
  const token = generateToken(admin);
  console.log('认证令牌:', token);
  
  // 测试KPI接口
  const testTeam = admin.teamName;
  console.log(`\n测试团队: ${testTeam}`);
  
  // 模拟API请求
  const axios = require('axios');
  
  try {
    // 测试带team参数的请求
    const response = await axios.get('http://localhost:3007/api/admin/dashboard/kpi', {
      params: {
        range: 'today',
        team: testTeam
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('\nAPI响应:');
    console.log('状态:', response.status);
    console.log('数据:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('API请求错误:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
  
  mongoose.disconnect();
});