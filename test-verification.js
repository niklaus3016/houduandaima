const axios = require('axios');

const baseURL = 'http://127.0.0.1:3003';
let token = '';
let financeToken = '';
let verificationId = '';

// 测试用户登录
async function testLogin() {
  try {
    console.log('测试用户登录...');
    const response = await axios.post(`${baseURL}/api/auth/login`, {
      employeeId: '2222',
      password: 'test'
    });
    console.log('登录成功:', response.data);
    token = response.data.token;
  } catch (error) {
    console.error('登录失败:', error.response?.data || error.message);
  }
}

// 测试财务登录（超管）
async function testFinanceLogin() {
  try {
    console.log('测试财务登录（超管）...');
    const response = await axios.post(`${baseURL}/api/auth/login`, {
      employeeId: 'admin',
      password: 'admin123456'
    });
    console.log('财务登录成功:', response.data);
    financeToken = response.data.token;
  } catch (error) {
    console.error('财务登录失败:', error.response?.data || error.message);
  }
}

// 测试获取用户金币信息
async function testGetUserGold() {
  try {
    console.log('测试获取用户金币信息...');
    const response = await axios.get(`${baseURL}/api/user/gold`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('获取金币信息成功:', response.data);
  } catch (error) {
    console.error('获取金币信息失败:', error.response?.data || error.message);
  }
}

// 测试提交核销申请
async function testSubmitVerification() {
  try {
    console.log('测试提交核销申请...');
    // 这里需要上传文件，使用 FormData
    const formData = new FormData();
    formData.append('amount', 100);
    // 注意：实际测试时需要替换为真实的文件
    // formData.append('invoiceFile', file);
    
    const response = await axios.post(`${baseURL}/api/verification/submit`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    console.log('提交核销申请成功:', response.data);
    verificationId = response.data.verificationId;
  } catch (error) {
    console.error('提交核销申请失败:', error.response?.data || error.message);
  }
}

// 测试获取核销记录
async function testGetVerificationRecords() {
  try {
    console.log('测试获取核销记录...');
    const response = await axios.get(`${baseURL}/api/verification/records`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      params: {
        page: 1,
        limit: 20
      }
    });
    console.log('获取核销记录成功:', response.data);
  } catch (error) {
    console.error('获取核销记录失败:', error.response?.data || error.message);
  }
}

// 测试获取待处理核销申请（财务）
async function testGetPendingVerifications() {
  try {
    console.log('测试获取待处理核销申请...');
    const response = await axios.get(`${baseURL}/api/verification/admin/pending`, {
      headers: {
        Authorization: `Bearer ${financeToken}`
      },
      params: {
        page: 1,
        limit: 20
      }
    });
    console.log('获取待处理核销申请成功:', response.data);
  } catch (error) {
    console.error('获取待处理核销申请失败:', error.response?.data || error.message);
  }
}

// 测试更新核销状态（财务）
async function testUpdateVerificationStatus() {
  if (!verificationId) {
    console.log('没有核销申请ID，跳过测试');
    return;
  }
  
  try {
    console.log('测试更新核销状态...');
    const response = await axios.put(`${baseURL}/api/verification/admin/${verificationId}/status`, {
      status: 'approved',
      remark: '审核通过'
    }, {
      headers: {
        Authorization: `Bearer ${financeToken}`
      }
    });
    console.log('更新核销状态成功:', response.data);
  } catch (error) {
    console.error('更新核销状态失败:', error.response?.data || error.message);
  }
}

// 测试获取核销统计（财务）
async function testGetVerificationStats() {
  try {
    console.log('测试获取核销统计...');
    const response = await axios.get(`${baseURL}/api/verification/admin/stats`, {
      headers: {
        Authorization: `Bearer ${financeToken}`
      }
    });
    console.log('获取核销统计成功:', response.data);
  } catch (error) {
    console.error('获取核销统计失败:', error.response?.data || error.message);
  }
}

// 运行所有测试
async function runTests() {
  console.log('开始测试手机核销模块API...\n');
  
  await testLogin();
  await testFinanceLogin();
  await testGetUserGold();
  // 注意：提交核销申请需要上传文件，实际测试时需要修改
  // await testSubmitVerification();
  await testGetVerificationRecords();
  await testGetPendingVerifications();
  // await testUpdateVerificationStatus();
  await testGetVerificationStats();
  
  console.log('\n测试完成！');
}

runTests();
