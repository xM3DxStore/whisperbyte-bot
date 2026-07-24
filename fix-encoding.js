const fs = require('fs');
try {
  let content;
  if (fs.existsSync('deploy_output.txt')) {
    content = fs.readFileSync('deploy_output.txt', 'utf16le');
    fs.writeFileSync('deploy_output_utf8.txt', content, 'utf8');
    console.log('Converted');
  } else {
    console.log('File not found');
  }
} catch (e) {
  console.log('Error', e);
}
