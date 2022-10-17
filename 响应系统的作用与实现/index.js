// 1. 副作用函数-产生副作用影响的函数，包括全局变量修改，全局属性修改等
const data = {
  text: 'Hello Vue3'
}
// 3. 由于副作用函数名字是写死的，所以用 activeEffect 存储副作用函数
let activeEffect;

// 2. 对原始数据读取与设置
// 存放副作用函数的桶
let bucket = new Set();
let obj = new Proxy(data, {
  get(target, key) {
    if(!activeEffect) return;
    // 读取时将副作用函数放进桶里
    bucket.add(activeEffect);
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


// 匿名函数也能执行，不必依赖 effect 函数名
function effect(fn) {
  // 存储 副作用 函数
  activeEffect = fn;
  // 执行副作用函数
  fn();
}


// 匿名函数
effect(() => {
  console.log('run effect');
  document.body.innerText = obj.text
});

window.setTimeout(() => {
  obj.noExits = 'Change'
}, 1000);


