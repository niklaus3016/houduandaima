const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const { generateToken } = require('./utils/auth');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 测试更新员工phoneCount ===');
  
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
  
  // 模拟API请求
  const axios = require('axios');
  
  try {
    // 先获取员工列表，找一个员工ID
    const listResponse = await axios.get('http://localhost:3007/api/admin/employee/list', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (listResponse.data.success && listResponse.data.data.length > 0) {
      const employee = listResponse.data.data[0];
      console.log(`\n测试员工: ${employee.realName} (${employee.employeeId})`);
      console.log(`当前phoneCount: ${employee.phoneCount}`);
      
      // 更新phoneCount为5
      const updateResponse = await axios.put(`http://localhost:3007/api/admin/employee/${employee._id}`, {
        phoneCount: 5
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('\n更新API响应:');
      console.log('状态:', updateResponse.status);
      console.log('数据:', JSON.stringify(updateResponse.data, null, 2));
      
      // 再次获取员工列表，验证更新
      const verifyResponse = await axios.get('http://localhost:3007/api/admin/employee/list', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const updatedEmployee = verifyResponse.data.data.find(e => e._id === employee._id);
      console.log(`\n验证更新后的phoneCount: ${updatedEmployee.phoneCount}`);
      
      if (updatedEmployee.phoneCount === 5) {
        console.log('✅ phoneCount更新成功');
      } else {
        console.log('❌ phoneCount更新失败');
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