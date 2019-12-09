#!/usr/bin/env node

console.log("start");

/**
 * 1. 获得执行路径, 得到webpack.config.js
 */


const path = require('path');
const Compiler = require('./../lib/Compiler.js');
const config = require(path.resolve('webpack.config.js'));

const compiler = new Compiler(config);

compiler.run()


console.log("end");
