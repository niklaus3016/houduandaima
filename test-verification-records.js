const axios = require('axios');

// 测试配置
const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const EMPLOYEE_ID = '1111';
const PASSWORD = '1111';

async function testVerificationRecords() {
  console.log('========================================');
  console.log('测试核销记录');
  console.log('========================================');

  try {
    // 步骤1：用户登录
    console.log('\n步骤1：用户登录');
    console.log('========================================');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      employeeId: EMPLOYEE_ID,
      password: PASSWORD
    });

    if (loginResponse.data.success) {
      console.log('✅ 用户登录成功');
      const token = loginResponse.data.token;

      // 步骤2：获取核销记录
      console.log('\n步骤2：获取最新核销记录');
      console.log('========================================');
      const recordsResponse = await axios.get(`${API_BASE_URL}/verification/records`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          limit: 10
        }
      });

      if (recordsResponse.data.success) {
        console.log('\n最新10条核销记录:');
        console.log('========================================');

        recordsResponse.data.data.records.forEach((record, index) => {
          console.log(`\n记录 ${index + 1}:`);
          console.log(`ID: ${record.id}`);
          console.log(`金额: ${record.amount}`);
          console.log(`状态: ${record.status}`);
          console.log(`日期: ${new Date(record.date).toLocaleString()}`);
          console.log(`发票URL: ${record.invoiceUrl}`);
          console.log(`支付宝姓名: ${record.alipayName}`);
          console.log(`支付宝账号: ${record.alipayAccount}`);
          console.log(`拒绝原因: ${record.rejectReason || '无'}`);
        });

        // 检查最新记录的发票URL是否为阿里云OSS链接
        const latestRecord = recordsResponse.data.data.records[0];
        if (latestRecord) {
          console.log('\n========================================');
          console.log('检查最新记录的发票URL:');
          console.log(`最新记录ID: ${latestRecord.id}`);
          console.log(`发票URL: ${latestRecord.invoiceUrl}`);
          
          if (latestRecord.invoiceUrl.includes('yinsiurl.oss-cn-hangzhou.aliyuncs.com')) {
            console.log('✅ 最新记录的发票已成功上传到阿里云OSS');
          } else if (latestRecord.invoiceUrl.startsWith('/uploads')) {
            console.log('⚠ 最新记录的发票使用了本地存储');
          } else {
            console.log('❌ 最新记录的发票URL格式不正确');
          }
        }

      } else {
        console.error('❌ 获取核销记录失败:', recordsResponse.data.message);
      }
    } else {
      console.error('❌ 登录失败:', loginResponse.data.message);
    }

  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

testVerificationRecords();
