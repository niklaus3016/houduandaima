const { uploadFile } = require('./services/storage');
const fs = require('fs');
const path = require('path');

async function testUploadFile() {
  try {
    console.log('========================================');
    console.log('测试uploadFile函数');
    console.log('========================================');
    
    // 创建测试文件
    const testFilePath = path.join(__dirname, 'test-upload.txt');
    fs.writeFileSync(testFilePath, 'Test file for upload');
    console.log('✅ 测试文件创建成功');
    console.log('文件路径:', testFilePath);
    
    // 测试上传
    console.log('\n开始上传文件...');
    const objectName = 'test/test-upload.txt';
    
    try {
      const fileUrl = await uploadFile(testFilePath, objectName);
      console.log('✅ 上传成功');
      console.log('文件URL:', fileUrl);
    } catch (error) {
      console.error('❌ 上传失败:', error);
    }
    
    // 清理测试文件
    fs.unlinkSync(testFilePath);
    console.log('\n✅ 测试文件清理完成');
    
    console.log('\n========================================');
    console.log('测试完成');
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    
    // 清理测试文件
    const testFilePath = path.join(__dirname, 'test-upload.txt');
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

testUploadFile();
