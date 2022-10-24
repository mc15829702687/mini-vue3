// 1. 副作用函数-产生副作用影响的函数，包括全局变量修改，全局属性修改等
const data = {
  text: 'Hello Vue3',
  ok: true,
  bar: true,
  foo: true
}
// 3. 由于副作用函数名字是写死的，所以用 activeEffect 存储副作用函数
let activeEffect;
// 副作用函数栈
let effectStack = [];

// 2. 对原始数据读取与设置
// 存放副作用函数的桶
let bucket = new WeakMap();
let obj = new Proxy(data, {
  get(target, key) {
    // 将副作用函数存储到 桶中
    track(target, key);

    return target[key]
  },
  set(target, key, value) {
    // 先付新值
    target[key] = value;
    // 取出桶中的副作用函数，并执行
    trigger(target, key);
    return true;
  }
})

// 在 get 函数内调用 track 函数追踪变化
function track(target, key) {
   // 如果没有 activeEffect 直接 return
   if(!activeEffect) return target[key];
   // 从桶里取出 depsMap,它也是一个 Map 类型，key => effects
   let depsMap = bucket.get(target);
   if(!depsMap) {
     bucket.set(target, (depsMap = new Map()))
   }
   // 再根据 key 从 depsMap 里取得 deps，它是一个 Set 类型的数据
   // 是一个副作用函数的集合
   let deps = depsMap.get(key);
   if(!deps) {
     depsMap.set(key, (deps = new Set()));
   }
   
    // 读取时将副作用函数放进桶里
    deps.add(activeEffect);
    // deps 就是一个与当前副作用函数相关联的依赖集合
    // 将其 push 到 activeEffect.deps 数组中
    activeEffect.deps.push(deps);
}


// 执行桶中的副作用函数
function trigger(target, key) {
 // 根据 target 从桶中取得 depsMap，它是：Key => effects
 const depsMap = bucket.get(target);
 if(!depsMap) return;
 // 取得副作用函数的集合
 const effects = depsMap.get(key)
//  防止死循环，原因：副作用函数还没遍历完，就被收集了
 const effectsToRun = new Set(effects);
 effectsToRun.forEach(effectFn => effectFn())
 // 从桶里取出副作用函数并执行
//  effects && effects.forEach(effectFn => effectFn());
}


// 匿名函数也能执行，不必依赖 effect 函数名
// 问题：分支切换会造成每次不必要的副作用函数执行
// 解决方法：每次副作用函数执行时，清除与之关联的依赖集合，副作用函数执行完后，重新建立连接

function effect(fn) {
  const effectFn = () => {
    // 调用 cleanup 完成清除工作
    cleanup(effectFn);
    // 设置为当前激活的 effect 函数
    activeEffect = effectFn;
    // 在副作用函数执行前，将当前副作用函数压入栈中
    effectStack.push(activeEffect);
    // 执行副作用函数
    fn();
    // 待副作用函数执行完后，将当前副作用函数弹出栈中，并把 activeEffect 还原为之前的值
    effectStack.pop();
    // 重新赋值
    activeEffect = effectStack[effectStack.length - 1];
  }

  // 用来存储所有与副作用函数相关联的依赖集合
  effectFn.deps = [];
  // 执行副作用函数
  effectFn();
}

function cleanup(effectFn) {
  for(let i = 0; i < effectFn.deps.length; i++) {
    // deps 是依赖集合
    const deps = effectFn.deps[i];
    // 将 effectFn 从依赖集合中移除
    deps.delete(effectFn);
  }
  // 最后将 effectFn.deps 置为空
  effectFn.deps.length = 0;
}


// // 匿名副作用函数
// effect(() => {
//   // 分支切换与cleanup
//   console.log('run effect');
//   document.body.innerText = obj.ok ? obj.text : 'not'
// });


// window.setTimeout(() => {
//   // 如果我们设置了一个不存在的属性，由于读取与设置机制，副作用函数依旧会执行两次
//   // 解决方法：自己的 key 对应，自己的副作用函数
//   obj.noExits = 'Change'
// }, 1000);

// window.setTimeout(() => {
//   obj.ok = false
// }, 2000);

// window.setTimeout(() => {
//   obj.text = 'Change'
// }, 3000);

// 4. 嵌套副作用函数，组件嵌套使用本质上就是嵌套的副作用函数
let temp1, temp2;
effect(function effectFn1() {
  console.log('run effectFn1');

  // 嵌套的副作用函数
  effect(function effectFn2() {
    console.log('run effectFn2');

    // 读取bar的值
    temp2 = obj.bar;
  })

  temp1 = obj.foo;
})

window.setTimeout(() => {
  // 只会走里层的副作用函数，原因是 activeEffect 只有一个，里层副作用函数会在执行时覆盖顶层的副作用函数
  // 解决方法：创建一个副作用函数栈，执行的时候存入栈中，执行完毕后剔除
  obj.foo = false;
}, 1000);

