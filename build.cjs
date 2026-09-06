const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=__dirname;
const files=JSON.parse(fs.readFileSync(path.join(root,'build-order.json'),'utf8'));
const content='(() => {\n'+files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('')+'\n})();\n';
new vm.Script(content,{filename:'game.js'});
if(process.argv.includes('--check')){
 if(fs.readFileSync(path.join(root,'game.js'),'utf8')!==content)throw Error('game.js устарел: выполните node build.cjs');
 console.log('Сборка актуальна; JavaScript синтаксически корректен');
}else{fs.writeFileSync(path.join(root,'game.js'),content);console.log('Собран game.js')}
