const { uploadFile } = require('./services/storage');
const fs = require('fs');
const path = require('path');

// 测试文件上传功能
async function testFileUpload() {
  try {
    // 创建一个临时测试文件
    const testFilePath = path.join(__dirname, 'test-file.txt');
    fs.writeFileSync(testFilePath, 'This is a test file for upload');
    
    console.log('创建测试文件成功:', testFilePath);
    
    // 测试上传文件
    console.log('开始测试文件上传...');
    const objectName = `test-${Date.now()}.txt`;
    const result = await uploadFile(testFilePath, objectName);
    
    console.log('上传结果:', result);
    console.log('文件上传测试成功！');
    
    // 清理测试文件
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
      console.log('清理测试文件成功');
    }
    
  } catch (error) {
    console.error('测试文件上传失败:', error);
    
    // 清理测试文件
    const testFilePath = path.join(__dirname, 'test-file.txt');
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

// 运行测试
testFileUpload();