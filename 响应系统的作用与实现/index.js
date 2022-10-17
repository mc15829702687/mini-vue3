// 1. 副作用函数-产生副作用影响的函数，包括全局变量修改，全局属性修改等
const data = {
  text: 'Hello Vue3'
}

// 2. 对原始数据读取与设置
let bucket = new Set();
let obj = new Proxy(data, {
  get(target, key) {
    // 读取时将副作用函数放进桶里
    bucket.add(effect);
    return target[key]
  },
  set(target, key, value) {
    // 先付新值
    target[key] = value;
    // 从桶里取出副作用函数并执行
    bucket && bucket.forEach(effectFn => effectFn());
    // 表示操作成功
    return true;
  }
})

function effect() {
  document.body.innerText = obj.text;
}

effect();

window.setTimeout(() => {
  obj.text = 'Change'
}, 1000)