const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const { generateToken } = require('./utils/auth');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 测试员工列表接口 ===');
  
  // 获取管理员账号
  const admin = await Admin.findOne({ username: 'admin' });
  if (!admin) {
    console.error('管理员账号不存在');
    mongoose.disconnect();
    return;
  }
  
  console.log(`使用管理员: ${admin.username}`);
  
  // 生成认证令牌
  const token = generateToken(admin);
  console.log('认证令牌:', token);
  
  // 模拟API请求
  const axios = require('axios');
  
  try {
    // 测试员工列表接口
    const response = await axios.get('http://localhost:3007/api/admin/employee/list', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('\nAPI响应:');
    console.log('状态:', response.status);
    console.log('数据:', JSON.stringify(response.data, null, 2));
    
    // 检查是否包含phoneCount字段
    if (response.data.success && response.data.data.length > 0) {
      const firstEmployee = response.data.data[0];
      console.log('\n第一个员工数据:');
      console.log('- 员工ID:', firstEmployee.employeeId);
      console.log('- 姓名:', firstEmployee.realName);
      console.log('- 领取手机数:', firstEmployee.phoneCount);
      
      if ('phoneCount' in firstEmployee) {
        console.log('✅ phoneCount字段存在');
      } else {
        console.log('❌ phoneCount字段不存在');
      }
    }
  } catch (error) {
    console.error('API请求错误:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
  
  mongoose.disconnect();
});