const path = require('path');
const fs = require('fs');
const babylon = require('babylon');
const traverse = require('@babel/traverse').default;
const types = require('@babel/types');
const generator = require('@babel/generator').default;
const ejs = require('ejs');
const {SyncHook} = require('tapable');

class Compiler {
	constructor(config) {
		this.config = config;
		// 入口模块路径, "./index.js"
		this.entryId;
		// 保存所有的模块的依赖
		this.modules = {};
		// 路口路径
		this.entry = config.entry;
		// 工作路径
    this.root = process.cwd();
    this.assets = {}
    this.hooks = {
      run: new SyncHook(),
      beforeCompile: new SyncHook(),
      afterCompile: new SyncHook(),
      beforePlugins: new SyncHook(),
      afterPlugins: new SyncHook(),
      beforeEmit: new SyncHook(),
      afterEmit: new SyncHook(),
      done: new SyncHook()
    }
    this.hooks.beforePlugins.call()
    const plugins = this.config.plugins
    if (plugins) {
      plugins.forEach(plugin => {
        //这里的apply被重写过了, 其实是在事件流中注册
        plugin.apply(this)
      })
    }
    this.hooks.afterPlugins.call()
	}

	getSource(modulePath) {
    let content = fs.readFileSync(modulePath, 'utf8');
    let {rules} = this.config.module
    for (let i = 0; i < rules.length; i++) {
      const {test, use} = rules[i];
      let len = use.length - 1
      if (test.test(modulePath)) {
        const normalLoader = () => {
          let loader = require(use[len--]);
          content = loader(content)
          if (len >= 0) {
            normalLoader();
          }
        }
        normalLoader();
      }
    }
		return content
	}

  parse(source, parentPath) {
    // console.log(source, parentPath);
    // https://astexplorer.net/
    // AST解析语法树
    // babylon, 将源码转成ast
    // @babel/traverse, 将ast变成节点
    // @babel/types, 将节点替换
    // @babel/generator, 生成
    const dependencies = []
    const ast = babylon.parse(source);
    traverse(ast, {
      CallExpression(p) {
        const node = p.node
        if (node.callee.name === 'require') {
          // 替换require
          node.callee.name = '__webpack_require__'
          // console.log(node)
          let moduleName = node.arguments[0].value
          // 加上后缀
          moduleName = `${moduleName}${path.extname(moduleName) ? '' : '.js'}`
          moduleName = `./${path.join(parentPath, moduleName)}`
          dependencies.push(moduleName)
          node.arguments = [types.stringLiteral(moduleName)]
        }
      }
    })

    let sourceCode = generator(ast).code
    return {
      sourceCode,
      dependencies
    }
  }

	// 构建模块
	buildModule(modulePath, isEntry) {
		const source = this.getSource(modulePath);
		// 相对路径作为模块id
		const moduleName = `./${path.relative(this.root, modulePath)}`;

		// console.log('source', source);
    // console.log('moduleName', moduleName);

		if (isEntry) {
      // 保存入口
			this.entryId = moduleName;
		}
    // 将source的代码进行处理, 返回一个依赖列表
    const { sourceCode, dependencies } = this.parse(source, path.dirname(moduleName));
    this.modules[moduleName] = sourceCode
    console.log(sourceCode, dependencies)
    dependencies.forEach(des => {
      this.buildModule(path.resolve(this.root, des), false)
    })
  }
  
  emitFile() {
    // 输出目录
    const outputPath = path.resolve(this.config.output.path, this.config.output.filename);
    const templateStr = this.getSource(path.resolve(__dirname, 'main.ejs'))
    const code = ejs.render(templateStr, {entryId: this.entryId, modules: this.modules})
    this.assets[outputPath] = code
    fs.writeFileSync(outputPath, this.assets[outputPath])
  }
  
	run() {
    this.hooks.run.call()
    this.hooks.beforeCompile.call()
		// 创建模块的依赖关系
    this.buildModule(path.resolve(this.root, this.entry), true)
    this.hooks.afterCompile.call()
    console.log(this.modules)
    this.hooks.beforeEmit.call()
		// 发射一个打包后的文件
    this.emitFile()
    this.hooks.afterEmit.call()
    this.hooks.done.call()
	}
}

module.exports = Compiler;
